import { requireAuthForDashboard } from '@/lib/auth'
import DateUtil from '@/lib/date-util'
import { resolveMonthRange } from '@/lib/work-logs'
import { fetchTeacherPayrollProfiles } from '@/lib/payroll/config'
import {
  fetchApprovedWorkLogsByTeacher,
  fetchTeacherDirectory,
  loadPayrollRunDetails,
  loadPayrollRuns,
} from '@/lib/payroll/queries'
import { calculatePayroll } from '@/lib/payroll/calculate'
import { buildPayrollMessage, createMessageContext } from '@/lib/payroll/messages'
import type {
  PayrollAdjustmentInput,
  PayrollCalculationBreakdown,
  TeacherPayrollAcknowledgement,
  TeacherPayrollProfile,
  TeacherPayrollRun,
} from '@/lib/payroll/types'
import type { TeacherProfileSummary } from '@/lib/work-logs'
import { PrincipalPayrollClient } from '@/components/dashboard/principal/payroll/PrincipalPayrollClient'


interface PrincipalPayrollTeacherEntry {
  teacher: TeacherProfileSummary
  payrollProfile: TeacherPayrollProfile
  breakdown: PayrollCalculationBreakdown
  run: TeacherPayrollRun | null
  acknowledgement: TeacherPayrollAcknowledgement | null
  messagePreview: string
  adjustments: PayrollAdjustmentInput[]
  requestNote: string | null
}

function normalizeAdjustments(value: unknown): PayrollAdjustmentInput[] {
  if (!Array.isArray(value)) {
    return []
  }
  const results: PayrollAdjustmentInput[] = []
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') {
      continue
    }
    const record = entry as Record<string, unknown>
    const label = typeof record.label === 'string' ? record.label : null
    if (!label) {
      continue
    }
    const rawAmount = record.amount
    const amount = typeof rawAmount === 'number' ? rawAmount : Number.parseFloat(String(rawAmount))
    if (Number.isNaN(amount)) {
      continue
    }
    const isDeduction = Boolean(record.isDeduction)
    results.push({ label, amount, isDeduction })
  }
  return results
}

export default async function PrincipalPayrollPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireAuthForDashboard('principal')

  const searchParams = await props.searchParams
  const monthTokenParam = typeof searchParams?.month === 'string' ? searchParams.month : null
  const teacherFilter = typeof searchParams?.teacher === 'string' ? searchParams.teacher : null

  const monthRange = resolveMonthRange(monthTokenParam)
  const monthToken = monthRange.startDate.slice(0, 7)
  const periodStart = DateUtil.toUTCDate(monthRange.startDate)
  const periodEnd = DateUtil.addDays(DateUtil.toUTCDate(monthRange.endExclusiveDate), -1)

  const teacherDirectory = await fetchTeacherDirectory()
  const payrollProfiles = await fetchTeacherPayrollProfiles()

  const allTeacherIdsWithProfile = Object.keys(payrollProfiles).filter((id) => teacherDirectory[id])
  const selectedTeacherIds = teacherFilter
    ? allTeacherIdsWithProfile.includes(teacherFilter)
      ? [teacherFilter]
      : []
    : allTeacherIdsWithProfile

  const workLogsByTeacher = selectedTeacherIds.length
    ? await fetchApprovedWorkLogsByTeacher(monthRange.startDate, monthRange.endExclusiveDate, selectedTeacherIds)
    : {}

  const payrollRuns = selectedTeacherIds.length
    ? await loadPayrollRuns(monthRange.startDate, monthRange.endExclusiveDate, selectedTeacherIds)
    : []

  const teacherEntries: PrincipalPayrollTeacherEntry[] = []

  for (const teacherId of selectedTeacherIds) {
    const teacherSummary = teacherDirectory[teacherId]
    const payrollProfile = payrollProfiles[teacherId]

    if (!teacherSummary || !payrollProfile) {
      continue
    }

    const teacherWorkLogs = workLogsByTeacher[teacherId] ?? []

    const matchingRuns = payrollRuns
      .filter((run) => run.teacherId === teacherId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    const latestRun = matchingRuns[0] ?? null

    let acknowledgement: TeacherPayrollAcknowledgement | null = null
    if (latestRun) {
      const details = await loadPayrollRunDetails(latestRun.id)
      acknowledgement = details.acknowledgement
    }

    const runMeta = latestRun?.meta as Record<string, unknown> | undefined
    const adjustments = normalizeAdjustments(runMeta ? runMeta['adjustments'] : undefined)

    const breakdown = calculatePayroll({
      teacherId,
      teacherName: teacherSummary.name ?? teacherSummary.email ?? null,
      periodStart,
      periodEnd,
      hourlyRate: payrollProfile.hourlyRate,
      baseSalaryAmount: payrollProfile.baseSalaryAmount,
      contractType: payrollProfile.contractType,
      insuranceEnrolled: payrollProfile.insuranceEnrolled,
      workLogs: teacherWorkLogs,
      adjustments,
    })

    const messagePreview =
      latestRun?.messagePreview ??
      buildPayrollMessage(
        createMessageContext(
          teacherSummary.name ?? teacherSummary.email ?? null,
          monthRange.label,
          payrollProfile.contractType,
          breakdown
        )
      )

    const requestNoteRaw = runMeta ? runMeta['requestNote'] : undefined
    const requestNote = typeof requestNoteRaw === 'string' ? requestNoteRaw : null

    teacherEntries.push({
      teacher: teacherSummary,
      payrollProfile,
      breakdown,
      run: latestRun,
      acknowledgement,
      messagePreview,
      adjustments,
      requestNote,
    })
  }

  const teacherOptions = allTeacherIdsWithProfile.map((id) => {
    const teacher = teacherDirectory[id]
    const label = teacher?.name ?? teacher?.email ?? '이름 미등록'
    return { id, label }
  })

  return (
    <PrincipalPayrollClient
      monthToken={monthToken}
      monthLabel={monthRange.label}
      teachers={teacherEntries}
      teacherOptions={teacherOptions}
      selectedTeacherId={teacherFilter && teacherOptions.some((option) => option.id === teacherFilter) ? teacherFilter : null}
    />
  )
}
