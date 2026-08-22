import Link from 'next/link'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatKstDateTime, formatKstTime, formatPracticeRoomLabel, formatSlotDateLabel } from '@/lib/practice/shared'
import {
  PRACTICE_ATTEMPT_STATUS_LABELS,
  PRACTICE_BOOKING_TYPE_LABELS,
  PRACTICE_TYPE_LABELS,
  type PracticeStudentBookingRow,
} from '@/types/practice'

function describeState(row: PracticeStudentBookingRow, now: number) {
  if (row.bookingStatus === 'canceled') {
    return { label: '취소됨', tone: 'muted' as const }
  }
  if (row.hasFeedback) {
    return { label: '피드백 완료', tone: 'done' as const }
  }
  if (row.submittedAt) {
    return { label: '제출 완료', tone: 'done' as const }
  }
  if (row.opensAt && Date.parse(row.opensAt) <= now) {
    return { label: '지금 응시 가능', tone: 'active' as const }
  }
  return {
    label: row.attemptStatus ? PRACTICE_ATTEMPT_STATUS_LABELS[row.attemptStatus] : '대기',
    tone: 'muted' as const,
  }
}

export function StudentPracticeBookingList({
  title,
  rows,
  emptyMessage,
}: {
  title: string
  rows: PracticeStudentBookingRow[]
  emptyMessage: string
}) {
  const now = Date.now()

  return (
    <Card className="border-slate-200">
      <CardHeader className="pb-3">
        <CardTitle className="text-base text-slate-900">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">{emptyMessage}</p>
        ) : (
          rows.map((row) => {
            const state = describeState(row, now)
            const canEnter =
              row.attemptId &&
              row.bookingStatus !== 'canceled' &&
              row.opensAt &&
              Date.parse(row.opensAt) <= now

            return (
              <div
                key={row.bookingId}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 bg-white p-3"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-slate-900">
                      {formatSlotDateLabel(row.slotDate)} {row.startTime}
                    </span>
                    <Badge variant={row.practiceType === 'writing' ? 'secondary' : 'outline'}>
                      {PRACTICE_TYPE_LABELS[row.practiceType]}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      {PRACTICE_BOOKING_TYPE_LABELS[row.bookingType]}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-500">
                    {row.universityName} · {formatPracticeRoomLabel(row.roomNo)}
                  </p>
                  {row.opensAt ? (
                    <p className="text-xs text-slate-400">
                      문제 공개 {formatKstDateTime(row.opensAt)} · 제출 마감{' '}
                      {row.deadlineAt ? formatKstTime(row.deadlineAt) : '-'}
                    </p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={state.tone === 'active' ? 'default' : state.tone === 'done' ? 'secondary' : 'outline'}
                  >
                    {state.label}
                  </Badge>
                  {canEnter ? (
                    <Button asChild size="sm" variant={row.submittedAt ? 'outline' : 'default'}>
                      <Link href={`/dashboard/student/practice-feedback/attempts/${row.attemptId}`}>
                        {row.submittedAt ? '내 답안 보기' : '문제 풀기'}
                      </Link>
                    </Button>
                  ) : null}
                </div>
              </div>
            )
          })
        )}
      </CardContent>
    </Card>
  )
}
