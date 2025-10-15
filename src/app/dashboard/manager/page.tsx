import Link from 'next/link'

import { PendingApprovalList } from '@/components/dashboard/manager/PendingApprovalList'
import { ManagerQuickLinks } from '@/components/dashboard/manager/ManagerQuickLinks'
import { ManagerStatsOverview } from '@/components/dashboard/manager/ManagerStatsOverview'
import { Button } from '@/components/ui/button'
import { requireAuthForDashboard } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export default async function ManagerDashboardPage() {
  const { profile } = await requireAuthForDashboard('manager')
  const supabase = createClient()

  const [pendingStudentsResult, approvedCountResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, email, name, student_phone, parent_phone, academic_record, created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: true }),
    supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'approved'),
  ])

  if (pendingStudentsResult.error) {
    console.error('[manager] pending students error', pendingStudentsResult.error)
  }

  const pendingStudents = pendingStudentsResult.data ?? []
  const pendingCount = pendingStudents.length
  const approvedCount = approvedCountResult.count ?? 0

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-slate-900">실장 대시보드</h1>
          <p className="text-slate-600">
            {profile?.name ?? profile?.email} 님, 학원 구성원과 운영 도구를 한 곳에서 관리할 수 있습니다.
          </p>
        </div>
        <Button asChild size="lg">
          <Link href="/dashboard/manager/print-requests">인쇄 요청 관리로 이동</Link>
        </Button>
      </div>

      <ManagerStatsOverview pendingCount={pendingCount} approvedCount={approvedCount} />

      <ManagerQuickLinks />

      <PendingApprovalList students={pendingStudents} />
    </section>
  )
}
