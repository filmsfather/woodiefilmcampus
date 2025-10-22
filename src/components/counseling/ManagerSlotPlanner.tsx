'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'

import {
  CounselingReservationStatus,
  CounselingSlotStatus,
  formatDateToISO,
  buildCalendarCells,
  buildDailyTimeline,
  toDisplayTime,
} from '@/lib/counseling'
import {
  createCounselingSlots,
  deleteCounselingSlot,
  updateCounselingSlotStatus,
} from '@/app/dashboard/manager/counseling/actions'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']

interface ManagerReservationInfo {
  id: string
  student_name: string
  contact_phone: string
  academic_record: string | null
  target_university: string | null
  question: string | null
  status: CounselingReservationStatus
  created_at: string
}

interface ManagerSlotInfo {
  id: string
  start_time: string
  status: CounselingSlotStatus
  duration_minutes: number
  notes: string | null
  reservations: ManagerReservationInfo[]
}

interface DaySummaryItem {
  date: string
  total: number
  open: number
  booked: number
  closed: number
}

interface ManagerSlotPlannerProps {
  selectedDate: string
  today: string
  daySlots: ManagerSlotInfo[]
  monthSummary: DaySummaryItem[]
}

function formatSlotStatus(status: CounselingSlotStatus) {
  switch (status) {
    case 'open':
      return { label: '예약 가능', tone: 'bg-emerald-100 text-emerald-700' }
    case 'booked':
      return { label: '예약 완료', tone: 'bg-amber-100 text-amber-700' }
    case 'closed':
      return { label: '닫힘', tone: 'bg-slate-200 text-slate-700' }
    default:
      return { label: status, tone: 'bg-slate-100 text-slate-600' }
  }
}

function formatReservationStatus(status: CounselingReservationStatus) {
  switch (status) {
    case 'confirmed':
      return { label: '확정', tone: 'bg-emerald-100 text-emerald-700' }
    case 'completed':
      return { label: '상담 완료', tone: 'bg-blue-100 text-blue-700' }
    case 'canceled':
      return { label: '취소', tone: 'bg-slate-200 text-slate-600' }
    default:
      return { label: status, tone: 'bg-slate-100 text-slate-600' }
  }
}

