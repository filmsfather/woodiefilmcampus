import type { Metadata } from 'next'
import Link from 'next/link'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { requireAuthForDashboard } from '@/lib/auth'
import { fetchStudentExamList, fetchStudentReviewTasks } from '@/lib/exams'

export const metadata: Metadata = {
  title: '시험 | Woodie Film Campus',
  description: '배정된 시험에 응시하고 오답노트 과제를 확인합니다.',
}

const RESULT_BADGE: Record<string, { label: string; className: string }> = {
  pending: { label: '판정 대기', className: 'bg-slate-100 text-slate-700' },
  pass: { label: 'PASS', className: 'bg-emerald-100 text-emerald-700' },
  nonpass: { label: 'NON-PASS', className: 'bg-rose-100 text-rose-700' },
}

const REVIEW_BADGE: Record<string, { label: string; className: string }> = {
  assigned: { label: '작성 필요', className: 'bg-amber-100 text-amber-700' },
  submitted: { label: '확인 대기', className: 'bg-slate-100 text-slate-700' },
  partial: { label: '재작성 필요', className: 'bg-rose-100 text-rose-700' },
  pass: { label: '통과', className: 'bg-emerald-100 text-emerald-700' },
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })
}

export default async function StudentExamsPage() {
  const { profile } = await requireAuthForDashboard('student')

  const [exams, reviewTasks] = await Promise.all([
    fetchStudentExamList(profile!.id),
    fetchStudentReviewTasks(profile!.id),
  ])

  const now = Date.now()

  return (
    <section className="space-y-6">
      <DashboardBackLink fallbackHref="/dashboard/student" label="학생 대시보드로 돌아가기" />

      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-slate-900">시험</h1>
        <p className="text-sm text-slate-600">배정된 시험에 응시하고, 오답노트 과제를 작성하세요.</p>
      </header>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg text-slate-900">시험 목록</CardTitle>
          <CardDescription>우리 반에 출제된 시험입니다. 제한시간 내에 응시를 완료하세요.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {exams.length === 0 ? (
            <p className="py-4 text-sm text-slate-500">배정된 시험이 없습니다.</p>
          ) : (
            exams.map((exam) => {
              const isOpen =
                exam.sessionStatus === 'open' &&
                now >= new Date(exam.opensAt).getTime() &&
                now <= new Date(exam.closesAt).getTime()
              const submitted = Boolean(exam.attempt?.submittedAt)
              const badge = exam.attempt ? RESULT_BADGE[exam.attempt.result] : null

              return (
                <div
                  key={exam.sessionId}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 p-4"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-900">{exam.examTitle}</span>
                      {submitted && badge ? (
                        <Badge className={badge.className}>{badge.label}</Badge>
                      ) : exam.attempt?.startedAt ? (
                        <Badge className="bg-blue-100 text-blue-700">응시 중</Badge>
                      ) : isOpen ? (
                        <Badge className="bg-amber-100 text-amber-700">응시 가능</Badge>
                      ) : (
                        <Badge className="bg-slate-100 text-slate-600">
                          {exam.sessionStatus === 'closed' || now > new Date(exam.closesAt).getTime()
                            ? '마감'
                            : '시작 전'}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-slate-500">
                      제한 {exam.durationMinutes}분 · {formatDateTime(exam.opensAt)} ~{' '}
                      {formatDateTime(exam.closesAt)}
                    </p>
                  </div>
                  <Button asChild size="sm" variant={submitted ? 'outline' : 'default'}>
                    <Link href={`/dashboard/student/exams/${exam.sessionId}`}>
                      {submitted ? '제출 내용 보기' : exam.attempt?.startedAt ? '이어서 응시' : '응시하기'}
                    </Link>
                  </Button>
                </div>
              )
            })
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg text-slate-900">오답노트 과제</CardTitle>
          <CardDescription>
            NON-PASS 시험에 대해 배정된 오답노트입니다. 문항별로 작성해 제출하세요.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {reviewTasks.length === 0 ? (
            <p className="py-4 text-sm text-slate-500">배정된 오답노트가 없습니다.</p>
          ) : (
            reviewTasks.map((task) => {
              const badge = REVIEW_BADGE[task.status] ?? REVIEW_BADGE.assigned
              return (
                <div
                  key={task.reviewTaskId}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 p-4"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-900">{task.examTitle} 오답노트</span>
                      <Badge className={badge.className}>{badge.label}</Badge>
                    </div>
                    <p className="text-xs text-slate-500">
                      문항 {task.itemCount}개
                      {task.status === 'partial' && task.nonpassCount > 0 && ` · 재작성 ${task.nonpassCount}개`} ·{' '}
                      {formatDateTime(task.assignedAt)} 배정
                    </p>
                  </div>
                  <Button asChild size="sm" variant={task.status === 'pass' ? 'outline' : 'default'}>
                    <Link href={`/dashboard/student/exams/review/${task.reviewTaskId}`}>
                      {task.status === 'pass' ? '확인하기' : '작성하기'}
                    </Link>
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
