import { PendingApprovalList } from '@/components/dashboard/manager/PendingApprovalList'
import { ManagerQuickLinks } from '@/components/dashboard/manager/ManagerQuickLinks'
import { ManagerStatsOverview } from '@/components/dashboard/manager/ManagerStatsOverview'
import { PrintRequestAdminPanel } from '@/components/dashboard/manager/PrintRequestAdminPanel'
import { requireAuthForDashboard } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

type RawPrintRequestRow = {
  id: string
  status: string
  desired_date: string | null
  desired_period: string | null
  copies: number | null
  color_mode: string | null
  notes: string | null
  created_at: string
  updated_at: string
  teacher?: { id: string; name: string | null; email: string | null } | Array<{ id: string; name: string | null; email: string | null }> | null
  assignment?: { id: string; workbooks?: { id: string; title: string; subject: string; type: string } | Array<{ id: string; title: string; subject: string; type: string }> | null } | Array<{ id: string; workbooks?: Array<{ id: string; title: string; subject: string; type: string }> | null }> | null
  student_task?: { id: string; profiles?: { id: string; name: string | null; email: string | null } | Array<{ id: string; name: string | null; email: string | null }> | null } | Array<{ id: string; profiles?: Array<{ id: string; name: string | null; email: string | null }> | null }> | null
}

export default async function ManagerDashboardPage() {
  const { profile } = await requireAuthForDashboard('manager')
  const supabase = createClient()

  const [pendingStudentsResult, approvedCountResult, printRequestResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, email, name, student_phone, parent_phone, academic_record, created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: true }),
    supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'approved'),
    supabase
      .from('print_requests')
      .select(
        `id, status, desired_date, desired_period, copies, color_mode, notes, created_at, updated_at,
         teacher:profiles!print_requests_teacher_id_fkey(id, name, email),
         assignment:assignments!print_requests_assignment_id_fkey(id, workbooks(id, title, subject, type)),
         student_task:student_tasks(id, profiles!student_tasks_student_id_fkey(id, name, email))
        `
      )
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  if (pendingStudentsResult.error) {
    console.error('[manager] pending students error', pendingStudentsResult.error)
  }

  if (printRequestResult.error) {
    console.error('[manager] print request error', printRequestResult.error)
  }

  const pendingStudents = pendingStudentsResult.data ?? []
  const pendingCount = pendingStudents.length
  const approvedCount = approvedCountResult.count ?? 0

  const printRequests = ((printRequestResult.data ?? []) as RawPrintRequestRow[]).map((row) => {
    const teacherRecord = Array.isArray(row.teacher) ? row.teacher[0] : row.teacher
    const assignmentRecord = Array.isArray(row.assignment) ? row.assignment[0] : row.assignment
    const workbook = assignmentRecord?.workbooks
      ? Array.isArray(assignmentRecord.workbooks)
        ? assignmentRecord.workbooks[0]
        : assignmentRecord.workbooks
      : null
    const studentTaskRecord = Array.isArray(row.student_task) ? row.student_task[0] : row.student_task
    const studentProfile = studentTaskRecord?.profiles
      ? Array.isArray(studentTaskRecord.profiles)
        ? studentTaskRecord.profiles[0]
        : studentTaskRecord.profiles
      : null

    return {
      id: row.id,
      status: row.status,
      desiredDate: row.desired_date,
      desiredPeriod: row.desired_period,
      copies: row.copies ?? 1,
      colorMode: row.color_mode ?? 'bw',
      notes: row.notes ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      teacher: {
        id: teacherRecord?.id ?? '',
        name: teacherRecord?.name ?? teacherRecord?.email ?? '교사 미확인',
      },
      assignment: workbook
        ? {
            id: assignmentRecord?.id ?? '',
            title: workbook.title,
            subject: workbook.subject,
            type: workbook.type,
          }
        : null,
      student: studentProfile
        ? {
            id: studentProfile.id,
            name: studentProfile.name ?? studentProfile.email ?? '학생 미확인',
          }
        : null,
    }
  })

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-slate-900">실장 대시보드</h1>
        <p className="text-slate-600">
          {profile?.name ?? profile?.email} 님, 학원생 가입 승인과 인쇄 요청 관리를 진행할 수 있습니다.
        </p>
      </div>

      <ManagerStatsOverview pendingCount={pendingCount} approvedCount={approvedCount} />

      <ManagerQuickLinks />

      <PrintRequestAdminPanel requests={printRequests} />

      <PendingApprovalList students={pendingStudents} />
    </section>
  )
}
