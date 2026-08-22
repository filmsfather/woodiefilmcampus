import type { Metadata } from 'next'
import Link from 'next/link'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { requireAuthForDashboard } from '@/lib/auth'
import { fetchStudentPracticeBookings } from '@/lib/practice/attempts'
import { formatKstTime, formatPracticeRoomLabel, formatSlotDateLabel } from '@/lib/practice/shared'
import { PRACTICE_TYPE_LABELS, type PracticeType } from '@/types/practice'

export const metadata: Metadata = {
  title: '모의실기 기록 | Woodie Film Campus',
  description: '지금까지 본 작법형·면접형 모의실기를 한 곳에서 확인하세요.',
}

const BASE_PATH = '/dashboard/student/practice-feedback/archive'

export default async function StudentPracticeArchivePage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>
}) {
  const { profile } = await requireAuthForDashboard('student')

  const params = await searchParams
  const typeFilter =
    params.type === 'writing' || params.type === 'interview' ? (params.type as PracticeType) : null

  const allRows = await fetchStudentPracticeBookings(profile!.id)
  const submitted = allRows.filter((row) => row.submittedAt || row.hasFeedback)
  const rows = typeFilter ? submitted.filter((row) => row.practiceType === typeFilter) : submitted

  const writingCount = submitted.filter((row) => row.practiceType === 'writing').length
  const interviewCount = submitted.filter((row) => row.practiceType === 'interview').length

  return (
    <section className="space-y-6">
      <div className="space-y-3">
        <DashboardBackLink fallbackHref="/dashboard/student/practice-feedback" label="내 예약으로 돌아가기" />
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-slate-900">내 모의실기 기록</h1>
          <p className="text-sm text-slate-600">
            작법형 {writingCount}회, 면접형 {interviewCount}회를 응시했습니다. 각 기록에서 제출물과 선생님 피드백,
            채점 결과를 확인할 수 있습니다.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button asChild size="sm" variant={typeFilter === null ? 'default' : 'outline'}>
          <Link href={BASE_PATH}>전체 {submitted.length}</Link>
        </Button>
        <Button asChild size="sm" variant={typeFilter === 'writing' ? 'default' : 'outline'}>
          <Link href={`${BASE_PATH}?type=writing`}>작법형 {writingCount}</Link>
        </Button>
        <Button asChild size="sm" variant={typeFilter === 'interview' ? 'default' : 'outline'}>
          <Link href={`${BASE_PATH}?type=interview`}>면접형 {interviewCount}</Link>
        </Button>
      </div>

      <Card className="border-slate-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-slate-900">기록 {rows.length}건</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {rows.length === 0 ? (
            <p className="py-12 text-center text-sm text-slate-500">아직 응시한 모의실기가 없습니다.</p>
          ) : (
            rows.map((row) => (
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
                    {formatSlotDateLabel(row.slotDate)} {row.startTime} · {formatPracticeRoomLabel(row.roomNo)} ·{' '}
                    {row.problemTitle ?? '문제 없음'}
                  </p>
                  {row.submittedAt ? (
                    <p className="text-xs text-slate-400">{formatKstTime(row.submittedAt)} 제출</p>
                  ) : (
                    <p className="text-xs text-amber-600">미제출</p>
                  )}
                </div>
                {row.attemptId ? (
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/dashboard/student/practice-feedback/archive/${row.attemptId}`}>기록 보기</Link>
                  </Button>
                ) : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </section>
  )
}
