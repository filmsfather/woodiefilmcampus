import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { requireAuthForDashboard } from '@/lib/auth'
import { fetchPracticeStudentHistory } from '@/lib/practice/attempts'
import { formatKstTime, formatSlotDateLabel } from '@/lib/practice/shared'
import { PRACTICE_ATTEMPT_STATUS_LABELS, PRACTICE_TYPE_LABELS } from '@/types/practice'

export const metadata: Metadata = {
  title: '학생 모의실기 이력 | Woodie Film Campus',
  description: '학생의 모의실기 누적 기록을 확인하세요.',
}

export default async function PracticeStudentHistoryPage({
  params,
}: {
  params: Promise<{ studentId: string }>
}) {
  await requireAuthForDashboard(['teacher', 'manager'])
  const { studentId } = await params

  const history = await fetchPracticeStudentHistory(studentId)

  if (!history) {
    notFound()
  }

  const byUniversity = new Map<string, number>()
  for (const row of history.rows) {
    byUniversity.set(row.universityName, (byUniversity.get(row.universityName) ?? 0) + 1)
  }

  return (
    <div className="space-y-4">
      <DashboardBackLink
        fallbackHref="/dashboard/teacher/practice-feedback/students"
        label="학생 목록으로 돌아가기"
      />

      <Card className="border-slate-200">
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-wrap items-center gap-2 text-lg text-slate-900">
            {history.studentName}
            {history.className ? (
              <span className="text-sm font-normal text-slate-500">{history.className}</span>
            ) : null}
          </CardTitle>
          <p className="text-sm text-slate-600">
            응시 {history.totalCount}회 · 제출 {history.submittedCount}회 · 피드백 {history.feedbackCount}회
          </p>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {Array.from(byUniversity.entries()).map(([name, count]) => (
              <Badge key={name} variant="outline">
                {name} {count}회
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-slate-900">응시 이력</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {history.rows.length === 0 ? (
            <p className="py-12 text-center text-sm text-slate-500">기록이 없습니다.</p>
          ) : (
            history.rows.map((row) => (
              <div
                key={row.bookingId}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 bg-white p-3"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-slate-900">{row.universityName}</span>
                    <Badge variant={row.practiceType === 'writing' ? 'secondary' : 'outline'}>
                      {PRACTICE_TYPE_LABELS[row.practiceType]}
                    </Badge>
                    {row.hasFeedback ? <Badge>피드백 완료</Badge> : null}
                  </div>
                  <p className="text-xs text-slate-500">
                    {formatSlotDateLabel(row.slotDate)} {row.startTime} · {row.teacherName} 선생님 ·{' '}
                    {row.problemTitle ?? '문제 없음'}
                  </p>
                  <p className="text-xs text-slate-400">
                    {row.submittedAt
                      ? `${formatKstTime(row.submittedAt)} 제출`
                      : row.attemptStatus
                        ? PRACTICE_ATTEMPT_STATUS_LABELS[row.attemptStatus]
                        : '대기'}
                  </p>
                </div>
                {row.attemptId ? (
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/dashboard/teacher/practice-feedback/sessions/${row.attemptId}`}>상세 보기</Link>
                  </Button>
                ) : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
