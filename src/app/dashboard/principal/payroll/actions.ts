'use server'

import { randomUUID } from 'node:crypto'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { z } from 'zod'

import { getAuthContext } from '@/lib/auth'
import { resolveMonthRange, type ExternalTeacherPayStatus } from '@/lib/work-logs'
import {
  computeTeacherPayroll,
  fetchApprovedWorkLogsByTeacher,
  fetchExternalSubstituteEntries,
  fetchTeacherDirectory,
  loadPayrollRunDetails,
  loadPayrollRuns,
  upsertPayrollRun,
  type PayrollComputationResult,
} from '@/lib/payroll/queries'
import type {
  PayrollAdjustmentInput,
  TeacherPayrollAcknowledgement,
  TeacherPayrollRun,
  TeacherPayrollRunItem,
} from '@/lib/payroll/types'
import { fetchTeacherPayrollProfiles } from '@/lib/payroll/config'

type IncentiveInput = { label: string; amount: number }

const adjustmentSchema = z.object({
  label: z.string().min(1),
  amount: z.coerce.number(),
  isDeduction: z.coerce.boolean().optional(),
})

const externalPayStatusSchema = z.enum(['pending', 'completed'])

const requestSchema = z.object({
  teacherId: z.string().uuid('선생님 ID가 올바르지 않습니다.'),
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/u, '정산 대상 월 형식이 올바르지 않습니다.'),
  adjustments: z
    .string()
    .optional()
    .transform((value) => {
      if (!value) {
        return [] as PayrollAdjustmentInput[]
      }
      try {
        const parsed = JSON.parse(value) as unknown
        const result = z.array(adjustmentSchema).safeParse(parsed)
        if (!result.success) {
          return []
        }
        return result.data.map((item) => ({
          label: item.label,
          amount: item.amount,
          isDeduction: item.isDeduction ?? false,
        }))
      } catch (error) {
        console.error('[payroll] failed to parse adjustments', error)
        return []
      }
    }),
  incentives: z
    .string()
    .optional()
    .transform((value) => {
      if (!value) {
        return [] as IncentiveInput[]
      }
      try {
        const parsed = JSON.parse(value) as unknown
        if (!Array.isArray(parsed)) {
          return [] as IncentiveInput[]
        }
        const sanitized: IncentiveInput[] = []
        for (const entry of parsed) {
          if (!entry || typeof entry !== 'object') {
            continue
          }
          const record = entry as Record<string, unknown>
          const label = typeof record.label === 'string' ? record.label.trim() : ''
          const amountRaw = record.amount
          const amount =
            typeof amountRaw === 'number'
              ? amountRaw
              : Number.parseFloat(String(amountRaw ?? ''))
          if (!label || !Number.isFinite(amount) || amount <= 0) {
            continue
          }
          sanitized.push({ label, amount: Math.round(amount * 100) / 100 })
        }
        return sanitized
      } catch (error) {
        console.error('[payroll] failed to parse incentives', error)
        return [] as IncentiveInput[]
      }
    }),
  messageAppend: z.string().optional(),
  requestNote: z.string().optional(),
})

function toDateFromToken(token: string): Date {
  return new Date(`${token}T00:00:00+09:00`)
}

