import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Calendar, CheckCircle2, Clock, ListChecks } from 'lucide-react'

import { requireAuthForDashboard } from '@/lib/auth'
import { fetchFilmNoteHistory } from '@/lib/film-history'
import { FILM_NOTE_FIELDS, FILM_NOTE_TEXT_AREAS } from '@/lib/film-notes'
import DateUtil from '@/lib/date-util'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface PageParams {
  taskId: string
}

function formatDateTime(value: string | null) {
  if (!value) {
    return '-'
  }

  return DateUtil.formatForDisplay(value, {
    locale: 'ko-KR',
    timeZone: 'Asia/Seoul',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default async function FilmHistoryPage({ params }: { params: PageParams }) {
  const { profile } = await requireAuthForDashboard('student')

  if (!profile) {
    return null
  }

  DateUtil.clearServerClock()
  DateUtil.initServerClock()

  const history = await fetchFilmNoteHistory(params.taskId, profile.id)

  if (!history) {
    notFound()
  }

  const { workbook, assignment, entries, completedCount } = history
  const noteCount = workbook.noteCount
  const latestUpdatedAt = entries.reduce<string | null>((latest, entry) => {
    if (!entry.updatedAt) {
      return latest
    }
    if (!latest || entry.updatedAt > latest) {
      return entry.updatedAt
    }
    return latest
  }, null)

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="ghost" size="sm" className="w-fit px-0 text-slate-500">
            <Link href={`/dashboard/student/tasks/${params.taskId}`} className="flex items-center gap-2">
              <ArrowLeft className="h-4 w-4" />
              과제 상세로 돌아가기
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/student/film-notes" className="flex items-center gap-2">
              감상지 기록 모아보기
            </Link>
          </Button>
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold text-slate-900">{workbook.title}</h1>
            <Badge variant="secondary">감상지 히스토리</Badge>
            {history.status === 'completed' && <Badge variant="default">완료</Badge>}
          </div>
          <p className="text-sm text-slate-600">
            제출했던 감상지 내용을 시간순으로 다시 확인해보세요.
          </p>
        </div>
      </div>

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base text-slate-700">과제 요약</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Calendar className="h-4 w-4 text-slate-500" />
            <div>
              <p className="font-medium text-slate-800">마감</p>
              <p>{formatDateTime(assignment.dueAt)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <ListChecks className="h-4 w-4 text-slate-500" />
            <div>
              <p className="font-medium text-slate-800">필요 감상지 수</p>
              <p>{noteCount}개</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <CheckCircle2 className="h-4 w-4 text-slate-500" />
            <div>
              <p className="font-medium text-slate-800">완료된 감상지</p>
              <p>
                {completedCount}/{noteCount}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Clock className="h-4 w-4 text-slate-500" />
            <div>
              <p className="font-medium text-slate-800">마지막 업데이트</p>
              <p>{formatDateTime(latestUpdatedAt)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-6">
        {entries.map((entry) => {
          const isCompleted = entry.completed
          const updatedLabel = entry.updatedAt ? formatDateTime(entry.updatedAt) : '저장 기록 없음'

          return (
            <Card key={entry.noteIndex} className="border-slate-200">
              <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="text-lg font-semibold text-slate-900">감상지 {entry.noteIndex + 1}</CardTitle>
                  <p className="text-sm text-slate-500">최근 저장: {updatedLabel}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={isCompleted ? 'secondary' : 'outline'}>{isCompleted ? '완료' : '작성 중'}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  {FILM_NOTE_FIELDS.map((field) => (
                    <div key={field.key} className="space-y-1">
                      <p className="text-sm font-medium text-slate-700">{field.label}</p>
                      <p className="text-sm text-slate-600 break-words">
                        {entry.content[field.key] ? entry.content[field.key] : '미입력'}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="space-y-4">
                  {FILM_NOTE_TEXT_AREAS.map((field) => (
                    <div key={field.key} className="space-y-1">
                      <p className="text-sm font-medium text-slate-700">{field.label}</p>
                      <p className="whitespace-pre-line break-words text-sm text-slate-600">
                        {entry.content[field.key] ? entry.content[field.key] : '미입력'}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </section>
  )
}
