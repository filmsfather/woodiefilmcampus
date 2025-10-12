import { createAdminClient } from '@/lib/supabase/admin'
import { createClient as createServerSupabase } from '@/lib/supabase/server'
import {
  WORK_LOG_ENTRY_SELECT_FIELDS,
  mapWorkLogRow,
  summarizeTeacherProfile,
  type TeacherProfileSummary,
  type WorkLogEntry,
  type WorkLogReviewStatus,
  type WorkLogStatus,
  type WorkLogSubstituteType,
} from '@/lib/work-logs'

import type {
  PayrollCalculationBreakdown,
  PayrollAdjustmentInput,
  TeacherPayrollAcknowledgement,
  TeacherPayrollProfile,
  TeacherPayrollRun,
  TeacherPayrollRunItem,
} from './types'
import { calculatePayroll } from './calculate'
import { buildPayrollMessage, createMessageContext } from './messages'
import { fetchTeacherPayrollProfiles } from './config'

interface WorkLogRowWithTeacher {
  id: string
  teacher_id: string
  work_date: string
  status: WorkLogStatus
  work_hours: number | null
  substitute_type: WorkLogSubstituteType | null
  substitute_teacher_id: string | null
  external_teacher_name: string | null
  external_teacher_phone: string | null
  external_teacher_bank: string | null
  external_teacher_account: string | null
  external_teacher_hours: number | null
  notes: string | null
  review_status: WorkLogReviewStatus
  review_note: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
  teacher?: {
    id: string | null
    name: string | null
    email: string | null
  } | null
}

interface TeacherRow {
  id: string
  name: string | null
  email: string | null
}

