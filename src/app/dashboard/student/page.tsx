import Link from 'next/link'

import { StudentDashboard } from '@/components/dashboard/student/StudentDashboard'
import DateUtil from '@/lib/date-util'
import { requireAuthForDashboard } from '@/lib/auth'
import { fetchStudentTaskSummaries } from '@/lib/student-tasks'
import { WeekNavigator } from '@/components/dashboard/WeekNavigator'
import { buildWeekHref, resolveWeekRange } from '@/lib/week-range'
import { Button } from '@/components/ui/button'

export default async function StudentDashboardPage({
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
    dueBetween: {
      start: weekRange.start,
      endExclusive: weekRange.endExclusive,
    },
  })

  const previousWeekHref = buildWeekHref('/dashboard/student', searchParams, weekRange.previousStart)
  const nextWeekHref = buildWeekHref('/dashboard/student', searchParams, weekRange.nextStart)

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
      <div className="flex justify-end">
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard/student/learning-journal">학습일지 보기</Link>
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
