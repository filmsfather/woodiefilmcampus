import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { AnnualScheduleManager } from '@/components/dashboard/principal/learning-journal/AnnualScheduleManager'
import { requireAuthForDashboard } from '@/lib/auth'
import { fetchLearningJournalAnnualSchedules } from '@/lib/learning-journals'

export default async function PrincipalAnnualSchedulePage() {
  await requireAuthForDashboard('principal')

  const annualSchedules = await fetchLearningJournalAnnualSchedules()

  return (
    <section className="space-y-8">
      <DashboardBackLink
        fallbackHref="/dashboard/principal/learning-journal"
        label="학습일지 현황으로 돌아가기"
      />
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold text-slate-900">연간 일정 관리</h1>
        <p className="text-sm text-slate-600">
          학부모 가정 안내에 노출될 연간 일정과 영화제작 특강 일정을 등록하고 수정하세요.
        </p>
      </div>
      <AnnualScheduleManager schedules={annualSchedules} />
    </section>
  )
}
