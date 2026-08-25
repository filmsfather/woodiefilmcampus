'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

import { createFreePracticeBookingAction } from '@/app/dashboard/practice-feedback/booking-actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  PRACTICE_PHASE2_DAILY_LIMIT,
  formatKstDateTime,
  formatPracticeRoomLabel,
  formatSlotDateLabel,
  getPracticeDailyLimit,
  getWeekStartDate,
} from '@/lib/practice/shared'
import type { PracticeFreeSlotOption, PracticeType, PracticeUniversityOption } from '@/types/practice'

interface StudentFreeBookingProps {
  slots: PracticeFreeSlotOption[]
  universities: PracticeUniversityOption[]
  /** 날짜(YYYY-MM-DD) -> 이미 확보한 예약 수. 담임 배정도 포함된다. */
  dailyCounts: Record<string, number>
  /** 서버 기준 현재 시각. SSR/hydration 결과를 맞추기 위해 주입한다. */
  nowIso: string
}

interface DateGroup {
  date: string
  slots: PracticeFreeSlotOption[]
  used: number
  remaining: number
}

interface WeekGroup {
  weekStart: string
  phase2OpensAt: string | null
  closesAt: string | null
  limit: number
  isPhase2: boolean
  dates: DateGroup[]
}

export function StudentFreeBooking({ slots, universities, dailyCounts, nowIso }: StudentFreeBookingProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const [universityId, setUniversityId] = useState('')
  const [practiceType, setPracticeType] = useState<PracticeType>('writing')
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null)

  // 오픈 시각은 주 단위로 정해지므로 주 -> 날짜 -> 슬롯 순으로 묶는다.
  const weekGroups = useMemo<WeekGroup[]>(() => {
    const now = new Date(nowIso)
    const byWeek = new Map<string, Map<string, PracticeFreeSlotOption[]>>()

    for (const slot of slots) {
      const weekStart = getWeekStartDate(slot.slotDate)
      const byDate = byWeek.get(weekStart) ?? new Map<string, PracticeFreeSlotOption[]>()
      const list = byDate.get(slot.slotDate) ?? []
      list.push(slot)
      byDate.set(slot.slotDate, list)
      byWeek.set(weekStart, byDate)
    }

    return Array.from(byWeek.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([weekStart, byDate]) => {
        const weekSlots = Array.from(byDate.values()).flat()
        const phase2OpensAt = weekSlots.find((slot) => slot.phase2OpensAt)?.phase2OpensAt ?? null
        const closesAt = weekSlots.find((slot) => slot.bookingClosesAt)?.bookingClosesAt ?? null
        const limit = getPracticeDailyLimit(phase2OpensAt, now)

        const dates = Array.from(byDate.entries())
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([date, dateSlots]) => {
            const used = dailyCounts[date] ?? 0
            return {
              date,
              slots: [...dateSlots].sort((a, b) => a.startTime.localeCompare(b.startTime)),
              used,
              remaining: Math.max(0, limit - used),
            }
          })

        return {
          weekStart,
          phase2OpensAt,
          closesAt,
          limit,
          isPhase2: limit >= PRACTICE_PHASE2_DAILY_LIMIT,
          dates,
        }
      })
  }, [slots, dailyCounts, nowIso])

  const availableProblemCount = useMemo(() => {
    const university = universities.find((entry) => entry.id === universityId)
    if (!university) return null
    return practiceType === 'writing' ? university.writingProblemCount : university.interviewProblemCount
  }, [universities, universityId, practiceType])

  const handleBook = () => {
    if (!selectedSlotId) {
      setFeedback({ type: 'error', message: '시간을 선택해주세요.' })
      return
    }
    if (!universityId) {
      setFeedback({ type: 'error', message: '대학을 선택해주세요.' })
      return
    }

    setFeedback(null)
    startTransition(async () => {
      const result = await createFreePracticeBookingAction({
        slotId: selectedSlotId,
        universityId,
        practiceType,
      })

      if (result.error) {
        setFeedback({ type: 'error', message: result.error })
        return
      }

      setFeedback({ type: 'success', message: '예약이 완료되었습니다. 내 예약 목록에서 확인하세요.' })
      setSelectedSlotId(null)
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      {feedback ? (
        <div
          className={[
            'rounded-md border px-3 py-2 text-sm',
            feedback.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-red-200 bg-red-50 text-red-600',
          ].join(' ')}
        >
          {feedback.message}
        </div>
      ) : null}

      <Card className="border-slate-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-slate-900">어떤 모의실기를 볼까요?</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>대학</Label>
            <Select value={universityId} onValueChange={setUniversityId} disabled={isPending}>
              <SelectTrigger>
                <SelectValue placeholder="대학을 선택하세요" />
              </SelectTrigger>
              <SelectContent>
                {universities.map((university) => (
                  <SelectItem key={university.id} value={university.id}>
                    {university.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>유형</Label>
            <Select
              value={practiceType}
              onValueChange={(value) => setPracticeType(value as PracticeType)}
              disabled={isPending}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="writing">작법형 (원고지 손글씨 제출)</SelectItem>
                <SelectItem value="interview">면접형 (타자 답안 + 면접)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {availableProblemCount !== null ? (
            <p className={availableProblemCount === 0 ? 'text-xs text-red-600' : 'text-xs text-slate-500'}>
              {availableProblemCount === 0
                ? '이 대학/유형에 준비된 문제가 없습니다. 다른 대학을 선택해주세요.'
                : '문제는 예약 시 자동으로 배정됩니다. 예약 시각에서 제한시간을 뺀 시점부터 문제를 볼 수 있습니다.'}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-slate-900">예약 가능한 시간</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {weekGroups.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">
              지금 예약할 수 있는 빈 슬롯이 없습니다. 1차 예약 오픈 시각 이후에 다시 확인해주세요.
            </p>
          ) : (
            weekGroups.map((week) => (
              <div key={week.weekStart} className="space-y-3">
                <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-2">
                  <Badge variant={week.isPhase2 ? 'default' : 'secondary'}>
                    {week.isPhase2 ? '2차' : '1차'} 예약 · 하루 {week.limit}타임
                  </Badge>
                  <span className="text-sm font-medium text-slate-700">
                    {formatSlotDateLabel(week.dates[0]?.date ?? week.weekStart)} 주
                  </span>
                  {!week.isPhase2 && week.phase2OpensAt ? (
                    <span className="text-xs text-slate-500">
                      2차 오픈 {formatKstDateTime(week.phase2OpensAt)} · 이후 하루{' '}
                      {PRACTICE_PHASE2_DAILY_LIMIT}타임까지
                    </span>
                  ) : null}
                  {week.closesAt ? (
                    <span className="text-xs text-amber-700">
                      예약 마감 {formatKstDateTime(week.closesAt)}
                    </span>
                  ) : null}
                </div>

                {week.dates.map((group) => {
                  const isFull = group.remaining === 0
                  return (
                    <div key={group.date} className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-slate-700">{formatSlotDateLabel(group.date)}</p>
                        {isFull ? (
                          <Badge variant="outline" className="text-amber-700">
                            예약 {group.used}/{week.limit} · 한도 도달
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-slate-500">
                            예약 {group.used}/{week.limit} · {group.remaining}타임 가능
                          </Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {group.slots.map((slot) => {
                          const isSelected = selectedSlotId === slot.id
                          return (
                            <button
                              key={slot.id}
                              type="button"
                              disabled={isPending || isFull}
                              onClick={() => setSelectedSlotId(slot.id)}
                              className={[
                                'flex flex-col items-start gap-0.5 rounded-md border px-3 py-2 text-left text-sm transition',
                                isFull
                                  ? 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400'
                                  : isSelected
                                    ? 'border-emerald-400 bg-emerald-50 text-emerald-900'
                                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300',
                              ].join(' ')}
                            >
                              <span className="font-mono">{slot.startTime}</span>
                              <span className="text-xs text-slate-500">
                                {formatPracticeRoomLabel(slot.roomNo)}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
        <p className="text-sm text-slate-600">
          선착순이며, 하루 한도는 담임 선생님이 배정한 예약까지 함께 계산됩니다.
        </p>
        <Button
          type="button"
          disabled={isPending || !selectedSlotId || !universityId || availableProblemCount === 0}
          onClick={handleBook}
        >
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          예약하기
        </Button>
      </div>
    </div>
  )
}
