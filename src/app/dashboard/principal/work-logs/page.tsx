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
  type WorkLogEntryWithTeacher,
} from '@/lib/work-logs'
import { WorkLogReviewClient } from '@/components/dashboard/principal/work-logs/WorkLogReviewClient'
import { WorkLogCalendarPanel } from '@/components/dashboard/principal/work-logs/WorkLogCalendarPanel'

interface WorkLogEntryWithTeacherRow extends WorkLogEntryRow {
  teacher?: {
    id: string | null
    name: string | null
    email: string | null
  } | null
}

interface PrincipalWorkLogsPageProps {
  searchParams?: Record<string, string | string[] | undefined>
}

const STATUS_OPTIONS = new Set(['pending', 'approved', 'rejected', 'all'])

export default async function PrincipalWorkLogsPage({ searchParams }: PrincipalWorkLogsPageProps) {
  await requireAuthForDashboard('principal')

  const monthTokenParam = typeof searchParams?.month === 'string' ? searchParams.month : null
  const teacherFilterParam = typeof searchParams?.teacher === 'string' ? searchParams.teacher : null
  const statusToken = typeof searchParams?.status === 'string' ? searchParams.status : 'pending'
  const statusFilter = STATUS_OPTIONS.has(statusToken) ? statusToken : 'pending'

  const monthRange = resolveMonthRange(monthTokenParam)
  const monthToken = monthRange.startDate.slice(0, 7)

  const supabase = createServerSupabase()

  const selectFields = `
    ${WORK_LOG_ENTRY_SELECT_FIELDS},
    teacher:profiles!work_log_entries_teacher_id_fkey(id, name, email)
  `

  let baseQuery = supabase
    .from('work_log_entries')
    .select(selectFields)
    .gte('work_date', monthRange.startDate)
    .lt('work_date', monthRange.endExclusiveDate)
    .order('work_date', { ascending: true })

  if (teacherFilterParam) {
    baseQuery = baseQuery.eq('teacher_id', teacherFilterParam)
  }

  const { data: rows, error: fetchError } = await baseQuery.returns<WorkLogEntryWithTeacherRow[]>()

  if (fetchError) {
    console.error('[principal-work-journal] fetch error', fetchError)
  }

  let teacherDirectory: Record<string, TeacherProfileSummary> = {}

  try {
    const admin = createAdminClient()
    const { data: teacherRows, error: teacherError } = await admin
      .from('profiles')
      .select('id, name, email, role, status')
      .eq('role', 'teacher')
      .eq('status', 'approved')

    if (teacherError) {
      console.error('[principal-work-journal] teacher directory error', teacherError)
    }

    if (teacherRows) {
      teacherDirectory = teacherRows.reduce<Record<string, TeacherProfileSummary>>((acc, teacher) => {
        acc[teacher.id] = summarizeTeacherProfile(teacher)
        return acc
      }, {})
    }
  } catch (error) {
    console.error('[principal-work-journal] teacher directory unexpected error', error)
  }

  const entries: WorkLogEntryWithTeacher[] = (rows ?? []).map((row) => {
    const entry = mapWorkLogRow(row)
    const teacherInfo = row.teacher && row.teacher.id
      ? summarizeTeacherProfile({
          id: row.teacher.id,
          name: row.teacher.name ?? null,
          email: row.teacher.email ?? null,
        })
      : teacherDirectory[entry.teacherId] ?? null

    return {
      ...entry,
      teacher: teacherInfo,
    }
  })

  return (
    <section className="mx-auto flex max-w-6xl flex-col gap-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold text-slate-900">근무일지 승인</h1>
        <p className="text-sm text-slate-600">선생님이 제출한 근무일지를 검토하고 승인 상태를 관리하세요.</p>
      </header>
      <div className="space-y-6">
        <WorkLogReviewClient
          entries={entries}
          monthToken={monthToken}
          monthLabel={monthRange.label}
          statusFilter={statusFilter as 'pending' | 'approved' | 'rejected' | 'all'}
          teacherDirectory={teacherDirectory}
        />
        <WorkLogCalendarPanel
          entries={entries}
          monthToken={monthToken}
          monthLabel={monthRange.label}
          teacherDirectory={teacherDirectory}
          activeTeacherId={teacherFilterParam ?? null}
        />
      </div>
    </section>
  )
}
