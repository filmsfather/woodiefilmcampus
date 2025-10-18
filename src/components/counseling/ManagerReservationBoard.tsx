'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

import {
  CounselingReservationStatus,
  CounselingSlotStatus,
  shiftIsoDate,
  toDisplayTime,
} from '@/lib/counseling'
import {
  updateCounselingReservationMemo,
  updateCounselingReservationStatus,
} from '@/app/dashboard/manager/counseling/actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'

const STATUS_LABELS: Record<CounselingReservationStatus, string> = {
  confirmed: '확정',
  completed: '상담 완료',
  canceled: '취소',
}

const SLOT_STATUS_LABELS: Record<CounselingSlotStatus, string> = {
  open: '예약 가능',
  booked: '예약 완료',
  closed: '닫힘',
}

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']

interface ReservationSlotInfo {
  id: string
  counseling_date: string
  start_time: string
  status: CounselingSlotStatus
}

interface ReservationItem {
  id: string
  student_name: string
  contact_phone: string
  academic_record: string | null
  target_university: string | null
  question: string | null
  additional_answers: Record<string, unknown>
  status: CounselingReservationStatus
  memo: string | null
  created_at: string
  slot: ReservationSlotInfo
}

interface QuestionDictionary {
  [fieldKey: string]: string
}

interface ManagerReservationBoardProps {
  selectedDate: string
  view: 'day' | 'week'
  rangeStart: string
  rangeEnd: string
  reservations: ReservationItem[]
  questionLabels: QuestionDictionary
}

function formatRangeLabel(view: 'day' | 'week', start: string, end: string) {
  if (view === 'day' || start === end) {
    const weekday = WEEKDAY_LABELS[new Date(`${start}T00:00:00Z`).getUTCDay()]
    return `${start} (${weekday})`
  }
  const startWeekday = WEEKDAY_LABELS[new Date(`${start}T00:00:00Z`).getUTCDay()]
  const endWeekday = WEEKDAY_LABELS[new Date(`${end}T00:00:00Z`).getUTCDay()]
  return `${start} (${startWeekday}) ~ ${end} (${endWeekday})`
}