function formatDateToken(date: Date): string {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function splitAdjustments(adjustments: PayrollAdjustmentInput[]) {
  const additions: PayrollAdjustmentInput[] = []
  const deductions: PayrollAdjustmentInput[] = []
  for (const item of adjustments) {
    if (item.isDeduction) {
      deductions.push(item)
    } else {
      additions.push(item)
    }
  }
  return { additions, deductions }
}

function buildRunItems(runId: string, result: PayrollComputationResult): TeacherPayrollRunItem[] {
  const items: TeacherPayrollRunItem[] = []
  const nowIso = new Date().toISOString()
  const pushItem = (
    itemKind: 'earning' | 'deduction' | 'info',
    label: string,
    amount: number,
    metadata: Record<string, unknown> = {}
  ) => {
    items.push({
      id: randomUUID(),
      runId,
      itemKind,
      label,
      amount,
      metadata,
      orderIndex: items.length,
      createdAt: nowIso,
      updatedAt: nowIso,
    })
  }

  pushItem('earning', '근무급', result.breakdown.hourlyTotal)
  if (result.breakdown.weeklyHolidayAllowance > 0) {
    pushItem('earning', '주휴수당', result.breakdown.weeklyHolidayAllowance, {
      weeklyHolidayAllowanceHours: result.breakdown.weeklyHolidayAllowanceHours,
    })
  }
  if (result.breakdown.baseSalaryTotal > 0) {
    pushItem('earning', '기본급', result.breakdown.baseSalaryTotal)
  }

  const { additions, deductions } = splitAdjustments(result.breakdown.adjustments)
  for (const addition of additions) {
    pushItem('earning', `추가 · ${addition.label}`, addition.amount)
  }

  for (const deduction of result.breakdown.deductionDetails) {
    pushItem('deduction', `공제 · ${deduction.label}`, deduction.amount)
  }

  for (const deduction of deductions) {
    pushItem('deduction', `공제 · ${deduction.label}`, deduction.amount)
  }

  pushItem('info', '총 근무 시간', 0, {
    totalWorkHours: result.breakdown.totalWorkHours,
    weeklySummaries: result.breakdown.weeklySummaries,
  })

  return items
}

export async function previewPayrollAdjustments(formData: FormData) {
  const { profile } = await getAuthContext()

  if (!profile || profile.role !== 'principal') {
    return { error: '임금 계산 미리보기를 수행할 권한이 없습니다.' }
  }

  const parsed = requestSchema.safeParse(Object.fromEntries(formData.entries()))

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]
    return { error: firstIssue?.message ?? '입력한 정보를 다시 확인해주세요.' }
  }

  const input = parsed.data

  const monthRange = resolveMonthRange(input.month)
  const periodStart = toDateFromToken(monthRange.startDate)
  const periodEndExclusive = toDateFromToken(monthRange.endExclusiveDate)
  const periodEnd = new Date(periodEndExclusive.getTime() - 24 * 60 * 60 * 1000)
  const teacherDirectory = await fetchTeacherDirectory()
  const teacher = teacherDirectory[input.teacherId]

  if (!teacher) {
    return { error: '선택한 선생님 정보를 찾을 수 없습니다.' }
  }

  const payrollProfiles = await fetchTeacherPayrollProfiles([input.teacherId])
  const payrollProfile = payrollProfiles[input.teacherId]

  if (!payrollProfile) {
    return { error: '선생님 급여 프로필이 설정되지 않았습니다.' }
  }

  const workLogsMap = await fetchApprovedWorkLogsByTeacher(
    monthRange.startDate,
    monthRange.endExclusiveDate,
    [input.teacherId]
  )
  const workLogs = workLogsMap[input.teacherId] ?? []

  const baseAdjustments = input.adjustments ?? []
  const incentiveAdjustments = (input.incentives ?? []).map((item) => ({
    label: item.label,
    amount: item.amount,
    isDeduction: false,
  }))
  const combinedAdjustments = [...baseAdjustments, ...incentiveAdjustments]

  const computation = await computeTeacherPayroll(
    teacher,
    periodStart,
    periodEnd,
    workLogs,
    combinedAdjustments
  )

  if (!computation) {
    return { error: '급여 계산에 필요한 정보가 부족합니다.' }
  }

  let messagePreview = computation.message
  if (input.messageAppend && input.messageAppend.trim().length > 0) {
    messagePreview = `${messagePreview}

${input.messageAppend.trim()}`
  }

  return {
    success: true,
    message: messagePreview,
    breakdown: computation.breakdown,
  }
}

