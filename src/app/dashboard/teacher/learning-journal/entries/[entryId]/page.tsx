import { notFound } from 'next/navigation'

import { requireAuthForDashboard } from '@/lib/auth'
import DateUtil from '@/lib/date-util'
import { createClient as createServerSupabase } from '@/lib/supabase/server'
import {
  deriveMonthTokensForRange,
  fetchLearningJournalAcademicEvents,
  fetchLearningJournalComments,
  fetchLearningJournalEntryDetail,
  fetchLearningJournalGreeting,
  LEARNING_JOURNAL_SUBJECT_OPTIONS,
} from '@/lib/learning-journals'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CommentEditor } from '@/components/dashboard/teacher/learning-journal/CommentEditor'
import { EntryStatusPanel } from '@/components/dashboard/teacher/learning-journal/EntryStatusPanel'

interface PageParams {
  entryId: string
}

export default async function TeacherLearningJournalEntryPage({ params }: { params: PageParams }) {
  await requireAuthForDashboard('teacher')

  const entry = await fetchLearningJournalEntryDetail(params.entryId)

  if (!entry) {
    notFound()
  }

  const supabase = createServerSupabase()

  const { data: periodRow, error: periodError } = await supabase
    .from('learning_journal_periods')
    .select(
      `id,
       class_id,
       start_date,
       end_date,
       label,
       status,
       classes:classes!learning_journal_periods_class_id_fkey(id, name)
      `
    )
    .eq('id', entry.periodId)
    .maybeSingle()

  if (periodError) {
    console.error('[learning-journal] entry period fetch error', periodError)
  }

  if (!periodRow) {
    notFound()
  }

  const classInfo = Array.isArray(periodRow.classes) ? periodRow.classes[0] : periodRow.classes

  const { data: studentRow, error: studentError } = await supabase
    .from('profiles')
    .select('id, name, email')
    .eq('id', entry.studentId)
    .maybeSingle()

  if (studentError) {
    console.error('[learning-journal] entry student fetch error', studentError)
  }

  const studentName = studentRow?.name ?? studentRow?.email ?? '학생 정보 없음'

  const comments = await fetchLearningJournalComments(entry.id)
  const commentLookup = new Map(
    comments.map((comment) => {
      const key = comment.roleScope === 'homeroom' ? 'homeroom' : `subject:${comment.subject}`
      return [key, comment.body ?? ''] as const
    })
  )

  const monthTokens = deriveMonthTokensForRange(periodRow.start_date, periodRow.end_date)
  const primaryMonth = monthTokens[0]
  const greeting = primaryMonth ? await fetchLearningJournalGreeting(primaryMonth) : null
  const academicEvents = monthTokens.length > 0 ? await fetchLearningJournalAcademicEvents(monthTokens) : []

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-slate-900">{studentName} 학습일지</h1>
        <p className="text-sm text-slate-600">
          {classInfo?.name ?? '반 미지정'} · {periodRow.start_date} ~ {periodRow.end_date}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle className="text-lg text-slate-900">월간 요약</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {greeting ? (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-slate-900">원장 인사말</h3>
                  <p className="whitespace-pre-wrap text-sm text-slate-600">{greeting.message}</p>
                </div>
              ) : null}

              {academicEvents.length > 0 ? (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-slate-900">주요 학사 일정</h3>
                  <ul className="space-y-1 text-sm text-slate-600">
                    {academicEvents.map((event) => (
                      <li key={event.id}>
                        <span className="font-medium text-slate-900">
                          {event.startDate}
                          {event.endDate ? ` ~ ${event.endDate}` : ''}
                        </span>{' '}
                        {event.title}
                        {event.memo ? <span className="text-slate-500"> · {event.memo}</span> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {!greeting && academicEvents.length === 0 ? (
                <p className="text-sm text-slate-500">등록된 인사말이나 일정이 없습니다.</p>
              ) : null}

              <div className="h-px w-full bg-slate-200" />

              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-slate-900">자동 요약</h3>
                {entry.summary ? (
                  <pre className="max-h-64 overflow-auto rounded-md bg-slate-50 p-3 text-xs text-slate-600">
                    {JSON.stringify(entry.summary, null, 2)}
                  </pre>
                ) : (
                  <p className="text-sm text-slate-500">
                    아직 자동 요약 데이터가 생성되지 않았습니다. 추후 자동 채우기 기능이 제공될 예정입니다.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <CommentEditor
            entryId={entry.id}
            roleScope="homeroom"
            label="담임 코멘트"
            description="학생의 전반적인 학습 태도와 전달 사항을 작성하세요."
            defaultValue={commentLookup.get('homeroom') ?? ''}
          />

          <div className="grid gap-4 md:grid-cols-2">
            {LEARNING_JOURNAL_SUBJECT_OPTIONS.map((option) => {
              const key = `subject:${option.value}`
              return (
                <CommentEditor
                  key={option.value}
                  entryId={entry.id}
                  roleScope="subject"
                  subject={option.value}
                  label={`${option.label} 코멘트`}
                  description="수업 참여도, 과제 피드백 등을 기록하세요."
                  defaultValue={commentLookup.get(key) ?? ''}
                />
              )
            })}
          </div>
        </div>

        <div className="space-y-6">
          <EntryStatusPanel entryId={entry.id} status={entry.status} />

          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle className="text-lg text-slate-900">기본 정보</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-600">
              <div className="flex justify-between">
                <span className="text-slate-500">작성 상태</span>
                <span className="font-medium text-slate-900">{entry.status}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">완료율</span>
                <span className="font-medium text-slate-900">
                  {entry.completionRate !== null ? `${Math.round(entry.completionRate)}%` : '정보 없음'}
                </span>
              </div>
              <div className="space-y-1">
                <p className="text-slate-500">최근 업데이트</p>
                <p className="font-medium text-slate-900">
                  {DateUtil.formatForDisplay(entry.updatedAt, {
                    locale: 'ko-KR',
                    timeZone: 'Asia/Seoul',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  )
}
