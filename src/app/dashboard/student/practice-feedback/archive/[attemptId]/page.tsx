import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { requireAuthForDashboard } from '@/lib/auth'
import { fetchPracticeAttemptDetail } from '@/lib/practice/attempts'
import { formatKstTime, formatPracticeRoomLabel, formatSlotDateLabel } from '@/lib/practice/shared'
import { PRACTICE_TYPE_LABELS } from '@/types/practice'

export const metadata: Metadata = {
  title: '모의실기 기록 상세 | Woodie Film Campus',
  description: '제출물과 선생님 피드백을 확인하세요.',
}

export default async function StudentPracticeArchiveDetailPage({
  params,
}: {
  params: Promise<{ attemptId: string }>
}) {
  const { profile } = await requireAuthForDashboard('student')
  const { attemptId } = await params

  const attempt = await fetchPracticeAttemptDetail(attemptId)

  if (!attempt || attempt.studentId !== profile!.id) {
    notFound()
  }

  const rubricMap = new Map(attempt.problem.rubricItems.map((item) => [item.id, item]))
  const scores = attempt.feedback?.scores ?? []
  const maxTotal = attempt.problem.rubricItems.reduce((sum, item) => sum + item.maxScore, 0)

  return (
    <section className="space-y-6">
      <div className="space-y-3">
        <DashboardBackLink
          fallbackHref="/dashboard/student/practice-feedback/archive"
          label="기록 목록으로 돌아가기"
        />
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold text-slate-900">{attempt.universityName}</h1>
            <Badge variant={attempt.practiceType === 'writing' ? 'secondary' : 'outline'}>
              {PRACTICE_TYPE_LABELS[attempt.practiceType]}
            </Badge>
          </div>
          <p className="text-sm text-slate-600">
            {formatSlotDateLabel(attempt.slotDate)} {attempt.startTime} · {formatPracticeRoomLabel(attempt.roomNo)} ·{' '}
            {attempt.problem.title}
          </p>
        </div>
      </div>

      <Card className="border-slate-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-slate-900">문제</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {attempt.problem.items.map((item, index) => (
            <div key={item.id} className="space-y-1 rounded-md border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-medium text-slate-500">문항 {index + 1}</p>
              <p className="whitespace-pre-wrap text-sm text-slate-900">{item.prompt}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-slate-900">내 답안</CardTitle>
          {attempt.submittedAt ? (
            <p className="text-xs text-slate-500">{formatKstTime(attempt.submittedAt)} 제출</p>
          ) : (
            <p className="text-xs text-amber-600">제출하지 않았습니다.</p>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {attempt.practiceType === 'interview' ? (
            attempt.problem.items.map((item, index) => (
              <div key={item.id} className="space-y-1 rounded-md border border-slate-200 bg-white p-3">
                <p className="text-xs font-medium text-slate-500">문항 {index + 1}</p>
                <p className="whitespace-pre-wrap text-sm text-slate-900">
                  {attempt.typedAnswers[item.id]?.trim() || '작성하지 않음'}
                </p>
              </div>
            ))
          ) : (
            <>
              {attempt.ocrStatus === 'done' && attempt.ocrText?.trim() ? (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-slate-500">AI 변환 원문</p>
                  <div className="whitespace-pre-wrap rounded-md border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed text-slate-900">
                    {attempt.ocrText}
                  </div>
                </div>
              ) : null}
              <div className="flex flex-wrap gap-3">
                {attempt.submissionImages.map((image, index) =>
                  image.url ? (
                    <a key={image.id} href={image.url} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={image.url}
                        alt={`제출 원고 ${index + 1}`}
                        className="max-h-80 rounded-md border border-slate-200 object-contain"
                      />
                    </a>
                  ) : null
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {attempt.videoUrl ? (
        <Card className="border-slate-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-slate-900">면접 녹화</CardTitle>
          </CardHeader>
          <CardContent>
            <video src={attempt.videoUrl} controls className="w-full rounded-md border border-slate-200" />
          </CardContent>
        </Card>
      ) : null}

      {attempt.feedback ? (
        <Card className="border-emerald-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-slate-900">선생님 피드백</CardTitle>
            {attempt.feedback.teacherName ? (
              <p className="text-xs text-slate-500">{attempt.feedback.teacherName} 선생님</p>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-4">
            {attempt.feedback.feedbackText ? (
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-900">
                {attempt.feedback.feedbackText}
              </p>
            ) : null}

            {attempt.feedback.comment ? (
              <div className="space-y-1 rounded-md border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-medium text-slate-500">면접 코멘트</p>
                <p className="whitespace-pre-wrap text-sm text-slate-900">{attempt.feedback.comment}</p>
              </div>
            ) : null}

            {scores.length > 0 ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-slate-500">채점 결과</p>
                  <p className="text-sm font-semibold text-slate-900">
                    {attempt.feedback.totalScore ?? 0} / {maxTotal}점
                  </p>
                </div>
                {scores.map((score) => {
                  const rubric = rubricMap.get(score.rubricItemId)
                  if (!rubric) return null
                  return (
                    <div
                      key={score.rubricItemId}
                      className="flex items-center justify-between rounded-md border border-slate-200 bg-white p-3"
                    >
                      <div>
                        <p className="text-sm text-slate-900">{rubric.label}</p>
                        {rubric.description ? (
                          <p className="text-xs text-slate-500">{rubric.description}</p>
                        ) : null}
                      </div>
                      <p className="text-sm font-medium text-slate-900">
                        {score.score} / {rubric.maxScore}점
                      </p>
                    </div>
                  )
                })}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : (
        <Card className="border-dashed border-slate-300">
          <CardContent className="py-8 text-center text-sm text-slate-500">
            아직 피드백이 등록되지 않았습니다.
          </CardContent>
        </Card>
      )}
    </section>
  )
}
