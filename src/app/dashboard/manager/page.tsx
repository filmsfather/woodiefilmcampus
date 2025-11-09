import Link from 'next/link'

import { ManagerQuickLinks } from '@/components/dashboard/manager/ManagerQuickLinks'
import { ManagerStatsOverview } from '@/components/dashboard/manager/ManagerStatsOverview'
import { AnnualScheduleTable } from '@/components/dashboard/learning-journal/AnnualScheduleTable'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { requireAuthForDashboard } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { fetchLearningJournalAnnualSchedules } from '@/lib/learning-journals'

export default async function ManagerDashboardPage() {
  const { profile } = await requireAuthForDashboard('manager')
  const supabase = createClient()

  const [pendingCountResult, approvedCountResult, annualSchedules] = await Promise.all([
    supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending'),
    supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'approved'),
    fetchLearningJournalAnnualSchedules(),
  ])

  if (pendingCountResult.error) {
    console.error('[manager] pending count error', pendingCountResult.error)
  }

  const pendingCount = pendingCountResult.count ?? 0
  const approvedCount = approvedCountResult.count ?? 0
  const schedulePreview = annualSchedules.slice(0, 4)
  const hasMoreSchedules = annualSchedules.length > schedulePreview.length

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

      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="space-y-1">
          <CardTitle className="text-lg text-slate-900">연간 일정</CardTitle>
          <CardDescription className="text-sm text-slate-500">
            주요 진행 기간을 빠르게 확인하세요{hasMoreSchedules ? ' (상세 페이지에서 전체 보기)' : ''}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <AnnualScheduleTable
            schedules={schedulePreview}
            emptyMessage="아직 등록된 연간 일정이 없습니다."
          />
          <div className="flex justify-end">
            <Button asChild variant="outline">
              <Link href="/dashboard/principal/learning-journal/annual-schedule">연간 일정 전체 보기</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </section>
  )
}
