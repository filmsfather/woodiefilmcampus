import type { ReactNode } from 'react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { WeeklyOverview } from '@/components/dashboard/teacher/learning-journal/WeeklyOverview'
import { cn } from '@/lib/utils'
import {
  LEARNING_JOURNAL_SUBJECT_OPTIONS,
  type LearningJournalAcademicEvent,
  type LearningJournalComment,
  type LearningJournalGreeting,
  type LearningJournalSubject,
  type LearningJournalWeeklyData,
  type LearningJournalWeeklySubjectData,
  type LearningJournalWeekAssignmentItem,
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
  // 편집 모드 관련 props
  editable?: boolean
  className?: string
  onEditWeeklyMaterial?: (weekIndex: number, subject: LearningJournalSubject) => void
  onEditTaskPlacement?: (task: LearningJournalWeekAssignmentItem, weekIndex: number) => void
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

type CompletionEvaluation = '최우수' | '우수' | '보통' | '미흡' | '점검 필요'

interface WeeklyCompletionStat {
  weekIndex: number
  startDate: string
  endDate: string
  percent: number
  evaluation: CompletionEvaluation | null
  totalAssignments: number
  completedAssignments: number
}

const EVALUATION_BADGE_CLASS: Record<CompletionEvaluation, string> = {
  최우수: 'bg-emerald-100 text-emerald-700',
  우수: 'bg-sky-100 text-sky-700',
  보통: 'bg-slate-100 text-slate-700',
  미흡: 'bg-amber-100 text-amber-700',
  '점검 필요': 'bg-rose-100 text-rose-700',
}

const EVALUATION_BAR_CLASS: Record<CompletionEvaluation, string> = {
  최우수: 'bg-emerald-500',
  우수: 'bg-sky-500',
  보통: 'bg-slate-500',
  미흡: 'bg-amber-500',
  '점검 필요': 'bg-rose-500',
}

function calculateCompletionEvaluation(percent: number): CompletionEvaluation {
  if (percent >= 100) {
    return '최우수'
  }

  if (percent >= 75) {
    return '우수'
  }

  if (percent >= 50) {
    return '보통'
  }

  if (percent >= 30) {
    return '미흡'
  }

  return '점검 필요'
}

function deriveWeeklyCompletionStats(weeks: LearningJournalWeeklyData[]): WeeklyCompletionStat[] {
  return weeks
    .map((week) => {
      const assignments = Object.values(week.subjects ?? {}).flatMap(
        (subject: LearningJournalWeeklySubjectData) => subject.assignments ?? []
      )
      const totalAssignments = assignments.length
      const completedAssignments = assignments.filter(
        (assignment) => assignment.status === 'completed'
      ).length
      const lateCompleted = assignments.filter(
        (assignment) => assignment.status === 'completed' && assignment.submittedLate
      ).length
      const penalty = Math.min(completedAssignments, Math.floor(lateCompleted / 2))
      const adjustedCompleted = completedAssignments - penalty
      const percent = totalAssignments === 0
        ? 0
        : Math.min(100, Math.round((adjustedCompleted / totalAssignments) * 100))
      const evaluation = totalAssignments === 0 ? null : calculateCompletionEvaluation(percent)

      return {
        weekIndex: week.weekIndex,
        startDate: week.startDate,
        endDate: week.endDate,
        percent,
        evaluation,
        totalAssignments,
        completedAssignments,
      }
    })
    .sort((a, b) => a.weekIndex - b.weekIndex)
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
  editable = false,
  className,
  onEditWeeklyMaterial,
  onEditTaskPlacement,
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
  const weeklyStats = weeklyStructured ? deriveWeeklyCompletionStats(weeklyStructured) : []
  const weeksWithAssignments = weeklyStats.filter((stat) => stat.totalAssignments > 0)
  const averagePercent = weeksWithAssignments.length > 0
    ? Math.round(
        weeksWithAssignments.reduce((acc, stat) => acc + stat.percent, 0) /
          weeksWithAssignments.length
      )
    : null
  const finalEvaluation = averagePercent !== null ? calculateCompletionEvaluation(averagePercent) : null

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

      {/* 편집 모드(선생님 화면)에서는 비어있으면 숨김 */}
      {greeting || !editable ? (
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
      ) : null}

      {/* 편집 모드(선생님 화면)에서는 비어있으면 숨김 */}
      {academicEvents.length > 0 || !editable ? (
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
      ) : null}

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-lg text-slate-900">월간 학습 요약</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-slate-600">
          {weeklyStats.length > 0 ? (
            <>
              <div className="space-y-4">
                {weeklyStats.map((stat) => {
                  const hasAssignments = stat.totalAssignments > 0
                  const barClass = hasAssignments && stat.evaluation ? EVALUATION_BAR_CLASS[stat.evaluation] : 'bg-slate-300'
                  const chipLabel = hasAssignments && stat.evaluation ? stat.evaluation : '과제 없음'
                  const chipClass = hasAssignments && stat.evaluation ? EVALUATION_BADGE_CLASS[stat.evaluation] : 'bg-slate-100 text-slate-500'

                  return (
                    <div key={stat.weekIndex} className="space-y-1">
                      <div className="flex flex-col gap-1 text-xs sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex flex-col gap-0.5 text-slate-600 sm:flex-row sm:items-center sm:gap-3">
                          <span className="text-sm font-semibold text-slate-900">{stat.weekIndex}주차</span>
                          <span className="text-[11px] text-slate-400">
                            {stat.startDate} ~ {stat.endDate}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-900">{stat.percent}%</span>
                          <span
                            className={cn(
                              'rounded-full px-2 py-0.5 text-[10px] font-medium',
                              chipClass
                            )}
                          >
                            {chipLabel}
                          </span>
                        </div>
                      </div>
                      <div className="h-2 rounded-full bg-slate-200">
                        <div
                          className={cn('h-2 rounded-full transition-all', barClass)}
                          style={{ width: `${stat.percent}%` }}
                        />
                      </div>
                      <p className="text-[11px] text-slate-500">
                        {hasAssignments
                          ? `${stat.completedAssignments}/${stat.totalAssignments}개 과제 완료`
                          : '등록된 과제가 없습니다.'}
                      </p>
                    </div>
                  )
                })}
              </div>

              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                {averagePercent !== null ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-900">평균 완료율</span>
                      <span className="text-base font-semibold text-slate-900">{averagePercent}%</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-900">최종 평가</span>
                      {finalEvaluation ? (
                        <span
                          className={cn(
                            'rounded-full px-3 py-1 text-xs font-semibold',
                            EVALUATION_BADGE_CLASS[finalEvaluation]
                          )}
                        >
                          {finalEvaluation}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-500">평가할 과제가 없습니다.</span>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">평가할 과제가 없습니다.</p>
                )}
              </div>
            </>
          ) : renderedSummary ? (
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
            <WeeklyOverview
              weeks={weeklyStructured}
              className={className}
              editable={editable}
              onEdit={onEditWeeklyMaterial}
              onEditTaskPlacement={onEditTaskPlacement}
            />
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
