import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { requireAuthForDashboard } from '@/lib/auth'
import {
  LEARNING_JOURNAL_ANNUAL_SCHEDULE_CATEGORY_OPTIONS,
} from '@/lib/learning-journal-annual-schedule'
import { fetchLearningJournalAnnualSchedules } from '@/lib/learning-journals'
import { AnnualScheduleCategorySection } from '@/components/dashboard/learning-journal/AnnualScheduleCategorySection'

export const dynamic = 'force-dynamic'

export default async function LearningJournalAnnualSchedulePage() {
  await requireAuthForDashboard(['manager', 'teacher', 'student'])

  const schedules = await fetchLearningJournalAnnualSchedules()

  const groupedSchedules = LEARNING_JOURNAL_ANNUAL_SCHEDULE_CATEGORY_OPTIONS.map(
    ({ value, label }, index) => ({
      value,
      label,
      schedules: schedules.filter((schedule) => schedule.category === value),
      defaultOpen: index === 0,
    })
  )

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-slate-900">연간 학습 일정</h1>
        <p className="text-sm text-slate-600">
          주요 진행 기간과 특이사항을 한눈에 확인할 수 있는 요약표입니다.
        </p>
      </div>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="space-y-1">
          <CardTitle className="text-lg text-slate-900">일정 안내</CardTitle>
          <CardDescription className="text-sm text-slate-500">
            수업료 정보는 관리자 화면에서만 확인할 수 있습니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {groupedSchedules.map(({ value, label, schedules: grouped, defaultOpen }) => (
            <AnnualScheduleCategorySection
              key={value}
              category={value}
              label={label}
              schedules={grouped}
              emptyMessage={`등록된 ${label}이 없습니다.`}
              defaultOpen={defaultOpen}
            />
          ))}
        </CardContent>
      </Card>
    </section>
  )
}