export function ManagerReservationBoard({
  selectedDate,
  view,
  rangeStart,
  rangeEnd,
  reservations,
  questionLabels,
}: ManagerReservationBoardProps) {
  const router = useRouter()
  const [pendingReservation, setPendingReservation] = useState<string | null>(null)
  const [memoDrafts, setMemoDrafts] = useState<Record<string, string>>({})
  const rangeLabel = formatRangeLabel(view, rangeStart, rangeEnd)

  const grouped = useMemo(() => {
    const result = new Map<string, ReservationItem[]>()
    for (const reservation of reservations) {
      const list = result.get(reservation.slot.counseling_date) ?? []
      list.push(reservation)
      result.set(reservation.slot.counseling_date, list)
    }
    return Array.from(result.entries()).sort(([a], [b]) => (a < b ? -1 : 1))
  }, [reservations])

  const totals = useMemo(() => {
    const base = { total: reservations.length, confirmed: 0, completed: 0, canceled: 0 }
    for (const reservation of reservations) {
      base[reservation.status] += 1
    }
    return base
  }, [reservations])

  const changeView = (nextView: 'day' | 'week') => {
    const params = new URLSearchParams()
    params.set('view', nextView)
    params.set('date', selectedDate)
    router.push(`/dashboard/manager/counseling/reservations?${params.toString()}`)
  }

  const moveDate = (delta: number) => {
    const targetDate = shiftIsoDate(selectedDate, delta)
    const params = new URLSearchParams()
    params.set('view', view)
    params.set('date', targetDate)
    router.push(`/dashboard/manager/counseling/reservations?${params.toString()}`)
  }

  const handleStatusChange = async (id: string, status: CounselingReservationStatus) => {
    setPendingReservation(id)
    try {
      const result = await updateCounselingReservationStatus({ reservationId: id, status })
      if (result?.error) {
        console.error('[counseling] reservation status error', result.error)
      } else {
        router.refresh()
      }
    } catch (error) {
      console.error('[counseling] reservation status update failed', error)
    } finally {
      setPendingReservation(null)
    }
  }

  const handleMemoSave = async (id: string) => {
    const memo = memoDrafts[id]
    setPendingReservation(id)
    try {
      const result = await updateCounselingReservationMemo({ reservationId: id, memo })
      if (result?.error) {
        console.error('[counseling] reservation memo error', result.error)
      } else {
        setMemoDrafts((prev) => ({ ...prev, [id]: memo ?? '' }))
        router.refresh()
      }
    } catch (error) {
      console.error('[counseling] reservation memo update failed', error)
    } finally {
      setPendingReservation(null)
    }
  }

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <CardTitle className="text-base font-semibold text-slate-900">예약 현황</CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant={view === 'week' ? 'default' : 'secondary'}
              size="sm"
              onClick={() => changeView('week')}
            >
              주간 보기
            </Button>
            <Button
              variant={view === 'day' ? 'default' : 'secondary'}
              size="sm"
              onClick={() => changeView('day')}
            >
              일간 보기
            </Button>
          </div>
        </div>
        <div className="flex flex-col gap-3 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 md:flex-row md:items-center md:justify-between">
          <div>
            범위: <span className="font-medium text-slate-800">{rangeLabel}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => moveDate(view === 'week' ? -7 : -1)}>
              이전
            </Button>
            <Button variant="outline" size="sm" onClick={() => moveDate(view === 'week' ? 7 : 1)}>
              다음
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs md:text-sm">
            <span className="rounded bg-slate-200 px-2 py-0.5">전체 {totals.total}</span>
            <span className="rounded bg-emerald-100 px-2 py-0.5 text-emerald-700">확정 {totals.confirmed}</span>
            <span className="rounded bg-blue-100 px-2 py-0.5 text-blue-700">완료 {totals.completed}</span>
            <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-600">취소 {totals.canceled}</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {grouped.length === 0 ? (
          <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center text-sm text-slate-500">
            표시할 예약이 없습니다.
          </div>
        ) : null}
        {grouped.map(([date, items]) => {
          const weekday = WEEKDAY_LABELS[new Date(`${date}T00:00:00Z`).getUTCDay()]
          return (
            <section key={date} className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">
                  {date} ({weekday})
                </h3>
                <span className="text-xs text-slate-500">{items.length}건</span>
              </div>
              <div className="space-y-3">
                {items.map((reservation) => {
                  const slotStatusLabel = SLOT_STATUS_LABELS[reservation.slot.status]
                  const statusLabel = STATUS_LABELS[reservation.status]
                  const answers = reservation.additional_answers ?? {}
                  const memoDraft = memoDrafts[reservation.id] ?? reservation.memo ?? ''
                  const isPending = pendingReservation === reservation.id

                  return (
                    <div
                      key={reservation.id}
                      className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                            <span>{toDisplayTime(reservation.slot.start_time)}</span>
                            <Badge className="bg-slate-100 text-slate-600">{slotStatusLabel}</Badge>
                          </div>
                          <div className="text-sm text-slate-700">
                            {reservation.student_name}{' '}
                            <span className="text-slate-500">({reservation.contact_phone})</span>
                          </div>
                          <div className="text-xs text-slate-500">
                            신청일 {new Date(reservation.created_at).toLocaleString('ko-KR', {
                              timeZone: 'Asia/Seoul',
                              month: '2-digit',
                              day: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <Badge className={
                            reservation.status === 'confirmed'
                              ? 'bg-emerald-100 text-emerald-700'
                              : reservation.status === 'completed'
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-slate-100 text-slate-600'
                          }>
                            {statusLabel}
                          </Badge>
                          <div className="flex items-center gap-1">
                            {(['confirmed', 'completed', 'canceled'] as CounselingReservationStatus[]).map((status) => (
                              <Button
                                key={status}
                                size="sm"
                                variant={reservation.status === status ? 'default' : 'outline'}
                                onClick={() => handleStatusChange(reservation.id, status)}
                                disabled={reservation.status === status || isPending}
                              >
                                {STATUS_LABELS[status]}
                              </Button>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 grid gap-2 text-sm text-slate-600">
                        {reservation.academic_record ? (
                          <div>내신 성적: {reservation.academic_record}</div>
                        ) : null}
                        {reservation.target_university ? (
                          <div>희망 대학: {reservation.target_university}</div>
                        ) : null}
                        {reservation.question ? <div>궁금한 점: {reservation.question}</div> : null}
                        {Object.keys(answers).length > 0 ? (
                          <div className="space-y-1 text-xs">
                            {Object.entries(answers).map(([fieldKey, value]) => (
                              <div key={fieldKey} className="rounded bg-slate-50 px-2 py-1 text-slate-600">
                                <span className="font-medium text-slate-700">
                                  {questionLabels[fieldKey] ?? fieldKey}
                                </span>
                                : {String(value)}
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>

                      <div className="mt-3 space-y-2">
                        <Textarea
                          placeholder="상담 메모를 남겨주세요."
                          value={memoDraft}
                          onChange={(event) =>
                            setMemoDrafts((prev) => ({ ...prev, [reservation.id]: event.target.value }))
                          }
                          className="min-h-[70px]"
                        />
                        <div className="flex justify-end">
                          <Button
                            size="sm"
                            onClick={() => handleMemoSave(reservation.id)}
                            disabled={isPending}
                          >
                            {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            메모 저장
                          </Button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )
        })}
      </CardContent>
    </Card>
  )
}
