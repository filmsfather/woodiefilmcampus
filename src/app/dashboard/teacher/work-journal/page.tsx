import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { requireAuthForDashboard } from '@/lib/auth'
import { createClient as createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  WORK_LOG_ENTRY_SELECT_FIELDS,
  mapWorkLogRow,
  resolveMonthRange,
  summarizeTeacherProfile,
  type TeacherProfileSummary,
  type WorkLogEntryRow,
} from '@/lib/work-logs'
import type { WeeklyWorkSummary } from '@/lib/payroll/types'
import { TeacherPayrollCard } from '@/components/dashboard/teacher/work-journal/TeacherPayrollCard'
import { WorkJournalClient } from '@/components/dashboard/teacher/work-journal/WorkJournalClient'

interface TeacherWorkJournalPageProps {
  searchParams?: Record<string, string | string[] | undefined>
}

interface TeacherPayrollCardData {
  runId: string
  status: 'draft' | 'pending_ack' | 'confirmed'
  grossPay: number
  netPay: number
  messagePreview: string | null
  requestedAt: string | null
  confirmedAt: string | null
  acknowledgementStatus: 'pending' | 'confirmed' | null
  acknowledgementNote: string | null
  requestNote: string | null
  totalWorkHours: number | null
  weeklyHolidayAllowanceHours: number | null
  weeklySummaries: WeeklyWorkSummary[]
}

function parseNumeric(value: string | number | null | undefined): number {
  if (typeof value === 'number') {
    return value
  }
  if (value === null || value === undefined) {
    return 0
  }
  const parsed = Number.parseFloat(String(value))
  return Number.isNaN(parsed) ? 0 : parsed
}

function parseOptionalNumeric(value: unknown): number | null {
  if (typeof value === 'number') {
    return value
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value)
    return Number.isNaN(parsed) ? null : parsed
  }
  return null
}

export default async function TeacherWorkJournalPage({ searchParams }: TeacherWorkJournalPageProps) {
  const { profile } = await requireAuthForDashboard(['teacher', 'manager'])

  const monthTokenParam = typeof searchParams?.month === 'string' ? searchParams.month : null
  const monthRange = resolveMonthRange(monthTokenParam)
  const monthToken = monthRange.startDate.slice(0, 7)

  const supabase = createServerSupabase()

  const { data: rows, error: fetchError } = await supabase
    .from('work_log_entries')
    .select(WORK_LOG_ENTRY_SELECT_FIELDS)
    .eq('teacher_id', profile.id)
    .gte('work_date', monthRange.startDate)
    .lt('work_date', monthRange.endExclusiveDate)
    .order('work_date', { ascending: true })
    .returns<WorkLogEntryRow[]>()

  if (fetchError) {
    console.error('[teacher-work-journal] fetch error', fetchError)
  }

  const entries = (rows ?? []).map(mapWorkLogRow)

  let internalTeachers: TeacherProfileSummary[] = []

  try {
    const admin = createAdminClient()
    const { data: teacherRows, error: teacherError } = await admin
      .from('profiles')
      .select('id, name, email, role, status')
      .eq('role', 'teacher')
      .eq('status', 'approved')
      .order('name', { ascending: true })

    if (teacherError) {
      console.error('[teacher-work-journal] teacher list error', teacherError)
    }

    if (teacherRows) {
      internalTeachers = teacherRows
        .filter((teacher) => teacher.id !== profile.id)
        .map(summarizeTeacherProfile)
        .sort((a, b) => {
          const nameA = a.name ?? a.email ?? ''
          const nameB = b.name ?? b.email ?? ''
          return nameA.localeCompare(nameB, 'ko')
        })
    }
  } catch (error) {
    console.error('[teacher-work-journal] teacher list unexpected error', error)
  }

  let payrollCard: TeacherPayrollCardData | null = null

  try {
    const { data: payrollRows, error: payrollError } = await supabase
      .from('teacher_payroll_runs')
      .select('id, gross_pay, net_pay, status, message_preview, requested_at, meta')
      .eq('teacher_id', profile.id)
      .gte('period_start', monthRange.startDate)
      .lte('period_end', monthRange.endExclusiveDate)
      .order('updated_at', { ascending: false })

    if (payrollError) {
      console.error('[teacher-work-journal] payroll load error', payrollError)
    }

    const runRow = payrollRows?.[0]

    if (runRow) {
      const { data: ackRow, error: ackError } = await supabase
        .from('teacher_payroll_acknowledgements')
        .select('id, status, requested_at, confirmed_at, note')
        .eq('run_id', runRow.id)
        .maybeSingle()

      if (ackError) {
        console.error('[teacher-work-journal] payroll ack load error', ackError)
      }

      const meta = (runRow.meta as Record<string, unknown> | null) ?? null
      const totalWorkHours = parseOptionalNumeric(meta?.['totalWorkHours'])
      const weeklyHolidayAllowanceHours = parseOptionalNumeric(meta?.['weeklyHolidayAllowanceHours'])
      const rawWeeklySummaries = meta?.['weeklySummaries']
      const weeklySummaries = Array.isArray(rawWeeklySummaries)
        ? (rawWeeklySummaries as WeeklyWorkSummary[])
        : []
      const rawRequestNote = meta?.['requestNote']
      const requestNote = typeof rawRequestNote === 'string' ? rawRequestNote : null

      payrollCard = {
        runId: runRow.id,
        status: runRow.status as 'draft' | 'pending_ack' | 'confirmed',
        grossPay: parseNumeric(runRow.gross_pay),
        netPay: parseNumeric(runRow.net_pay),
        messagePreview: runRow.message_preview ?? null,
        requestedAt: runRow.requested_at ?? null,
        confirmedAt: ackRow?.confirmed_at ?? null,
        acknowledgementStatus: (ackRow?.status as 'pending' | 'confirmed' | undefined) ?? null,
        acknowledgementNote: ackRow?.note ?? null,
        requestNote,
        totalWorkHours,
        weeklyHolidayAllowanceHours,
        weeklySummaries,
      }
    }
  } catch (error) {
    console.error('[teacher-work-journal] payroll card error', error)
  }

  return (
    <section className="mx-auto flex max-w-6xl flex-col gap-6">
      <DashboardBackLink
        fallbackHref="/dashboard/teacher"
        label="교사용 허브로 돌아가기"
        className="self-start"
      />
      <header className="space-y-2 text-center">
        <h1 className="text-3xl font-semibold text-slate-900">근무일지</h1>
        <p className="text-sm text-slate-600">월별 근무 현황을 기록하고 주차별·월간 근무 시간을 확인하세요.</p>
      </header>
      {payrollCard && (
        <TeacherPayrollCard monthLabel={monthRange.label} data={payrollCard} />
      )}
      <WorkJournalClient
        monthToken={monthToken}
        monthLabel={monthRange.label}
        monthStartDate={monthRange.startDate}
        entries={entries}
        internalTeachers={internalTeachers}
      />
    </section>
  )
}
