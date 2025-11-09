import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { AnnualScheduleManager } from '@/components/dashboard/principal/learning-journal/AnnualScheduleManager'
import { requireAuthForDashboard } from '@/lib/auth'
import { fetchLearningJournalAnnualSchedules } from '@/lib/learning-journals'

export default async function PrincipalAnnualSchedulePage() {
  const { profile } = await requireAuthForDashboard(['principal', 'manager'])

  const annualSchedules = await fetchLearningJournalAnnualSchedules()

  const fallbackHref = profile?.role === 'manager'
    ? '/dashboard/manager'
    : '/dashboard/principal/learning-journal'

  const backLabel = profile?.role === 'manager'
    ? '실장 대시보드로 돌아가기'
    : '학습일지 현황으로 돌아가기'

  return (
    <section className="space-y-8">
      <DashboardBackLink fallbackHref={fallbackHref} label={backLabel} />
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold text-slate-900">연간 일정 관리</h1>
        <p className="text-sm text-slate-600">
          학부모 가정 안내에 노출될 연간 일정과 특강 일정을 등록하고 수정하세요.
        </p>
      </div>
      <AnnualScheduleManager schedules={annualSchedules} />
    </section>
  )
}
