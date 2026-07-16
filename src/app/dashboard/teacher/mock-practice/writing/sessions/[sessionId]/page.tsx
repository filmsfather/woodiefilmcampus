import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { WritingSessionCloseButton } from '@/components/dashboard/mock-practice/WritingActionButtons'
import { WritingAttemptReviewPanel } from '@/components/dashboard/mock-practice/WritingAttemptReviewPanel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import DateUtil from '@/lib/date-util'
import { requireAuthForDashboard } from '@/lib/auth'
import { fetchWritingSessionDetail } from '@/lib/writings'
import type { WritingAttemptStatus } from '@/types/writing'

export const metadata: Metadata = {
  title: '작문 회차 현황 | Woodie Film Campus',
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

const STATUS_LABELS: Record<WritingAttemptStatus, string> = {
  assigned: '시작 전',
  in_progress: '응시 중',
  submitted: '제출됨',
  task_created: '오답노트 발부됨',
}

function statusBadgeVariant(status: WritingAttemptStatus): 'default' | 'secondary' | 'outline' {
  if (status === 'task_created') return 'default'
  if (status === 'submitted') return 'secondary'
  return 'outline'
}

export default async function WritingSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>
}) {
  const { profile } = await requireAuthForDashboard(['teacher', 'manager'])

  if (!profile) {
    return null
  }

  const { sessionId } = await params
  const detail = await fetchWritingSessionDetail(sessionId)

  if (!detail) {
    notFound()
  }

  const { session, set, rows } = detail

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-3">
          <DashboardBackLink
            fallbackHref="/dashboard/teacher/mock-practice/writing"
            label="모의 작문으로 돌아가기"
          />
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold text-slate-900">{set.title}</h1>
              <Badge variant={session.status === 'open' ? 'default' : 'secondary'}>
                {session.status === 'open' ? '진행 중' : '마감'}
              </Badge>
            </div>
            <p className="text-sm text-slate-600">
              대상: {session.targetLabels.join(', ') || '없음'} · 제한시간 {set.timeLimitMinutes}분 · 출제일{' '}
              {formatDateTime(session.createdAt)} · 제출 완료 {session.submittedCount}/{session.totalStudents}
            </p>
          </div>
        </div>
        {session.status === 'open' && <WritingSessionCloseButton sessionId={session.id} />}
      </div>

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base text-slate-900">작문 문항</CardTitle>
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
            학생이 원고를 제출하면 사진 원본과 AI가 변환한 텍스트를 확인하고 오답노트를 발부할 수 있습니다.
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
                      <Badge variant={statusBadgeVariant(row.status)}>{STATUS_LABELS[row.status]}</Badge>
                      {row.status === 'task_created' && row.taskStatus === 'completed' && (
                        <Badge variant="secondary">오답노트 제출 완료</Badge>
                      )}
                    </div>
                    <p className="text-xs text-slate-500">
                      {row.startedAt && `시작: ${formatDateTime(row.startedAt)}`}
                      {row.deadlineAt && ` · 마감: ${formatDateTime(row.deadlineAt)}`}
                      {row.submittedAt && ` · 제출: ${formatDateTime(row.submittedAt)}`}
                    </p>
                  </div>
                  {row.status === 'task_created' && row.assignmentId && (
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/dashboard/teacher/assignments/${row.assignmentId}`}>오답노트 과제 확인</Link>
                    </Button>
                  )}
                </div>
                {(row.status === 'submitted' || row.status === 'task_created') && (
                  <WritingAttemptReviewPanel row={row} templateQuestionCount={set.reviewQuestions.length} />
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </section>
  )
}
