import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { SessionCloseButton } from '@/components/dashboard/exams/ExamActionButtons'
import { SessionAttemptsTable } from '@/components/dashboard/exams/SessionAttemptsTable'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { requireAuthForDashboard } from '@/lib/auth'
import { fetchExamSessionDetail } from '@/lib/exams'

export const metadata: Metadata = {
  title: '응시 현황 | 시험 출제',
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })
}

export default async function ExamSessionDetailPage(props: {
  params: Promise<{ sessionId: string }>
}) {
  await requireAuthForDashboard('principal')

  const { sessionId } = await props.params
  const detail = await fetchExamSessionDetail(sessionId)

  if (!detail) {
    notFound()
  }

  const { session, exam, rows } = detail

  return (
    <section className="space-y-6">
      <DashboardBackLink fallbackHref="/dashboard/principal/exams" label="시험 출제로 돌아가기" />

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold text-slate-900">{exam.title}</h1>
            <Badge
              className={
                session.status === 'open' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
              }
            >
              {session.status === 'open' ? '진행 중' : '마감'}
            </Badge>
          </div>
          <p className="text-sm text-slate-600">
            {[...session.classNames, ...session.studentNames].join(', ') || '대상 없음'} · 제한{' '}
            {session.durationMinutes}분 ·{' '}
            {formatDateTime(session.opensAt)} ~ {formatDateTime(session.closesAt)}
          </p>
          <p className="text-xs text-slate-500">
            제출 {session.submittedCount}/{session.totalStudents}명 · 판정 대기{' '}
            {session.pendingEvaluationCount}명
          </p>
        </div>
        {session.status === 'open' && <SessionCloseButton sessionId={session.id} />}
      </header>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg text-slate-900">응시 현황</CardTitle>
          <CardDescription>
            제출된 답안을 확인하고 PASS / NON-PASS를 판별하세요. NON-PASS 처리 시 오답노트 과제가 배정됩니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SessionAttemptsTable rows={rows} questions={exam.questions} />
        </CardContent>
      </Card>
    </section>
  )
}