export function ManagerSlotPlanner({ selectedDate, today, daySlots, monthSummary }: ManagerSlotPlannerProps) {
  const router = useRouter()
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [selectedTimes, setSelectedTimes] = useState<string[]>([])
  const [busySlotId, setBusySlotId] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  const [year, month] = selectedDate.split('-').map((value, index) => (index < 2 ? Number(value) : value)) as [number, number, string]
  const summaryMap = useMemo(() => new Map(monthSummary.map((item) => [item.date, item])), [monthSummary])
  const calendarCells = useMemo(() => buildCalendarCells(year, month), [year, month])
  const timeline = useMemo(() => buildDailyTimeline(), [])
  const slotByLabel = useMemo(() => {
    const map = new Map<string, ManagerSlotInfo>()
    for (const slot of daySlots) {
      map.set(toDisplayTime(slot.start_time), slot)
    }
    return map
  }, [daySlots])

  const selectedWeekday = WEEKDAY_LABELS[new Date(`${selectedDate}T00:00:00Z`).getUTCDay()]

  const handleSelectDate = (date: string) => {
    setFeedback(null)
    setSelectedTimes([])
    router.push(`/dashboard/manager/counseling/slots?date=${date}`)
  }

  const handleChangeMonth = (delta: number) => {
    const base = new Date(Date.UTC(year, month - 1, 1))
    base.setUTCMonth(base.getUTCMonth() + delta)
    const target = formatDateToISO(base)
    handleSelectDate(target)
  }

  const toggleSelection = (label: string) => {
    setSelectedTimes((prev) => {
      if (prev.includes(label)) {
        return prev.filter((item) => item !== label)
      }
      return [...prev, label].sort()
    })
  }

  const handleCreateSlots = async () => {
    if (selectedTimes.length === 0) {
      setFeedback({ type: 'error', message: '추가할 시간을 선택해주세요.' })
      return
    }
    setIsCreating(true)
    setFeedback(null)
    try {
      const result = await createCounselingSlots({ counselingDate: selectedDate, times: selectedTimes })
      if (result?.error) {
        setFeedback({ type: 'error', message: result.error })
      } else {
        setFeedback({ type: 'success', message: '선택한 시간이 예약 가능 상태로 열렸습니다.' })
        setSelectedTimes([])
        router.refresh()
      }
    } catch (error) {
      console.error('[counseling] create slots client error', error)
      setFeedback({ type: 'error', message: '슬롯을 생성하지 못했습니다. 잠시 후 다시 시도해주세요.' })
    } finally {
      setIsCreating(false)
    }
  }

  const handleUpdateSlot = async (slotId: string, status: CounselingSlotStatus) => {
    setBusySlotId(slotId)
    setFeedback(null)
    try {
      const result = await updateCounselingSlotStatus({ slotId, status })
      if (result?.error) {
        setFeedback({ type: 'error', message: result.error })
      } else {
        setFeedback({ type: 'success', message: '슬롯 상태를 변경했습니다.' })
        router.refresh()
      }
    } catch (error) {
      console.error('[counseling] update slot client error', error)
      setFeedback({ type: 'error', message: '슬롯 상태 변경에 실패했습니다.' })
    } finally {
      setBusySlotId(null)
    }
  }

  const handleDeleteSlot = async (slotId: string) => {
    setBusySlotId(slotId)
    setFeedback(null)
    try {
      const result = await deleteCounselingSlot({ slotId })
      if (result?.error) {
        setFeedback({ type: 'error', message: result.error })
      } else {
        setFeedback({ type: 'success', message: '선택한 슬롯을 삭제했습니다.' })
        router.refresh()
      }
    } catch (error) {
      console.error('[counseling] delete slot client error', error)
      setFeedback({ type: 'error', message: '슬롯 삭제에 실패했습니다.' })
    } finally {
      setBusySlotId(null)
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="space-y-3">
          <CardTitle className="flex items-center justify-between">
            <Button variant="ghost" size="icon" onClick={() => handleChangeMonth(-1)} aria-label="이전 달">
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <span className="text-base font-semibold text-slate-900">
              {year}년 {month.toString().padStart(2, '0')}월
            </span>
            <Button variant="ghost" size="icon" onClick={() => handleChangeMonth(1)} aria-label="다음 달">
              <ChevronRight className="h-5 w-5" />
            </Button>
          </CardTitle>
          <div className="grid grid-cols-7 text-center text-xs font-medium text-slate-500">
            {WEEKDAY_LABELS.map((weekday) => (
              <span key={weekday}>{weekday}</span>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-1 text-sm">
            {calendarCells.map((cell) => {
              const summary = summaryMap.get(cell.date)
              const isSelected = cell.date === selectedDate
              const isToday = cell.date === today
              return (
                <button
                  key={cell.date}
                  type="button"
                  onClick={() => handleSelectDate(cell.date)}
                  className={[
                    'flex h-16 flex-col items-center justify-between rounded-lg border p-1 text-xs transition',
                    cell.inCurrentMonth ? 'bg-white' : 'bg-slate-50 text-slate-400',
                    isSelected ? 'border-emerald-400 bg-emerald-50 text-emerald-900' : 'border-slate-200 hover:border-slate-300',
                  ].join(' ')}
                >
                  <span className="flex w-full items-center justify-between">
                    <span className="text-sm font-medium">{cell.label}</span>
                    {isToday ? <span className="h-2 w-2 rounded-full bg-emerald-500" /> : null}
                  </span>
                  {summary ? (
                    <span className="text-[10px] text-slate-500">
                      {summary.open}개 가능 / {summary.total}개 등록
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate-400">등록 없음</span>
                  )}
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="space-y-1">
            <CardTitle className="text-base font-semibold text-slate-900">
              {selectedDate} ({selectedWeekday}) 일정
            </CardTitle>
            <p className="text-sm text-slate-600">
              AM 08:00 ~ PM 11:00 사이에서 상담 가능 시간을 선택하거나 상태를 변경하세요.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
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

            <div className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
              <span>
                선택된 시간: {selectedTimes.length > 0 ? selectedTimes.join(', ') : '없음'}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={selectedTimes.length === 0 || isCreating}
                  onClick={() => setSelectedTimes([])}
                >
                  초기화
                </Button>
                <Button size="sm" onClick={handleCreateSlots} disabled={selectedTimes.length === 0 || isCreating}>
                  {isCreating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  선택 슬롯 열기
                </Button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {timeline.map((slot) => {
                const existing = slotByLabel.get(slot.label)
                const isBusy = busySlotId === existing?.id
                const isSelected = selectedTimes.includes(slot.label)

                if (existing) {
                  const reservation = existing.reservations.find((item) => item.status === 'confirmed')
                  const status = formatSlotStatus(existing.status)
                  return (
                    <div
                      key={slot.label}
                      className="rounded-lg border border-slate-200 bg-white p-3 text-sm shadow-sm"
                    >
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 font-semibold text-slate-700">{slot.label}</span>
                        <Badge className={status.tone}>{status.label}</Badge>
                        {existing.notes ? (
                          <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                            {existing.notes}
                          </span>
                        ) : null}
                        <div className="ml-auto flex items-center gap-2">
                          {existing.status === 'open' ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleUpdateSlot(existing.id, 'closed')}
                              disabled={isBusy}
                            >
                              닫기
                            </Button>
                          ) : null}
                          {existing.status === 'closed' ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleUpdateSlot(existing.id, 'open')}
                              disabled={isBusy}
                            >
                              다시 열기
                            </Button>
                          ) : null}
                          {existing.status === 'open' ? (
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleDeleteSlot(existing.id)}
                              disabled={isBusy}
                              aria-label="삭제"
                            >
                              ×
                            </Button>
                          ) : null}
                        </div>
                      </div>
                      {reservation ? (
                        <div className="mt-3 rounded-md border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold">{reservation.student_name}</span>
                            <Badge className={formatReservationStatus(reservation.status).tone}>
                              {formatReservationStatus(reservation.status).label}
                            </Badge>
                          </div>
                          <div className="mt-1 grid gap-1 text-[11px] text-emerald-700/90">
                            <span>연락처: {reservation.contact_phone}</span>
                            {reservation.target_university ? (
                              <span>희망 대학: {reservation.target_university}</span>
                            ) : null}
                            {reservation.question ? <span>문의: {reservation.question}</span> : null}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )
                }

                const checkboxId = `slot-${slot.label.replace(':', '-')}`

                return (
                  <label
                    key={slot.label}
                    htmlFor={checkboxId}
                    className={[
                      'flex cursor-pointer flex-col justify-between rounded-lg border border-slate-200 bg-white p-3 text-sm transition',
                      isSelected ? 'border-emerald-300 bg-emerald-50 ring-2 ring-emerald-100' : 'hover:border-slate-300',
                    ].join(' ')}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        id={checkboxId}
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                        checked={isSelected}
                        onChange={() => toggleSelection(slot.label)}
                      />
                      <span className="font-semibold text-slate-700">{slot.label}</span>
                    </div>
                    <span className="mt-2 text-xs text-slate-500">
                      예약 가능 슬롯이 없습니다. 체크해서 시간을 열 수 있습니다.
                    </span>
                  </label>
                )
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