export async function savePayrollDraft(formData: FormData) {
  const { profile } = await getAuthContext()

  if (!profile || profile.role !== 'principal') {
    return { error: '임금 계산을 저장할 권한이 없습니다.' }
  }

  const parsed = requestSchema.safeParse(Object.fromEntries(formData.entries()))

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]
    return { error: firstIssue?.message ?? '입력한 정보를 다시 확인해주세요.' }
  }

  const input = parsed.data

  const monthRange = resolveMonthRange(input.month)
  const periodStart = toDateFromToken(monthRange.startDate)
  const periodEndExclusive = toDateFromToken(monthRange.endExclusiveDate)
  const periodEnd = new Date(periodEndExclusive.getTime() - 24 * 60 * 60 * 1000)
  const teacherDirectory = await fetchTeacherDirectory()
  const teacher = teacherDirectory[input.teacherId]

  if (!teacher) {
    return { error: '선택한 교직원 정보를 찾을 수 없습니다.' }
  }

  const payrollProfiles = await fetchTeacherPayrollProfiles([input.teacherId])
  const payrollProfile = payrollProfiles[input.teacherId]

  if (!payrollProfile) {
    return { error: '교직원 급여 프로필이 설정되지 않았습니다.' }
  }

  const workLogsMap = await fetchApprovedWorkLogsByTeacher(
    monthRange.startDate,
    monthRange.endExclusiveDate,
    [input.teacherId]
  )
  const workLogs = workLogsMap[input.teacherId] ?? []

  const baseAdjustments = input.adjustments ?? []
  const incentiveAdjustments = (input.incentives ?? []).map((item) => ({
    label: item.label,
    amount: item.amount,
    isDeduction: false,
  }))
  const combinedAdjustments = [...baseAdjustments, ...incentiveAdjustments]

  const computation = await computeTeacherPayroll(
    teacher,
    periodStart,
    periodEnd,
    workLogs,
    combinedAdjustments
  )

  if (!computation) {
    return { error: '급여 계산에 필요한 정보가 부족합니다.' }
  }

  const existingRuns = await loadPayrollRuns(
    monthRange.startDate,
    monthRange.endExclusiveDate,
    [input.teacherId]
  )
  const existingRun = existingRuns[0]
  const runId = existingRun?.id ?? randomUUID()

  const { additions, deductions } = splitAdjustments(computation.breakdown.adjustments)
  const additionTotal = additions.reduce((sum, item) => sum + item.amount, 0)
  const incentivesForMeta = (input.incentives ?? []).map((item) => ({
    label: item.label,
    amount: item.amount,
  }))

  let messagePreview = computation.message
  if (input.messageAppend && input.messageAppend.trim().length > 0) {
    messagePreview = `${messagePreview}\n\n${input.messageAppend.trim()}`
  }

  const nowIso = new Date().toISOString()

  const run: TeacherPayrollRun = {
    id: runId,
    teacherId: input.teacherId,
    payrollProfileId: payrollProfile.id,
    periodStart: monthRange.startDate,
    periodEnd: formatDateToken(periodEnd),
    contractType: payrollProfile.contractType,
    insuranceEnrolled: payrollProfile.insuranceEnrolled,
    hourlyTotal: computation.breakdown.hourlyTotal,
    weeklyHolidayAllowance: computation.breakdown.weeklyHolidayAllowance,
    baseSalaryTotal: computation.breakdown.baseSalaryTotal,
    adjustmentTotal: additionTotal,
    grossPay: computation.breakdown.grossPay,
    deductionsTotal: computation.breakdown.deductionsTotal,
    netPay: computation.breakdown.netPay,
    status: 'draft',
    messagePreview,
    meta: {
      totalWorkHours: computation.breakdown.totalWorkHours,
      weeklyHolidayAllowanceHours: computation.breakdown.weeklyHolidayAllowanceHours,
      weeklySummaries: computation.breakdown.weeklySummaries,
      requestNote: input.requestNote ?? null,
      adjustments: computation.breakdown.adjustments,
      deductionAdjustments: deductions,
      incentives: incentivesForMeta,
    },
    requestedBy: null,
    requestedAt: null,
    createdBy: existingRun?.createdBy ?? profile.id,
    createdAt: existingRun?.createdAt ?? nowIso,
    updatedAt: nowIso,
  }

  const items = buildRunItems(runId, computation)

  try {
    await upsertPayrollRun(run, items, null)
  } catch (error) {
    console.error('[payroll] draft upsert failed', error)
    return { error: '임시 저장 중 오류가 발생했습니다.' }
  }

  revalidatePath('/dashboard/principal/payroll')

  return {
    success: true,
    message: messagePreview,
    breakdown: computation.breakdown,
  }
}


