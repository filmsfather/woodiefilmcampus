import type { Metadata } from 'next'
import Link from 'next/link'

import { PracticeDateNav } from '@/components/dashboard/practice/PracticeDateNav'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { requireAuthForDashboard } from '@/lib/auth'
import { getTodayISOInKst } from '@/lib/counseling'
import { fetchTeacherPracticeSchedule } from '@/lib/practice/attempts'
import { formatKstTime } from '@/lib/practice/shared'
import { PRACTICE_ATTEMPT_STATUS_LABELS, PRACTICE_TYPE_LABELS } from '@/types/practice'

export const metadata: Metadata = {
  title: '오늘 모의실기 일정 | Woodie Film Campus',
  description: '오늘 진행할 1:1 피드백 일정을 확인하세요.',
}

const BASE_PATH = '/dashboard/teacher/practice-feedback/today'

function normalizeDateParam(value: string | undefined, fallback: string) {
  if (!value) return fallback
  return /^\d{4}-\d{2}-\d{2}$/u.test(value) ? value : fallback
}

export default async function TeacherPracticeTodayPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const { profile } = await requireAuthForDashboard(['teacher', 'manager'])

  const params = await searchParams
  const today = getTodayISOInKst()
  const selectedDate = normalizeDateParam(params?.date, today)

  const rows = await fetchTeacherPracticeSchedule(profile!.id, selectedDate)

  return (
    <div className="space-y-4">
      <PracticeDateNav basePath={BASE_PATH} date={selectedDate} today={today} />

      <Card className="border-slate-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-slate-900">내 슬롯 {rows.length}건</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">이 날짜에 배정된 학생이 없습니다.</p>
          ) : (
            rows.map((row) => (
              <div
                key={row.bookingId}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 bg-white p-3"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm text-slate-500">{row.startTime}</span>
                    <span className="font-medium text-slate-900">{row.studentName}</span>
                    {row.className ? <span className="text-xs text-slate-500">{row.className}</span> : null}
                    <Badge variant={row.practiceType === 'writing' ? 'secondary' : 'outline'}>
                      {PRACTICE_TYPE_LABELS[row.practiceType]}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-500">
                    {row.universityName} · {row.problemTitle ?? '문제 없음'}
                    {row.opensAt ? ` · 문제 공개 ${formatKstTime(row.opensAt)}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={row.hasFeedback ? 'default' : 'outline'}>
                    {row.hasFeedback
                      ? '피드백 완료'
                      : row.attemptStatus
                        ? PRACTICE_ATTEMPT_STATUS_LABELS[row.attemptStatus]
                        : '대기'}
                  </Badge>
                  {row.attemptId ? (
                    <Button asChild size="sm">
                      <Link href={`/dashboard/teacher/practice-feedback/sessions/${row.attemptId}`}>
                        피드백 진행
                      </Link>
                    </Button>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
