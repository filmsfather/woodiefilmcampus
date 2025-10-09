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
import { WorkJournalClient } from '@/components/dashboard/teacher/work-journal/WorkJournalClient'

interface TeacherWorkJournalPageProps {
  searchParams?: Record<string, string | string[] | undefined>
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

  return (
    <section className="mx-auto flex max-w-6xl flex-col gap-6">
      <header className="space-y-2 text-center">
        <h1 className="text-3xl font-semibold text-slate-900">근무일지</h1>
        <p className="text-sm text-slate-600">월별 근무 현황을 기록하고 주차별·월간 근무 시간을 확인하세요.</p>
      </header>
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
