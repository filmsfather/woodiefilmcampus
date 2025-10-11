import type { ReactNode } from 'react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { LEARNING_JOURNAL_SUBJECT_OPTIONS } from '@/lib/learning-journals'
import { WeeklyOverview } from '@/components/dashboard/teacher/learning-journal/WeeklyOverview'
import type {
  LearningJournalAcademicEvent,
  LearningJournalComment,
  LearningJournalGreeting,
  LearningJournalWeeklyData,
} from '@/types/learning-journal'

interface HeaderMetaItem {
  label: string
  value: string
}

interface EntryHeaderInfo {
  title: string
  subtitle?: string | null
  meta?: HeaderMetaItem[]
}

interface LearningJournalEntryContentProps {
  header: EntryHeaderInfo
  summary: unknown
  weekly: unknown
  greeting?: LearningJournalGreeting | null
  academicEvents?: LearningJournalAcademicEvent[]
  comments: LearningJournalComment[]
  emptyGreetingMessage?: string
  emptyEventsMessage?: string
  emptySummaryMessage?: string
  emptyWeeklyMessage?: string
  actionPanel?: ReactNode
}

function renderStructuredContent(data: unknown) {
  if (!data) {
    return null
  }

  if (typeof data === 'string') {
    return data
  }

  try {
    return JSON.stringify(data, null, 2)
  } catch (error) {
    console.error('[learning-journal] failed to stringify content', error)
    return String(data)
  }
}

function isLearningJournalWeeklyDataArray(value: unknown): value is LearningJournalWeeklyData[] {
  if (!Array.isArray(value)) {
    return false
  }

  return value.every((item) => {
    if (!item || typeof item !== 'object') {
      return false
    }

    const candidate = item as Partial<LearningJournalWeeklyData>
    return (
      typeof candidate.weekIndex === 'number' &&
      typeof candidate.startDate === 'string' &&
      typeof candidate.endDate === 'string' &&
      candidate.subjects && typeof candidate.subjects === 'object'
    )
  })
}

export function LearningJournalEntryContent({
  header,
  greeting,
  academicEvents = [],
  summary,
  weekly,
  comments,
  emptyGreetingMessage = '등록된 인사말이 없습니다.',
  emptyEventsMessage = '등록된 학사 일정이 없습니다.',
  emptySummaryMessage = '아직 요약 정보가 준비되지 않았습니다.',
  emptyWeeklyMessage = '주차별 콘텐츠가 아직 등록되지 않았습니다.',
  actionPanel,
}: LearningJournalEntryContentProps) {
  const homeroomComment = comments.find((comment) => comment.roleScope === 'homeroom')
  const homeroomBody = homeroomComment?.body?.trim() ?? ''
  const subjectComments = LEARNING_JOURNAL_SUBJECT_OPTIONS.map((option) => {
    const target = comments.find(
      (comment) => comment.roleScope === 'subject' && comment.subject === option.value
    )
    const body = target?.body?.trim() ?? ''
    return {
      optionLabel: option.label,
      body,
    }
  }).filter((item) => item.body.length > 0)

  const hasHomeroomComment = homeroomBody.length > 0
  const hasSubjectComments = subjectComments.length > 0
  const hasAnyComment = hasHomeroomComment || hasSubjectComments

  const renderedSummary = renderStructuredContent(summary)
  const renderedWeekly = renderStructuredContent(weekly)
  const weeklyStructured = isLearningJournalWeeklyDataArray(weekly) ? weekly : null

  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-slate-900">{header.title}</h1>
        {header.subtitle ? <p className="text-sm text-slate-600">{header.subtitle}</p> : null}
        {header.meta && header.meta.length > 0 ? (
          <dl className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500">
            {header.meta.map((item) => (
              <div key={`${item.label}-${item.value}`} className="flex items-center gap-2">
                <dt className="font-medium text-slate-600">{item.label}</dt>
                <dd className="text-slate-500">{item.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </header>

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-lg text-slate-900">원장 인사말</CardTitle>
        </CardHeader>
        <CardContent>
          {greeting ? (
            <p className="whitespace-pre-wrap text-sm text-slate-600">{greeting.message}</p>
          ) : (
            <p className="text-sm text-slate-500">{emptyGreetingMessage}</p>
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-lg text-slate-900">주요 학사 일정</CardTitle>
        </CardHeader>
        <CardContent>
          {academicEvents.length > 0 ? (
            <ul className="space-y-3 text-sm text-slate-600">
              {academicEvents.map((event) => (
                <li key={event.id} className="rounded-md bg-slate-50 px-3 py-2">
                  <p className="font-medium text-slate-900">
                    {event.startDate}
                    {event.endDate ? ` ~ ${event.endDate}` : ''} · {event.title}
                  </p>
                  {event.memo ? <p className="text-xs text-slate-500">{event.memo}</p> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">{emptyEventsMessage}</p>
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-lg text-slate-900">월간 학습 요약</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-slate-600">
          {renderedSummary ? (
            <pre className="max-h-64 overflow-auto rounded-md bg-slate-50 p-3 text-xs text-slate-600">
              {renderedSummary}
            </pre>
          ) : (
            <p>{emptySummaryMessage}</p>
          )}
        </CardContent>
      </Card>

      {hasAnyComment ? (
        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="text-lg text-slate-900">코멘트</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-600">
            {hasHomeroomComment ? (
              <div className="rounded-md border border-slate-200 bg-white p-3">
                <p className="font-medium text-slate-900">담임 코멘트</p>
                <p className="mt-1 whitespace-pre-wrap text-slate-600">{homeroomBody}</p>
              </div>
            ) : null}

            {subjectComments.map(({ optionLabel, body }) => (
              <div key={optionLabel} className="rounded-md border border-slate-200 bg-white p-3">
                <p className="font-medium text-slate-900">{optionLabel} 코멘트</p>
                <p className="mt-1 whitespace-pre-wrap text-slate-600">{body}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-lg text-slate-900">주차별 학습 현황</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-slate-600">
          {weeklyStructured && weeklyStructured.length > 0 ? (
            <WeeklyOverview weeks={weeklyStructured} />
          ) : renderedWeekly ? (
            <pre className="max-h-72 overflow-auto rounded-md bg-slate-50 p-3 text-xs text-slate-600">
              {renderedWeekly}
            </pre>
          ) : (
            <p>{emptyWeeklyMessage}</p>
          )}
        </CardContent>
      </Card>

      {actionPanel ? <div className="flex flex-wrap gap-2">{actionPanel}</div> : null}
    </section>
  )
}
