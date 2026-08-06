import type { Metadata } from 'next'
import Link from 'next/link'

import { PracticeDateNav } from '@/components/dashboard/practice/PracticeDateNav'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { requireAuthForDashboard } from '@/lib/auth'
import { getTodayISOInKst } from '@/lib/counseling'
import { fetchPracticeDayBoard } from '@/lib/practice/slots'
import { PRACTICE_ATTEMPT_STATUS_LABELS, PRACTICE_BOOKING_TYPE_LABELS, PRACTICE_TYPE_LABELS } from '@/types/practice'

export const metadata: Metadata = {
  title: '모의실기 예약 현황 | Woodie Film Campus',
  description: '모의실기 1:1 피드백 예약 현황을 확인하세요.',
}

const BASE_PATH = '/dashboard/manager/practice-feedback/bookings'

function normalizeDateParam(value: string | undefined, fallback: string) {
  if (!value) return fallback
  return /^\d{4}-\d{2}-\d{2}$/u.test(value) ? value : fallback
}

export default async function ManagerPracticeBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  await requireAuthForDashboard('manager')

  const params = await searchParams
  const today = getTodayISOInKst()
  const selectedDate = normalizeDateParam(params?.date, today)

  const board = await fetchPracticeDayBoard(selectedDate)
  const bookedSlots = board.slots
    .filter((slot) => slot.booking)
    .sort((a, b) => a.startTime.localeCompare(b.startTime))

  const submittedCount = bookedSlots.filter((slot) => slot.booking?.submittedAt).length
  const feedbackCount = bookedSlots.filter((slot) => slot.booking?.hasFeedback).length

  return (
    <div className="space-y-4">
      <PracticeDateNav basePath={BASE_PATH} date={selectedDate} today={today} />

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="border-slate-200">
          <CardContent className="py-4">
            <p className="text-xs text-slate-500">예약</p>
            <p className="text-2xl font-semibold text-slate-900">{bookedSlots.length}건</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardContent className="py-4">
            <p className="text-xs text-slate-500">제출 완료</p>
            <p className="text-2xl font-semibold text-slate-900">{submittedCount}건</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200">
          <CardContent className="py-4">
            <p className="text-xs text-slate-500">피드백 작성</p>
            <p className="text-2xl font-semibold text-slate-900">{feedbackCount}건</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-slate-900">예약 목록</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {bookedSlots.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">이 날짜에 예약이 없습니다.</p>
          ) : (
            bookedSlots.map((slot) => {
              const booking = slot.booking!
              return (
                <div
                  key={slot.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 bg-white p-3"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm text-slate-500">{slot.startTime}</span>
                      <span className="font-medium text-slate-900">{booking.studentName}</span>
                      {booking.className ? (
                        <span className="text-xs text-slate-500">{booking.className}</span>
                      ) : null}
                      <Badge variant={booking.practiceType === 'writing' ? 'secondary' : 'outline'}>
                        {PRACTICE_TYPE_LABELS[booking.practiceType]}
                      </Badge>
                      <Badge variant="outline">{PRACTICE_BOOKING_TYPE_LABELS[booking.bookingType]}</Badge>
                    </div>
                    <p className="text-xs text-slate-500">
                      {slot.teacherName} 선생님 · {booking.universityName} · {booking.problemTitle}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {booking.attemptStatus ? (
                      <Badge variant={booking.hasFeedback ? 'default' : 'outline'}>
                        {booking.hasFeedback
                          ? '피드백 완료'
                          : PRACTICE_ATTEMPT_STATUS_LABELS[booking.attemptStatus]}
                      </Badge>
                    ) : null}
                    {booking.attemptId ? (
                      <Link
                        href={`/dashboard/teacher/practice-feedback/sessions/${booking.attemptId}`}
                        className="text-sm text-emerald-700 underline-offset-4 hover:underline"
                      >
                        상세
                      </Link>
                    ) : null}
                  </div>
                </div>
              )
            })
          )}
        </CardContent>
      </Card>
    </div>
  )
}
