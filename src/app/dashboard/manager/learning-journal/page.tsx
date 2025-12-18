import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { requireAuthForDashboard } from '@/lib/auth'
import DateUtil from '@/lib/date-util'
import { createClient as createServerSupabase } from '@/lib/supabase/server'
import {
  deriveMonthTokensForRange,
  fetchLearningJournalAcademicEvents,
  fetchLearningJournalPeriodsForManager,
  resolveMonthToken,
} from '@/lib/learning-journals'
import { CreatePeriodForm } from '@/components/dashboard/manager/learning-journal/CreatePeriodForm'
import { PeriodRowForm } from '@/components/dashboard/manager/learning-journal/PeriodRowForm'
import { AcademicEventCreateForm } from '@/components/dashboard/manager/learning-journal/AcademicEventCreateForm'
import { AcademicEventList } from '@/components/dashboard/manager/learning-journal/AcademicEventList'
import { MonthSelect } from '@/components/dashboard/manager/learning-journal/MonthSelect'

function buildMonthOptions(periodStartTokens: string[], fallback: string): string[] {
  if (periodStartTokens.length === 0) {
    return [fallback]
  }

  const unique = Array.from(new Set(periodStartTokens))
  if (!unique.includes(fallback)) {
    unique.unshift(fallback)
  }
  return unique
}

export default async function ManagerLearningJournalPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>
}) {
  await requireAuthForDashboard('manager')

  const nowIso = DateUtil.formatISODate(DateUtil.nowUTC())
  const periods = await fetchLearningJournalPeriodsForManager()
  const defaultStartDate = periods[0]?.startDate ?? nowIso

  const supabase = await createServerSupabase()
  const { data: classRows, error: classError } = await supabase
    .from('classes')
    .select('id, name')
    .order('name', { ascending: true })

  if (classError) {
    console.error('[learning-journal] manager class fetch error', classError)
  }

  const classOptions = (classRows ?? []).map((row) => ({
    id: row.id,
    name: row.name ?? '이름 미정',
  }))

  const monthParam = typeof searchParams?.month === 'string' ? searchParams.month : null
  const referenceMonth = resolveMonthToken(nowIso)
  const activeMonth = monthParam ?? referenceMonth

  const monthTokensFromPeriods = periods.flatMap((period) =>
    deriveMonthTokensForRange(period.startDate, period.endDate)
  )

  const monthOptions = buildMonthOptions(monthTokensFromPeriods, activeMonth)
  const academicEvents = await fetchLearningJournalAcademicEvents([activeMonth])

  return (
    <section className="space-y-8">
      <div className="space-y-3">
        <DashboardBackLink fallbackHref="/dashboard/manager" label="실장 허브로 돌아가기" />
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold text-slate-900">학습일지 주기 관리</h1>
          <p className="text-sm text-slate-600">
            반별 4주 주기를 생성하고, 주요 학사 일정을 등록해 교사 학습일지 작성을 지원하세요.
          </p>
        </div>
      </div>

      <CreatePeriodForm classOptions={classOptions} defaultStartDate={defaultStartDate} />

      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900">진행 중인 주기</h2>
        {periods.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
            생성된 학습일지 주기가 없습니다. 위에서 새 주기를 먼저 만들어 주세요.
          </div>
        ) : (
          <div className="space-y-4">
            {periods.map((period) => (
              <PeriodRowForm key={period.id} period={period} />
            ))}
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <h2 className="text-xl font-semibold text-slate-900">주요 학사 일정</h2>
          <MonthSelect options={monthOptions} selected={activeMonth} />
        </div>
        <AcademicEventCreateForm monthToken={activeMonth} defaultStartDate={defaultStartDate} />
        <AcademicEventList events={academicEvents} />
      </div>
    </section>
  )
}
