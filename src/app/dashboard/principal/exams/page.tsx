import type { Metadata } from 'next'
import Link from 'next/link'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { ExamListActions } from '@/components/dashboard/exams/ExamActionButtons'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { requireAuthForDashboard } from '@/lib/auth'
import { fetchExamSessionSummaries, fetchExamSummaries } from '@/lib/exams'

export const metadata: Metadata = {
  title: '시험 출제 | Woodie Film Campus',
  description: '시험 세트를 만들고 반별로 출제하며, 응시 결과와 오답노트를 관리합니다.',
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })
}

export default async function PrincipalExamsPage() {
  await requireAuthForDashboard('principal')

  const [exams, sessions] = await Promise.all([fetchExamSummaries(), fetchExamSessionSummaries()])

  return (
    <section className="space-y-6">
      <DashboardBackLink fallbackHref="/dashboard/principal" label="원장 대시보드로 돌아가기" />

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-slate-900">시험 출제</h1>
          <p className="text-sm text-slate-600">
            시험 세트를 만들어 저장해 두고, 반을 선택해 출제하세요. 저장된 세트는 언제든 다시 출제할 수 있습니다.
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/principal/exams/new">새 시험 세트 만들기</Link>
        </Button>
      </header>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg text-slate-900">시험 세트</CardTitle>
          <CardDescription>문항과 오답노트 문항이 함께 저장된 재사용 가능한 시험 목록입니다.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {exams.length === 0 ? (
            <p className="py-4 text-sm text-slate-500">아직 만든 시험 세트가 없습니다.</p>
          ) : (
            exams.map((exam) => (
              <div
                key={exam.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 p-4"
              >
                <div className="min-w-0 space-y-1">
                  <Link
                    href={`/dashboard/principal/exams/${exam.id}`}
                    className="font-medium text-slate-900 underline-offset-2 hover:underline"
                  >
                    {exam.title}
                  </Link>
                  <p className="text-xs text-slate-500">
                    문항 {exam.questionCount}개 · 출제 {exam.sessionCount}회
                    {exam.openSessionCount > 0 && ` (진행 중 ${exam.openSessionCount}회)`} ·{' '}
                    {formatDateTime(exam.createdAt)} 생성
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button asChild size="sm">
                    <Link href={`/dashboard/principal/exams/${exam.id}`}>출제하기</Link>
                  </Button>
                  <ExamListActions examId={exam.id} canDelete={exam.sessionCount === 0} />
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg text-slate-900">출제된 회차</CardTitle>
          <CardDescription>반별 응시 현황을 확인하고 pass / non-pass를 판별하세요.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {sessions.length === 0 ? (
            <p className="py-4 text-sm text-slate-500">아직 출제된 회차가 없습니다.</p>
          ) : (
            sessions.map((session) => (
              <div
                key={session.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 p-4"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/dashboard/principal/exams/sessions/${session.id}`}
                      className="font-medium text-slate-900 underline-offset-2 hover:underline"
                    >
                      {session.examTitle}
                    </Link>
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
                    {[...session.classNames, ...session.studentNames].join(', ') || '대상 없음'} · 제한{' '}
                    {session.durationMinutes}분 ·{' '}
                    {formatDateTime(session.opensAt)} ~ {formatDateTime(session.closesAt)}
                  </p>
                  <p className="text-xs text-slate-500">
                    제출 {session.submittedCount}/{session.totalStudents}명
                    {session.pendingEvaluationCount > 0 && (
                      <span className="ml-1 font-medium text-amber-600">
                        · 판정 대기 {session.pendingEvaluationCount}명
                      </span>
                    )}
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

    </section>
  )
}
