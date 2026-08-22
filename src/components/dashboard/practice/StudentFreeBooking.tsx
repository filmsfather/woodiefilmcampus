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
import { formatPracticeRoomLabel, formatSlotDateLabel } from '@/lib/practice/shared'
import type { PracticeFreeSlotOption, PracticeType, PracticeUniversityOption } from '@/types/practice'

interface StudentFreeBookingProps {
  /** 쿼터를 이미 쓴 주의 슬롯은 서버에서 제외하고 넘어온다. */
  slots: PracticeFreeSlotOption[]
  universities: PracticeUniversityOption[]
  /** 이미 자유 예약을 사용한 주차 라벨 */
  usedCycleLabels: string[]
}

export function StudentFreeBooking({ slots, universities, usedCycleLabels }: StudentFreeBookingProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const [universityId, setUniversityId] = useState('')
  const [practiceType, setPracticeType] = useState<PracticeType>('writing')
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null)

  const slotsByDate = useMemo(() => {
    const map = new Map<string, PracticeFreeSlotOption[]>()
    for (const slot of slots) {
      const list = map.get(slot.slotDate) ?? []
      list.push(slot)
      map.set(slot.slotDate, list)
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [slots])

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
      {usedCycleLabels.length > 0 ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {usedCycleLabels.join(', ')} 주차는 자유 예약을 이미 사용해 목록에서 제외했습니다.
        </div>
      ) : null}

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
        <CardContent className="space-y-4">
          {slotsByDate.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">
              지금 예약할 수 있는 빈 슬롯이 없습니다. 자유 예약 공개 시각 이후에 다시 확인해주세요.
            </p>
          ) : (
            slotsByDate.map(([date, dateSlots]) => (
              <div key={date} className="space-y-2">
                <p className="text-sm font-medium text-slate-700">{formatSlotDateLabel(date)}</p>
                <div className="flex flex-wrap gap-2">
                  {dateSlots.map((slot) => {
                    const isSelected = selectedSlotId === slot.id
                    return (
                      <button
                        key={slot.id}
                        type="button"
                        disabled={isPending}
                        onClick={() => setSelectedSlotId(slot.id)}
                        className={[
                          'flex flex-col items-start gap-0.5 rounded-md border px-3 py-2 text-left text-sm transition',
                          isSelected
                            ? 'border-emerald-400 bg-emerald-50 text-emerald-900'
                            : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300',
                        ].join(' ')}
                      >
                        <span className="font-mono">{slot.startTime}</span>
                        <span className="text-xs text-slate-500">{formatPracticeRoomLabel(slot.roomNo)}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <Badge variant="outline">주 1회</Badge>
          <span>자유 예약은 한 주에 한 번만 가능합니다.</span>
        </div>
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
