import { notFound } from 'next/navigation'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { requireAuthForDashboard } from '@/lib/auth'
import { fetchFilmNoteHistory } from '@/lib/film-history'
import { Badge } from '@/components/ui/badge'
import { FilmNoteHistoryManager } from '@/components/dashboard/student/film-notes/FilmNoteHistoryManager'

interface PageParams {
  taskId: string
}

export default async function FilmHistoryPage({ params }: { params: PageParams }) {
  const { profile } = await requireAuthForDashboard('student')

  if (!profile) {
    return null
  }

  const history = await fetchFilmNoteHistory(params.taskId, profile.id)

  if (!history) {
    notFound()
  }

  const { workbook, status } = history
  const fallbackHref = `/dashboard/student/tasks/${params.taskId}`

  return (
    <section className="space-y-6">
      <DashboardBackLink fallbackHref={fallbackHref} label="과제 상세로 돌아가기" />
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold text-slate-900">{workbook.title}</h1>
        <Badge variant="secondary">감상지 히스토리</Badge>
        {status === 'completed' && <Badge variant="default">완료</Badge>}
      </div>
      <p className="text-sm text-slate-600">완료한 감상지를 확인하고 바로 수정하거나 새로 작성할 수 있습니다.</p>

      <FilmNoteHistoryManager history={history} />
    </section>
  )
}
