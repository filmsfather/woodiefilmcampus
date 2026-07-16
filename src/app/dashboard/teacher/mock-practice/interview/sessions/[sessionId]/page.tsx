import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Video } from 'lucide-react'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { InterviewSessionCloseButton } from '@/components/dashboard/mock-practice/InterviewActionButtons'
import { InterviewAttemptReviewPanel } from '@/components/dashboard/mock-practice/InterviewAttemptReviewPanel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import DateUtil from '@/lib/date-util'
import { requireAuthForDashboard } from '@/lib/auth'
import { fetchInterviewSessionDetail } from '@/lib/interviews'

export const metadata: Metadata = {
  title: '면접 회차 현황 | Woodie Film Campus',
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

export default async function InterviewSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>
}) {
  const { profile } = await requireAuthForDashboard(['teacher', 'manager'])

  if (!profile) {
    return null
  }

  const { sessionId } = await params
  const detail = await fetchInterviewSessionDetail(sessionId)

  if (!detail) {
    notFound()
  }

  const { session, set, rows } = detail

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-3">
          <DashboardBackLink
            fallbackHref="/dashboard/teacher/mock-practice/interview"
            label="모의 면접으로 돌아가기"
          />
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold text-slate-900">{set.title}</h1>
              <Badge variant={session.status === 'open' ? 'default' : 'secondary'}>
                {session.status === 'open' ? '진행 중' : '마감'}
              </Badge>
            </div>
            <p className="text-sm text-slate-600">
              대상: {session.targetLabels.join(', ') || '없음'} · 출제일 {formatDateTime(session.createdAt)} · 녹화
              완료 {session.recordedCount}/{session.totalStudents}
            </p>
          </div>
        </div>
        {session.status === 'open' && <InterviewSessionCloseButton sessionId={session.id} />}
      </div>

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base text-slate-900">면접 문항</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal space-y-3 pl-5 text-sm text-slate-700">
            {set.questions.map((question) => (
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
                          className="h-32 rounded-md border border-slate-200 object-contain"
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

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base text-slate-900">학생별 진행 현황</CardTitle>
          <p className="text-xs text-slate-500">
            녹화 시작을 누르면 웹캠 녹화 화면으로 이동합니다. 녹화가 끝나면 복기 과제가 자동 생성됩니다.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {rows.length === 0 ? (
            <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
              대상 학생이 없습니다.
            </p>
          ) : (
            rows.map((row) => (
              <div key={row.attemptId} className="space-y-3 rounded-lg border border-slate-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-slate-900">{row.studentName}</p>
                      {row.className && <span className="text-xs text-slate-500">{row.className}</span>}
                      <Badge variant={row.status === 'task_created' ? 'default' : 'outline'}>
                        {row.status === 'task_created' ? '녹화 완료 · 과제 생성됨' : '출제됨'}
                      </Badge>
                      {row.status === 'task_created' && row.taskStatus === 'completed' && (
                        <Badge variant="secondary">복기 제출 완료</Badge>
                      )}
                    </div>
                    {row.recordedAt && (
                      <p className="text-xs text-slate-500">녹화 완료: {formatDateTime(row.recordedAt)}</p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {row.status === 'task_created' ? (
                      row.assignmentId && (
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/dashboard/teacher/assignments/${row.assignmentId}`}>복기 과제 확인</Link>
                        </Button>
                      )
                    ) : (
                      session.status === 'open' && (
                        <Button asChild size="sm">
                          <Link
                            href={`/dashboard/teacher/mock-practice/interview/sessions/${session.id}/record/${row.attemptId}`}
                          >
                            <Video className="mr-1 h-4 w-4" /> 녹화 시작
                          </Link>
                        </Button>
                      )
                    )}
                  </div>
                </div>
                {row.status === 'task_created' && <InterviewAttemptReviewPanel row={row} />}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </section>
  )
}
