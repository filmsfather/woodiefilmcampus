import type { Metadata } from 'next'
import Link from 'next/link'
import { Plus } from 'lucide-react'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { InterviewSetDeleteButton } from '@/components/dashboard/mock-practice/InterviewActionButtons'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import DateUtil from '@/lib/date-util'
import { requireAuthForDashboard } from '@/lib/auth'
import { fetchInterviewSessionSummaries, fetchInterviewSetSummaries } from '@/lib/interviews'

export const metadata: Metadata = {
  title: '모의 면접 | Woodie Film Campus',
  description: '면접 문제 세트를 만들고 학생에게 출제하세요.',
}

function formatDate(value: string) {
  return DateUtil.formatForDisplay(value, {
    locale: 'ko-KR',
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export default async function InterviewListPage() {
  await requireAuthForDashboard(['teacher', 'manager'])

  const [sets, sessions] = await Promise.all([
    fetchInterviewSetSummaries(),
    fetchInterviewSessionSummaries(),
  ])

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-3">
          <DashboardBackLink fallbackHref="/dashboard/teacher/mock-practice" label="모의실기로 돌아가기" />
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold text-slate-900">모의 면접</h1>
            <p className="text-sm text-slate-600">
              면접 문제 세트를 만들고, 반 또는 개별 학생에게 출제한 뒤 웹캠으로 녹화하세요.
            </p>
          </div>
        </div>
        <Button asChild>
          <Link href="/dashboard/teacher/mock-practice/interview/new">
            <Plus className="mr-1 h-4 w-4" /> 시험문제 만들기
          </Link>
        </Button>
      </div>

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base text-slate-900">면접 문제 세트</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {sets.length === 0 ? (
            <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
              아직 만든 면접 문제 세트가 없습니다. 시험문제 만들기로 시작하세요.
            </p>
          ) : (
            sets.map((set) => (
              <div
                key={set.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-4"
              >
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-semibold text-slate-900">{set.title}</p>
                  {set.description && <p className="truncate text-xs text-slate-500">{set.description}</p>}
                  <p className="text-xs text-slate-500">
                    면접 문항 {set.questionCount}개 · 복기 문항 {set.reviewQuestionCount}개 · 출제 {set.sessionCount}회
                    {set.createdByName ? ` · ${set.createdByName}` : ''} · {formatDate(set.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button asChild size="sm">
                    <Link href={`/dashboard/teacher/mock-practice/interview/${set.id}/assign`}>출제하기</Link>
                  </Button>
                  {set.sessionCount === 0 && (
                    <>
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/dashboard/teacher/mock-practice/interview/${set.id}/edit`}>수정</Link>
                      </Button>
                      <InterviewSetDeleteButton setId={set.id} />
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base text-slate-900">출제된 회차</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {sessions.length === 0 ? (
            <p className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
              아직 출제된 회차가 없습니다.
            </p>
          ) : (
            sessions.map((session) => (
              <Link
                key={session.id}
                href={`/dashboard/teacher/mock-practice/interview/sessions/${session.id}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-4 transition hover:border-primary hover:bg-primary/5"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-slate-900">{session.setTitle}</p>
                    <Badge variant={session.status === 'open' ? 'default' : 'secondary'}>
                      {session.status === 'open' ? '진행 중' : '마감'}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-500">
                    대상: {session.targetLabels.join(', ') || '없음'} · {formatDate(session.createdAt)}
                  </p>
                </div>
                <p className="text-sm text-slate-600">
                  녹화 완료{' '}
                  <span className="font-semibold text-slate-900">
                    {session.recordedCount}/{session.totalStudents}
                  </span>
                </p>
              </Link>
            ))
          )}
        </CardContent>
      </Card>
    </section>
  )
}
