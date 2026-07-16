import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { WritingExamRoom } from '@/components/dashboard/mock-practice/WritingExamRoom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import DateUtil from '@/lib/date-util'
import { requireAuthForDashboard } from '@/lib/auth'
import { fetchStudentWritingExam } from '@/lib/writings'

export const metadata: Metadata = {
  title: '모의 작문 시험 | Woodie Film Campus',
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

export default async function StudentWritingExamPage({
  params,
}: {
  params: Promise<{ sessionId: string }>
}) {
  const { profile } = await requireAuthForDashboard('student')

  if (!profile) {
    return null
  }

  const { sessionId } = await params
  const exam = await fetchStudentWritingExam(sessionId, profile.id)

  if (!exam) {
    notFound()
  }

  const isDone = exam.attemptStatus === 'submitted' || exam.attemptStatus === 'task_created'

  return (
    <section className="space-y-6">
      <div className="space-y-3">
        <DashboardBackLink fallbackHref="/dashboard/student/writing" label="모의 작문 목록으로 돌아가기" />
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold text-slate-900">{exam.setTitle}</h1>
            <Badge variant={isDone ? 'default' : 'outline'}>
              {exam.attemptStatus === 'task_created'
                ? '오답노트 발부됨'
                : exam.attemptStatus === 'submitted'
                  ? '제출 완료'
                  : exam.attemptStatus === 'in_progress'
                    ? '응시 중'
                    : '시작 전'}
            </Badge>
          </div>
          {exam.setDescription && <p className="text-sm text-slate-600">{exam.setDescription}</p>}
          <p className="text-xs text-slate-500">제한시간 {exam.timeLimitMinutes}분</p>
        </div>
      </div>

      {isDone ? (
        <>
          <Card className="border-blue-200 bg-blue-50/50">
            <CardHeader>
              <CardTitle className="text-base text-blue-800">제출이 완료되었습니다</CardTitle>
              <p className="text-xs text-blue-700">제출 시각: {formatDateTime(exam.submittedAt)}</p>
            </CardHeader>
            <CardContent className="space-y-4">
              {exam.studentTaskId ? (
                <Button asChild>
                  <Link href={`/dashboard/student/tasks/${exam.studentTaskId}`}>오답노트 하러 가기</Link>
                </Button>
              ) : (
                <p className="text-sm text-blue-700">
                  선생님이 제출물을 검토한 뒤 오답노트 과제를 발부하면 과제 목록에 표시됩니다.
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle className="text-base text-slate-900">작문 문항</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="list-decimal space-y-4 pl-5 text-sm text-slate-700">
                {exam.questions.map((question) => (
                  <li key={question.id} className="space-y-2">
                    <p className="whitespace-pre-line">{question.prompt}</p>
                    {question.assets.length > 0 && (
                      <div className="flex flex-wrap gap-3">
                        {question.assets.map((asset, index) =>
                          asset.url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              key={asset.id}
                              src={asset.url}
                              alt={`문항 이미지 ${index + 1}`}
                              className="max-h-64 rounded-md border border-slate-200 object-contain"
                            />
                          ) : null
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="border-slate-200">
              <CardHeader>
                <CardTitle className="text-base text-slate-900">제출한 원고</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {exam.submissionImages.length === 0 ? (
                  <p className="text-sm text-slate-500">제출된 사진이 없습니다.</p>
                ) : (
                  exam.submissionImages.map((image, index) =>
                    image.url ? (
                      <a key={image.id} href={image.url} target="_blank" rel="noreferrer" className="block">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={image.url}
                          alt={`원고 ${index + 1}페이지`}
                          className="w-full rounded-md border border-slate-200 object-contain"
                        />
                      </a>
                    ) : null
                  )
                )}
              </CardContent>
            </Card>

            <Card className="border-slate-200">
              <CardHeader>
                <CardTitle className="text-base text-slate-900">변환된 텍스트</CardTitle>
                <p className="text-xs text-slate-500">AI가 원고 사진을 텍스트로 변환한 결과입니다.</p>
              </CardHeader>
              <CardContent>
                {exam.ocrText ? (
                  <div className="max-h-[600px] overflow-y-auto whitespace-pre-line rounded-md border border-slate-200 bg-slate-50 p-3 text-sm leading-relaxed text-slate-700">
                    {exam.ocrText}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">
                    {exam.ocrStatus === 'failed'
                      ? '텍스트 변환에 실패했습니다. 선생님이 다시 변환할 수 있습니다.'
                      : '텍스트 변환이 진행 중입니다. 잠시 후 새로고침해주세요.'}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      ) : (
        <WritingExamRoom exam={exam} studentId={profile.id} />
      )}
    </section>
  )
}
