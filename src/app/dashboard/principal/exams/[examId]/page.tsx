import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { ExamSessionCreateForm } from '@/components/dashboard/exams/ExamSessionCreateForm'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { requireAuthForDashboard } from '@/lib/auth'
import { fetchClassOptionsForExam, fetchExamDetail, fetchPrincipalReviewTasks } from '@/lib/exams'

export const metadata: Metadata = {
  title: '시험 세트 상세 | 시험 출제',
}

const REVIEW_STATUS_BADGE: Record<string, { label: string; className: string }> = {
  assigned: { label: '작성 대기', className: 'bg-slate-100 text-slate-700' },
  submitted: { label: '확인 필요', className: 'bg-amber-100 text-amber-700' },
  partial: { label: '부분 통과', className: 'bg-blue-100 text-blue-700' },
  pass: { label: '통과', className: 'bg-emerald-100 text-emerald-700' },
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })
}

export default async function ExamDetailPage(props: { params: Promise<{ examId: string }> }) {
  await requireAuthForDashboard('principal')

  const { examId } = await props.params
  const [exam, classOptions, reviewTasks] = await Promise.all([
    fetchExamDetail(examId),
    fetchClassOptionsForExam(),
    fetchPrincipalReviewTasks(examId),
  ])

  if (!exam) {
    notFound()
  }

  const pendingReviewTasks = reviewTasks.filter((task) => task.status === 'submitted')
  const otherReviewTasks = reviewTasks.filter((task) => task.status !== 'submitted')

  return (
    <section className="space-y-6">
      <DashboardBackLink fallbackHref="/dashboard/principal/exams" label="시험 출제로 돌아가기" />

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-slate-900">{exam.title}</h1>
          {exam.description && <p className="text-sm text-slate-600 whitespace-pre-wrap">{exam.description}</p>}
          <p className="text-xs text-slate-400">{formatDateTime(exam.createdAt)} 생성</p>
        </div>
        {exam.sessions.length === 0 && (
          <Button asChild variant="outline" size="sm">
            <Link href={`/dashboard/principal/exams/${exam.id}/edit`}>세트 수정</Link>
          </Button>
        )}
      </header>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg text-slate-900">출제하기</CardTitle>
          <CardDescription>대상 반 또는 개별 학생과 제한시간, 응시 기간을 지정해 이 시험을 출제합니다.</CardDescription>
        </CardHeader>
        <CardContent>
          <ExamSessionCreateForm examId={exam.id} classOptions={classOptions} />
        </CardContent>
      </Card>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg text-slate-900">출제 이력</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {exam.sessions.length === 0 ? (
            <p className="py-2 text-sm text-slate-500">아직 출제된 회차가 없습니다.</p>
          ) : (
            exam.sessions.map((session) => (
              <div
                key={session.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 p-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-900">
                      {[...session.classNames, ...session.studentNames].join(', ') || '대상 없음'}
                    </span>
                    <Badge
                      className={
                        session.status === 'open'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-slate-100 text-slate-600'
                      }
                    >
                      {session.status === 'open' ? '진행 중' : '마감'}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-500">
                    제한 {session.durationMinutes}분 · {formatDateTime(session.opensAt)} ~{' '}
                    {formatDateTime(session.closesAt)} · 제출 {session.submittedCount}/{session.totalStudents}명
                  </p>
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link href={`/dashboard/principal/exams/sessions/${session.id}`}>응시 현황</Link>
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg text-slate-900">문항 미리보기</CardTitle>
          <CardDescription>문항 {exam.questions.length}개</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {exam.questions.map((question, index) => (
            <div key={question.id} className="rounded-md border border-slate-200 p-4">
              <p className="text-sm font-medium text-slate-900">
                문항 {index + 1}. <span className="whitespace-pre-wrap font-normal">{question.prompt}</span>
              </p>

              {question.assets.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-3">
                  {question.assets.map((asset, assetIndex) =>
                    asset.url ? (
                      <a key={asset.id} href={asset.url} target="_blank" rel="noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={asset.url}
                          alt={`문항 ${index + 1} 이미지 ${assetIndex + 1}`}
                          className="h-28 w-28 rounded-md border border-slate-200 object-cover"
                        />
                      </a>
                    ) : null
                  )}
                </div>
              )}

              {question.reviewQuestions.length > 0 && (
                <div className="mt-3 rounded-md bg-slate-50 p-3">
                  <p className="text-xs font-medium text-slate-500">오답노트 문항</p>
                  <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-slate-700">
                    {question.reviewQuestions.map((review) => (
                      <li key={review.id} className="whitespace-pre-wrap">
                        {review.prompt}
                        {review.requiresImage && (
                          <span className="ml-1 text-xs text-blue-600">(이미지 제출)</span>
                        )}
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg text-slate-900">오답노트 확인</CardTitle>
          <CardDescription>
            이 시험에 배정된 오답노트를 확인하고 문항별 부분 통과 또는 전체 통과를 결정하세요.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {reviewTasks.length === 0 ? (
            <p className="py-2 text-sm text-slate-500">배정된 오답노트가 없습니다.</p>
          ) : (
            [...pendingReviewTasks, ...otherReviewTasks].map((task) => {
              const badge = REVIEW_STATUS_BADGE[task.status] ?? REVIEW_STATUS_BADGE.assigned
              return (
                <div
                  key={task.reviewTaskId}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 p-4"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-900">{task.studentName}</span>
                      <Badge className={badge.className}>{badge.label}</Badge>
                    </div>
                    <p className="text-xs text-slate-500">
                      문항 {task.itemCount}개 ·{' '}
                      {task.submittedAt
                        ? `${formatDateTime(task.submittedAt)} 제출`
                        : `${formatDateTime(task.assignedAt)} 배정`}
                    </p>
                  </div>
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/dashboard/principal/exams/reviews/${task.reviewTaskId}`}>오답노트 확인</Link>
                  </Button>
                </div>
              )
            })
          )}
        </CardContent>
      </Card>
    </section>
  )
}
