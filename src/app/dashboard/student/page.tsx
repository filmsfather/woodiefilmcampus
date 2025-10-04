import { StudentDashboard } from '@/components/dashboard/student/StudentDashboard'
import DateUtil from '@/lib/date-util'
import { requireAuthForDashboard } from '@/lib/auth'
import { fetchStudentTaskSummaries } from '@/lib/student-tasks'

export default async function StudentDashboardPage() {
  const { profile } = await requireAuthForDashboard('student')

  if (!profile) {
    return null
  }

  DateUtil.clearServerClock()
  DateUtil.initServerClock()
  const serverNowIso = DateUtil.nowUTC().toISOString()

  const tasks = await fetchStudentTaskSummaries(profile.id)

  return (
    <StudentDashboard
      profileName={profile.name ?? profile.email ?? null}
      tasks={tasks}
      serverNowIso={serverNowIso}
    />
  )
}