export async function loadExternalSubstitutes(monthToken: string | null | undefined) {
  const { profile } = await getAuthContext()

  if (!profile || profile.role !== 'principal') {
    return { error: '외부 대타 현황을 확인할 권한이 없습니다.' }
  }

  const monthRange = resolveMonthRange(monthToken)

  const entries = await fetchExternalSubstituteEntries(monthRange.startDate, monthRange.endExclusiveDate)
  const totalHours = entries.reduce((sum, entry) => sum + (entry.externalTeacherHours ?? entry.workHours ?? 0), 0)
  const teacherCount = new Set(entries.map((entry) => entry.teacher?.id).filter(Boolean)).size

  return {
    success: true,
    entries: entries.map((entry) => ({
      id: entry.id,
      teacher: entry.teacher,
      workDate: entry.workDate,
      workHours: entry.workHours,
      notes: entry.notes,
      externalTeacherName: entry.externalTeacherName,
      externalTeacherPhone: entry.externalTeacherPhone,
      externalTeacherBank: entry.externalTeacherBank,
      externalTeacherAccount: entry.externalTeacherAccount,
      externalTeacherHours: entry.externalTeacherHours,
      payStatus: entry.payStatus,
    })),
    summary: {
      totalCount: entries.length,
      totalHours,
      teacherCount,
      monthLabel: monthRange.label,
    },
  }
}

const updateExternalPayStatusSchema = z.object({
  entryId: z.string().uuid('근무일지 ID가 올바르지 않습니다.'),
  status: externalPayStatusSchema,
})

export async function updateExternalSubstitutePayStatus(input: { entryId: string; status: ExternalTeacherPayStatus }) {
  const { profile } = await getAuthContext()

  if (!profile || profile.role !== 'principal') {
    return { error: '외부 대타 지급 상태를 변경할 권한이 없습니다.' }
  }

  const parsed = updateExternalPayStatusSchema.safeParse(input)

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]
    return { error: firstIssue?.message ?? '지급 상태 입력을 확인해주세요.' }
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('work_log_entries')
    .update({ external_teacher_pay_status: parsed.data.status })
    .eq('id', parsed.data.entryId)

  if (error) {
    console.error('[payroll] failed to update external pay status', error)
    return { error: '지급 상태를 업데이트하지 못했습니다.' }
  }

  revalidatePath('/dashboard/principal/payroll')

  return { success: true }
}

