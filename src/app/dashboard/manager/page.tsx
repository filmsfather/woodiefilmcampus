import { PendingApprovalList } from '@/components/dashboard/manager/PendingApprovalList'
import { ManagerStatsOverview } from '@/components/dashboard/manager/ManagerStatsOverview'
import { createClient } from '@/lib/supabase/server'
import { requireAuthForDashboard } from '@/lib/auth'

export default async function ManagerDashboardPage() {
  const { profile } = await requireAuthForDashboard('manager')
  const supabase = createClient()

  const { data: pendingStudentsRaw, error: pendingError } = await supabase
    .from('profiles')
    .select('id, email, name, student_phone, parent_phone, academic_record, created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })

  if (pendingError) {
    console.error('Failed to load pending students', pendingError)
  }

  const pendingStudents = pendingStudentsRaw ?? []
  const pendingCount = pendingStudents.length

  const { count: approvedCount } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'approved')

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-slate-900">실장 대시보드</h1>
        <p className="text-slate-600">
          {profile?.name ?? profile?.email} 님, 학원생 가입 승인과 구성원 관리를 진행할 수 있습니다.
        </p>
      </div>

      <ManagerStatsOverview pendingCount={pendingCount} approvedCount={approvedCount ?? 0} />

      <PendingApprovalList students={pendingStudents} />
    </section>
  )
}