interface TeacherPayrollRunRow {
  id: string
  teacher_id: string
  payroll_profile_id: string | null
  period_start: string
  period_end: string
  contract_type: 'employee' | 'freelancer' | 'none'
  insurance_enrolled: boolean
  hourly_total: string | number
  weekly_holiday_allowance: string | number
  base_salary_total: string | number
  adjustment_total: string | number
  gross_pay: string | number
  deductions_total: string | number
  net_pay: string | number
  status: 'draft' | 'pending_ack' | 'confirmed'
  message_preview: string | null
  meta: Record<string, unknown> | null
  requested_by: string | null
  requested_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

interface TeacherPayrollRunItemRow {
  id: string
  run_id: string
  item_kind: 'earning' | 'deduction' | 'info'
  label: string
  amount: string | number
  metadata: Record<string, unknown> | null
  order_index: number
  created_at: string
  updated_at: string
}

interface TeacherPayrollAckRow {
  id: string
  run_id: string
  teacher_id: string
  status: 'pending' | 'confirmed'
  requested_at: string
  confirmed_at: string | null
  note: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

export interface PayrollComputationResult {
  breakdown: PayrollCalculationBreakdown
  payrollProfile: TeacherPayrollProfile
  teacher: TeacherProfileSummary
  message: string
}

function parseNumeric(value: string | number | null): number {
  if (value === null) {
    return 0
  }
  if (typeof value === 'number') {
    return value
  }
  const parsed = Number.parseFloat(value)
  return Number.isNaN(parsed) ? 0 : parsed
}

function mapRun(row: TeacherPayrollRunRow): TeacherPayrollRun {
  return {
    id: row.id,
    teacherId: row.teacher_id,
    payrollProfileId: row.payroll_profile_id,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    contractType: row.contract_type,
    insuranceEnrolled: row.insurance_enrolled,
    hourlyTotal: parseNumeric(row.hourly_total),
    weeklyHolidayAllowance: parseNumeric(row.weekly_holiday_allowance),
    baseSalaryTotal: parseNumeric(row.base_salary_total),
    adjustmentTotal: parseNumeric(row.adjustment_total),
    grossPay: parseNumeric(row.gross_pay),
    deductionsTotal: parseNumeric(row.deductions_total),
    netPay: parseNumeric(row.net_pay),
    status: row.status,
    messagePreview: row.message_preview,
    meta: row.meta ?? {},
    requestedBy: row.requested_by,
    requestedAt: row.requested_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapRunItem(row: TeacherPayrollRunItemRow): TeacherPayrollRunItem {
  return {
    id: row.id,
    runId: row.run_id,
    itemKind: row.item_kind,
    label: row.label,
    amount: parseNumeric(row.amount),
    metadata: row.metadata ?? {},
    orderIndex: row.order_index,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapAck(row: TeacherPayrollAckRow): TeacherPayrollAcknowledgement {
  return {
    id: row.id,
    runId: row.run_id,
    teacherId: row.teacher_id,
    status: row.status,
    requestedAt: row.requested_at,
    confirmedAt: row.confirmed_at,
    note: row.note,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function fetchApprovedWorkLogsByTeacher(
  startDate: string,
  endExclusiveDate: string,
  teacherIds?: string[]
): Promise<Record<string, WorkLogEntry[]>> {
  const supabase = createAdminClient()

  const selectFields = `
    ${WORK_LOG_ENTRY_SELECT_FIELDS},
    teacher:profiles!work_log_entries_teacher_id_fkey(id, name, email)
  `

  let query = supabase
    .from('work_log_entries')
    .select(selectFields)
    .gte('work_date', startDate)
    .lt('work_date', endExclusiveDate)
    .eq('review_status', 'approved')

  if (teacherIds && teacherIds.length > 0) {
    query = query.in('teacher_id', teacherIds)
  }

  const { data, error } = await query.returns<WorkLogRowWithTeacher[]>()

  if (error) {
    console.error('[payroll] failed to fetch approved work logs', error)
    return {}
  }

  return (data ?? []).reduce<Record<string, WorkLogEntry[]>>((acc, row) => {
    const entry = mapWorkLogRow(row)
    if (!acc[entry.teacherId]) {
      acc[entry.teacherId] = []
    }
    acc[entry.teacherId].push(entry)
    return acc
  }, {})
}

export async function fetchTeacherDirectory(): Promise<Record<string, TeacherProfileSummary>> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('profiles')
    .select('id, name, email')
    .eq('role', 'teacher')
    .eq('status', 'approved')

  if (error) {
    console.error('[payroll] failed to fetch teacher directory', error)
    return {}
  }

  return (data ?? []).reduce<Record<string, TeacherProfileSummary>>((acc, teacher: TeacherRow) => {
    acc[teacher.id] = summarizeTeacherProfile(teacher)
    return acc
  }, {})
}

export async function computeTeacherPayroll(
  teacher: TeacherProfileSummary,
  startDate: Date,
  endDate: Date,
  workLogs: WorkLogEntry[],
  adjustments?: PayrollAdjustmentInput[]
): Promise<PayrollComputationResult | null> {
  const profiles = await fetchTeacherPayrollProfiles([teacher.id])
  const payrollProfile = profiles[teacher.id]

  if (!payrollProfile) {
    return null
  }

  const breakdown = calculatePayroll({
    teacherId: teacher.id,
    teacherName: teacher.name ?? teacher.email ?? null,
    periodStart: startDate,
    periodEnd: endDate,
    hourlyRate: payrollProfile.hourlyRate,
    baseSalaryAmount: payrollProfile.baseSalaryAmount,
    contractType: payrollProfile.contractType,
    insuranceEnrolled: payrollProfile.insuranceEnrolled,
    workLogs,
    adjustments,
  })

  const periodLabel = `${startDate.getFullYear()}년 ${startDate.getMonth() + 1}월`
  const message = buildPayrollMessage(
    createMessageContext(teacher.name ?? teacher.email ?? null, periodLabel, breakdown)
  )

  return {
    breakdown,
    payrollProfile,
    teacher,
    message,
  }
}

export async function loadPayrollRuns(
  startDate: string,
  endDate: string,
  teacherIds?: string[]
): Promise<TeacherPayrollRun[]> {
  const supabase = createAdminClient()
  let query = supabase
    .from('teacher_payroll_runs')
    .select('*')
    .gte('period_start', startDate)
    .lte('period_end', endDate)

  if (teacherIds && teacherIds.length > 0) {
    query = query.in('teacher_id', teacherIds)
  }

  const { data, error } = await query.returns<TeacherPayrollRunRow[]>()

  if (error) {
    console.error('[payroll] failed to load payroll runs', error)
    return []
  }

  return (data ?? []).map(mapRun)
}

export async function loadPayrollRunDetails(runId: string): Promise<{
  run: TeacherPayrollRun | null
  items: TeacherPayrollRunItem[]
  acknowledgement: TeacherPayrollAcknowledgement | null
}> {
  const supabase = createAdminClient()
  const [{ data: runRows, error: runError }, { data: itemRows, error: itemsError }, { data: ackRows, error: ackError }] =
    await Promise.all([
      supabase.from('teacher_payroll_runs').select('*').eq('id', runId).limit(1).returns<TeacherPayrollRunRow[]>(),
      supabase
        .from('teacher_payroll_run_items')
        .select('*')
        .eq('run_id', runId)
        .order('order_index', { ascending: true })
        .returns<TeacherPayrollRunItemRow[]>(),
      supabase
        .from('teacher_payroll_acknowledgements')
        .select('*')
        .eq('run_id', runId)
        .limit(1)
        .returns<TeacherPayrollAckRow[]>(),
    ])

  if (runError) {
    console.error('[payroll] failed to fetch payroll run', runError)
  }
  if (itemsError) {
    console.error('[payroll] failed to fetch payroll run items', itemsError)
  }
  if (ackError) {
    console.error('[payroll] failed to fetch payroll acknowledgement', ackError)
  }

  return {
    run: runRows?.[0] ? mapRun(runRows[0]) : null,
    items: (itemRows ?? []).map(mapRunItem),
    acknowledgement: ackRows?.[0] ? mapAck(ackRows[0]) : null,
  }
}

export async function upsertPayrollRun(
  run: TeacherPayrollRun,
  items: TeacherPayrollRunItem[],
  acknowledgement: TeacherPayrollAcknowledgement | null
) {
  const supabase = createServerSupabase()

  const { error: runError } = await supabase.from('teacher_payroll_runs').upsert(
    {
      id: run.id,
      teacher_id: run.teacherId,
      payroll_profile_id: run.payrollProfileId,
      period_start: run.periodStart,
      period_end: run.periodEnd,
      contract_type: run.contractType,
      insurance_enrolled: run.insuranceEnrolled,
      hourly_total: run.hourlyTotal,
      weekly_holiday_allowance: run.weeklyHolidayAllowance,
      base_salary_total: run.baseSalaryTotal,
      adjustment_total: run.adjustmentTotal,
      gross_pay: run.grossPay,
      deductions_total: run.deductionsTotal,
      net_pay: run.netPay,
      status: run.status,
      message_preview: run.messagePreview,
      meta: run.meta,
      requested_by: run.requestedBy,
      requested_at: run.requestedAt,
      created_by: run.createdBy,
    },
    { onConflict: 'id' }
  )

  if (runError) {
    console.error('[payroll] failed to upsert payroll run', runError)
    throw new Error('급여 정산 정보를 저장하지 못했습니다.')
  }

  const { error: deleteItemsError } = await supabase
    .from('teacher_payroll_run_items')
    .delete()
    .eq('run_id', run.id)

  if (deleteItemsError) {
    console.error('[payroll] failed to reset payroll run items', deleteItemsError)
    throw new Error('급여 정산 항목을 초기화하지 못했습니다.')
  }

  if (items.length > 0) {
    const { error: insertItemsError } = await supabase.from('teacher_payroll_run_items').insert(
      items.map((item, index) => ({
        id: item.id,
        run_id: run.id,
        item_kind: item.itemKind,
        label: item.label,
        amount: item.amount,
        metadata: item.metadata,
        order_index: index,
      }))
    )

    if (insertItemsError) {
      console.error('[payroll] failed to insert payroll run items', insertItemsError)
      throw new Error('급여 정산 항목을 저장하지 못했습니다.')
    }
  }

  if (acknowledgement) {
    const { error: ackError } = await supabase.from('teacher_payroll_acknowledgements').upsert(
      {
        id: acknowledgement.id,
        run_id: run.id,
        teacher_id: acknowledgement.teacherId,
        status: acknowledgement.status,
        requested_at: acknowledgement.requestedAt,
        confirmed_at: acknowledgement.confirmedAt,
        note: acknowledgement.note,
        updated_by: acknowledgement.updatedBy,
      },
      { onConflict: 'run_id' }
    )

    if (ackError) {
      console.error('[payroll] failed to upsert acknowledgement', ackError)
      throw new Error('확인 요청 정보를 저장하지 못했습니다.')
    }
  }
}
