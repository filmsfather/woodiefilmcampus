import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { requireAuthForDashboard } from '@/lib/auth'
import DateUtil from '@/lib/date-util'
import {
  deriveMonthTokensForRange,
  fetchLearningJournalGreeting,
  fetchLearningJournalAnnualSchedules,
  fetchLearningJournalPeriodsForManager,
  fetchLearningJournalPeriodStats,
  resolveMonthToken,
} from '@/lib/learning-journals'
import { GreetingForm } from '@/components/dashboard/principal/learning-journal/GreetingForm'
import { GreetingPreview } from '@/components/dashboard/principal/learning-journal/GreetingPreview'
import { PeriodProgressTable } from '@/components/dashboard/principal/learning-journal/PeriodProgressTable'
import { MonthSelect } from '@/components/dashboard/manager/learning-journal/MonthSelect'
import { AnnualScheduleManager } from '@/components/dashboard/principal/learning-journal/AnnualScheduleManager'

function formatMonthLabel(monthToken: string) {
  const [year, month] = monthToken.split('-')
  return `${year}년 ${Number(month)}월`
}

export default async function PrincipalLearningJournalPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>
}) {
  await requireAuthForDashboard('principal')

  const periods = await fetchLearningJournalPeriodsForManager()
  const periodIds = periods.map((period) => period.id)
  const stats = await fetchLearningJournalPeriodStats(periodIds)

  const nowIso = DateUtil.formatISODate(DateUtil.nowUTC())
  const monthParam = typeof searchParams?.month === 'string' ? searchParams.month : null
  const activeMonth = monthParam ?? resolveMonthToken(nowIso)
  const greeting = await fetchLearningJournalGreeting(activeMonth)
  const monthTokensFromPeriods = periods.flatMap((period) =>
    deriveMonthTokensForRange(period.startDate, period.endDate)
  )
  const monthOptions = Array.from(new Set([activeMonth, ...monthTokensFromPeriods]))
  const annualSchedules = await fetchLearningJournalAnnualSchedules()

  return (
    <section className="space-y-8">
      <div className="space-y-3">
        <DashboardBackLink fallbackHref="/dashboard/principal" label="원장 대시보드로 돌아가기" />
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold text-slate-900">학습일지 현황</h1>
          <p className="text-sm text-slate-600">
            월별 인사말을 관리하고 반별 학습일지 제출 현황을 확인하세요.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">월별 인사말</h2>
            <p className="text-sm text-slate-500">월을 변경해 이전 인사말을 확인하거나 수정할 수 있습니다.</p>
          </div>
          <MonthSelect options={monthOptions} selected={activeMonth} />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <GreetingPreview greeting={greeting} monthLabel={formatMonthLabel(activeMonth)} />
          <GreetingForm monthToken={activeMonth} defaultMessage={greeting?.message ?? ''} />
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold text-slate-900">반별 제출 현황</h2>
          <p className="text-sm text-slate-500">담임과 과목 교사들이 제출을 완료했는지 살펴보고 필요 시 안내하세요.</p>
        </div>
        <PeriodProgressTable periods={periods} stats={stats} />
      </div>

      <AnnualScheduleManager schedules={annualSchedules} />
    </section>
  )
}