export async function requestPayrollConfirmation(formData: FormData) {
  const { profile } = await getAuthContext()

  if (!profile || profile.role !== 'principal') {
    return { error: '임금 관리를 진행할 권한이 없습니다.' }
  }

  const parsed = requestSchema.safeParse(Object.fromEntries(formData.entries()))

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]
    return { error: firstIssue?.message ?? '정산 요청 정보를 확인해주세요.' }
  }

  const input = parsed.data

  const monthRange = resolveMonthRange(input.month)
  const periodStart = toDateFromToken(monthRange.startDate)
  const periodEndExclusive = toDateFromToken(monthRange.endExclusiveDate)
  const periodEnd = new Date(periodEndExclusive.getTime() - 24 * 60 * 60 * 1000)
  const teacherDirectory = await fetchTeacherDirectory()
  const teacher = teacherDirectory[input.teacherId]

  if (!teacher) {
    return { error: '선택한 선생님 정보를 찾을 수 없습니다.' }
  }

  const payrollProfiles = await fetchTeacherPayrollProfiles([input.teacherId])
  const payrollProfile = payrollProfiles[input.teacherId]

  if (!payrollProfile) {
    return { error: '선생님 급여 프로필이 설정되지 않았습니다.' }
  }

  const workLogsMap = await fetchApprovedWorkLogsByTeacher(
    monthRange.startDate,
    monthRange.endExclusiveDate,
    [input.teacherId]
  )
  const workLogs = workLogsMap[input.teacherId] ?? []

  const baseAdjustments = input.adjustments ?? []
  const incentiveAdjustments = (input.incentives ?? []).map((item) => ({
    label: item.label,
    amount: item.amount,
    isDeduction: false,
  }))
  const combinedAdjustments = [...baseAdjustments, ...incentiveAdjustments]
  const incentivesForMeta = (input.incentives ?? []).map((item) => ({ label: item.label, amount: item.amount }))

  const computation = await computeTeacherPayroll(
    teacher,
    periodStart,
    periodEnd,
    workLogs,
    combinedAdjustments
  )

  if (!computation) {
    return { error: '급여 계산에 필요한 정보가 부족합니다.' }
  }

  const existingRuns = await loadPayrollRuns(
    monthRange.startDate,
    monthRange.endExclusiveDate,
    [input.teacherId]
  )
  const existingRun = existingRuns[0]
  const runId = existingRun?.id ?? randomUUID()

  let acknowledgement: TeacherPayrollAcknowledgement | null = null
  if (existingRun) {
    const details = await loadPayrollRunDetails(existingRun.id)
    acknowledgement = details.acknowledgement
  }

  const { additions, deductions } = splitAdjustments(computation.breakdown.adjustments)
  const additionTotal = additions.reduce((sum, item) => sum + item.amount, 0)

  let messagePreview = computation.message
  if (input.messageAppend && input.messageAppend.trim().length > 0) {
    messagePreview = `${messagePreview}\n\n${input.messageAppend.trim()}`
  }

  const nowIso = new Date().toISOString()
  const run: TeacherPayrollRun = {
    id: runId,
    teacherId: input.teacherId,
    payrollProfileId: payrollProfile.id,
    periodStart: monthRange.startDate,
    periodEnd: formatDateToken(periodEnd),
    contractType: payrollProfile.contractType,
    insuranceEnrolled: payrollProfile.insuranceEnrolled,
    hourlyTotal: computation.breakdown.hourlyTotal,
    weeklyHolidayAllowance: computation.breakdown.weeklyHolidayAllowance,
    baseSalaryTotal: computation.breakdown.baseSalaryTotal,
    adjustmentTotal: additionTotal,
    grossPay: computation.breakdown.grossPay,
    deductionsTotal: computation.breakdown.deductionsTotal,
    netPay: computation.breakdown.netPay,
    status: 'pending_ack',
    messagePreview,
    meta: {
      totalWorkHours: computation.breakdown.totalWorkHours,
      weeklyHolidayAllowanceHours: computation.breakdown.weeklyHolidayAllowanceHours,
      weeklySummaries: computation.breakdown.weeklySummaries,
      requestNote: input.requestNote ?? null,
      adjustments: computation.breakdown.adjustments,
      deductionAdjustments: deductions,
      incentives: incentivesForMeta,
    },
    requestedBy: profile.id,
    requestedAt: nowIso,
    createdBy: existingRun?.createdBy ?? profile.id,
    createdAt: existingRun?.createdAt ?? nowIso,
    updatedAt: nowIso,
  }

  const items = buildRunItems(runId, computation)

  const ack: TeacherPayrollAcknowledgement = {
    id: acknowledgement?.id ?? randomUUID(),
    runId,
    teacherId: input.teacherId,
    status: 'pending',
    requestedAt: nowIso,
    confirmedAt: null,
    note: acknowledgement?.note ?? null,
    updatedBy: profile.id,
    createdAt: acknowledgement?.createdAt ?? nowIso,
    updatedAt: nowIso,
  }

  try {
    await upsertPayrollRun(run, items, ack)
  } catch (error) {
    console.error('[payroll] upsert failed', error)
    return { error: '급여 정산 정보를 저장하는 중 문제가 발생했습니다.' }
  }

  revalidatePath('/dashboard/principal/payroll')
  revalidatePath('/dashboard/teacher/work-journal')

  return {
    success: true,
    runId,
    messagePreview,
    netPay: computation.breakdown.netPay,
  }
}

export async function completePayrollPayment(runId: string) {
  const { profile } = await getAuthContext()

  if (!profile || profile.role !== 'principal') {
    return { error: '급여 지급 완료 처리를 할 권한이 없습니다.' }
  }

  const admin = createAdminClient()

  // 1. Check current status (run + acknowledgement)
  const { data: run, error: fetchError } = await admin
    .from('teacher_payroll_runs')
    .select('status')
    .eq('id', runId)
    .single()

  if (fetchError || !run) {
    return { error: '급여 정산 정보를 찾을 수 없습니다.' }
  }

  // Check acknowledgement status as well
  const { data: ack } = await admin
    .from('teacher_payroll_acknowledgements')
    .select('status')
    .eq('run_id', runId)
    .maybeSingle()

  const isConfirmed = run.status === 'confirmed' || ack?.status === 'confirmed'

  if (!isConfirmed) {
    return { error: '확인 완료된 정산만 지급 완료 처리할 수 있습니다.' }
  }

  // 2. Update status to paid
  const { error: updateError } = await admin
    .from('teacher_payroll_runs')
    .update({ status: 'paid' })
    .eq('id', runId)

  if (updateError) {
    console.error('[payroll] failed to complete payment', updateError)
    return { error: '지급 완료 처리에 실패했습니다.' }
  }

  revalidatePath('/dashboard/principal/payroll')
  revalidatePath('/dashboard/teacher/work-journal')

  return { success: true }
}
