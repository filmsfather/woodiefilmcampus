import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { PracticeFeedbackForm } from '@/components/dashboard/practice/PracticeFeedbackForm'
import { PracticeInterviewRecorder } from '@/components/dashboard/practice/PracticeInterviewRecorder'
import { PracticeSubmissionReview } from '@/components/dashboard/practice/PracticeSubmissionReview'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { requireAuthForDashboard } from '@/lib/auth'
import { fetchPracticeAttemptDetail } from '@/lib/practice/attempts'
import { formatKstDateTime, formatSlotDateLabel } from '@/lib/practice/shared'
import { PRACTICE_ATTEMPT_STATUS_LABELS, PRACTICE_TYPE_LABELS } from '@/types/practice'

export const metadata: Metadata = {
  title: '모의실기 피드백 | Woodie Film Campus',
  description: '학생 제출물을 보며 1:1 피드백을 작성하세요.',
}

export default async function PracticeFeedbackSessionPage({
  params,
}: {
  params: Promise<{ attemptId: string }>
}) {
  const { profile } = await requireAuthForDashboard(['teacher', 'manager'])
  const { attemptId } = await params

  const attempt = await fetchPracticeAttemptDetail(attemptId)

  if (!attempt) {
    notFound()
  }

  return (
    <div className="space-y-4">
      <Card className="border-slate-200">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <CardTitle className="flex flex-wrap items-center gap-2 text-lg text-slate-900">
                {attempt.studentName}
                {attempt.className ? (
                  <span className="text-sm font-normal text-slate-500">{attempt.className}</span>
                ) : null}
                <Badge variant={attempt.practiceType === 'writing' ? 'secondary' : 'outline'}>
                  {PRACTICE_TYPE_LABELS[attempt.practiceType]}
                </Badge>
                <Badge variant="outline">{PRACTICE_ATTEMPT_STATUS_LABELS[attempt.status]}</Badge>
              </CardTitle>
              <p className="text-sm text-slate-600">
                {attempt.universityName} · {attempt.problem.title} · 제한시간 {attempt.problem.timeLimitMinutes}분
              </p>
              <p className="text-xs text-slate-500">
                {formatSlotDateLabel(attempt.slotDate)} {attempt.startTime} · {attempt.teacherName} 선생님 · 문제 공개{' '}
                {formatKstDateTime(attempt.opensAt)}
              </p>
            </div>
            <Link
              href={`/dashboard/teacher/practice-feedback/students/${attempt.studentId}`}
              className="text-sm text-emerald-700 underline-offset-4 hover:underline"
            >
              이 학생 누적 이력
            </Link>
          </div>
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

      <PracticeSubmissionReview attempt={attempt} />

      {attempt.practiceType === 'interview' ? (
        <>
          {attempt.videoUrl ? (
            <Card className="border-slate-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-slate-900">면접 녹화</CardTitle>
                <p className="text-xs text-slate-500">{formatKstDateTime(attempt.recordedAt)} 녹화</p>
              </CardHeader>
              <CardContent>
                <video src={attempt.videoUrl} controls className="w-full rounded-md border border-slate-200" />
              </CardContent>
            </Card>
          ) : null}
          <PracticeInterviewRecorder
            attemptId={attempt.attemptId}
            studentName={attempt.studentName}
            uploaderId={profile!.id}
            hasExistingRecording={Boolean(attempt.videoUrl)}
          />
        </>
      ) : null}

      <PracticeFeedbackForm attempt={attempt} />
    </div>
  )
}
