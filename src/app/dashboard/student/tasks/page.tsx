import Link from 'next/link'

import { WeekNavigator } from '@/components/dashboard/WeekNavigator'
import { StudentDashboard } from '@/components/dashboard/student/StudentDashboard'
import DateUtil from '@/lib/date-util'
import { requireAuthForDashboard } from '@/lib/auth'
import { fetchStudentTaskSummaries } from '@/lib/student-tasks'
import { buildWeekHref, resolveWeekRange } from '@/lib/week-range'
import { Button } from '@/components/ui/button'

export default async function StudentTasksOverviewPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>
}) {
  const { profile } = await requireAuthForDashboard('student')

  if (!profile) {
    return null
  }

  DateUtil.clearServerClock()
  DateUtil.initServerClock()
  const serverNowIso = DateUtil.nowUTC().toISOString()

  const weekRange = resolveWeekRange(searchParams.week ?? null)

  const tasks = await fetchStudentTaskSummaries(profile.id, {
    dueAtOrAfter: weekRange.start,
  })

  const previousWeekHref = buildWeekHref('/dashboard/student/tasks', searchParams, weekRange.previousStart)
  const nextWeekHref = buildWeekHref('/dashboard/student/tasks', searchParams, weekRange.nextStart)

  return (
    <div className="space-y-4">
      <div className="flex justify-center md:justify-start">
        <WeekNavigator
          label={weekRange.label}
          previousHref={previousWeekHref}
          nextHref={nextWeekHref}
          className="w-full max-w-xs md:w-auto"
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard/student/resources">수업 자료실</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard/student/learning-journal">지난달 학습 일지</Link>
        </Button>
      </div>
      <StudentDashboard
        profileName={profile.name ?? profile.email ?? null}
        tasks={tasks}
        serverNowIso={serverNowIso}
        weekLabel={weekRange.label}
      />
    </div>
  )
}
