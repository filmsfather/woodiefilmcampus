import { AnnualScheduleTable } from '@/components/dashboard/learning-journal/AnnualScheduleTable'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { requireAuthForDashboard } from '@/lib/auth'
import { fetchLearningJournalAnnualSchedules } from '@/lib/learning-journals'

export const dynamic = 'force-dynamic'

export default async function LearningJournalAnnualSchedulePage() {
  await requireAuthForDashboard(['manager', 'teacher', 'student'])

  const schedules = await fetchLearningJournalAnnualSchedules()

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
          <CardTitle className="text-lg text-slate-900">연간 일정표</CardTitle>
          <CardDescription className="text-sm text-slate-500">
            수업료 정보는 관리자 화면에서만 확인할 수 있습니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AnnualScheduleTable schedules={schedules} />
        </CardContent>
      </Card>
    </section>
  )
}
