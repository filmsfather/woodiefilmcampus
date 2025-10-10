import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { FilmNotesManager } from '@/components/dashboard/student/film-notes/FilmNotesManager'
import { requireAuthForDashboard } from '@/lib/auth'
import DateUtil from '@/lib/date-util'
import { fetchStudentFilmNotesList } from '@/lib/film-history'

export default async function StudentFilmNotesPage() {
  const { profile } = await requireAuthForDashboard('student')

  if (!profile) {
    return null
  }

  DateUtil.clearServerClock()
  DateUtil.initServerClock()

  const notes = await fetchStudentFilmNotesList(profile.id)

  return (
    <section className="space-y-6">
      <div className="space-y-3">
        <DashboardBackLink fallbackHref="/dashboard/student" label="학생 대시보드로 돌아가기" />
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-slate-900">감상지 기록</h1>
          <p className="text-sm text-slate-600">
            과제 제출 감상지와 개인 기록을 한 곳에서 확인하고 새로운 감상지를 작성해 보세요.
          </p>
        </div>
      </div>

      <FilmNotesManager notes={notes} />
    </section>
  )
}
