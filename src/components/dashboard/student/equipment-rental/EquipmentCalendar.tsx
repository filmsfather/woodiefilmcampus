'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'

import {
  buildCalendarCells,
  formatDateToISO,
  formatSetTypeLabel,
  formatRentalStatusLabel,
  type EquipmentRentalStatus,
  type EquipmentSlotStatus,
} from '@/lib/equipment-rental'
import { createEquipmentRental } from '@/app/dashboard/student/equipment-rental/actions'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']

interface RentalInfo {
  id: string
  studentName: string
  className: string | null
  status: EquipmentRentalStatus
}

interface SlotEntry {
  slotId: string | null
  status: EquipmentSlotStatus
  rental: RentalInfo | null
}

interface AvailableSlot {
  date: string
  setA: SlotEntry | null
  setB: SlotEntry | null
}

interface ClassInfo {
  id: string
  name: string
}

interface EquipmentCalendarProps {
  today: string
  selectedDate: string
  availableSlots: AvailableSlot[]
  classes: ClassInfo[]
  studentId: string
}

export function EquipmentCalendar({
  today,
  selectedDate,
  availableSlots,
  classes,
}: EquipmentCalendarProps) {
  const router = useRouter()
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  )
  const [isReserving, setIsReserving] = useState(false)
  const [selectedClassId, setSelectedClassId] = useState<string>(classes[0]?.id ?? '')

  const [year, month] = selectedDate
    .split('-')
    .map((value, index) => (index < 2 ? Number(value) : value)) as [number, number, string]

  const slotMap = useMemo(
    () => new Map(availableSlots.map((slot) => [slot.date, slot])),
    [availableSlots]
  )
  const calendarCells = useMemo(() => buildCalendarCells(year, month), [year, month])

  const selectedWeekday = WEEKDAY_LABELS[new Date(`${selectedDate}T00:00:00Z`).getUTCDay()]
  const selectedSlot = slotMap.get(selectedDate)

  const handleSelectDate = (date: string) => {
    setFeedback(null)
    router.push(`/dashboard/student/equipment-rental?date=${date}`)
  }

  const handleChangeMonth = (delta: number) => {
    const base = new Date(Date.UTC(year, month - 1, 1))
    base.setUTCMonth(base.getUTCMonth() + delta)
    const target = formatDateToISO(base)
    handleSelectDate(target)
  }

  const handleReserve = async (slotId: string, setType: 'set_a' | 'set_b') => {
    if (!selectedClassId && classes.length > 0) {
      setFeedback({ type: 'error', message: '반을 선택해주세요.' })
      return
    }

    setIsReserving(true)
    setFeedback(null)

    try {
      const result = await createEquipmentRental({
        slotId,
        classId: selectedClassId || null,
      })

      if (result?.error) {
        setFeedback({ type: 'error', message: result.error })
      } else if (result?.rentalId) {
        setFeedback({
          type: 'success',
          message: `${formatSetTypeLabel(setType)} 예약이 완료되었습니다.`,
        })
        router.push(`/dashboard/student/equipment-rental/${result.rentalId}`)
      }
    } catch (error) {
      console.error('[equipment] reserve error', error)
      setFeedback({ type: 'error', message: '예약에 실패했습니다.' })
    } finally {
      setIsReserving(false)
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="space-y-3">
          <CardTitle className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleChangeMonth(-1)}
              aria-label="이전 달"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <span className="text-base font-semibold text-slate-900">
              {year}년 {month.toString().padStart(2, '0')}월
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleChangeMonth(1)}
              aria-label="다음 달"
            >
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
              const slot = slotMap.get(cell.date)
              const hasAvailable = slot && (slot.setA?.slotId || slot.setB?.slotId)
              const hasReserved = slot && (slot.setA?.rental || slot.setB?.rental)
              const isSelected = cell.date === selectedDate
              const isToday = cell.date === today
              const isPast = cell.date < today

              return (
                <button
                  key={cell.date}
                  type="button"
                  onClick={() => handleSelectDate(cell.date)}
                  disabled={isPast}
                  className={[
                    'flex h-12 flex-col items-center justify-center rounded-lg border text-xs transition',
                    cell.inCurrentMonth ? 'bg-white' : 'bg-slate-50 text-slate-400',
                    isSelected
                      ? 'border-emerald-400 bg-emerald-50 text-emerald-900'
                      : hasAvailable
                        ? 'border-emerald-200 bg-emerald-50/50 hover:border-emerald-300'
                        : hasReserved
                          ? 'border-amber-200 bg-amber-50/50 hover:border-amber-300'
                          : 'border-slate-200 hover:border-slate-300',
                    isPast ? 'cursor-not-allowed opacity-50' : '',
                  ].join(' ')}
                >
                  <span className="flex items-center gap-1">
                    <span className="text-sm font-medium">{cell.label}</span>
                    {isToday && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
                  </span>
                  {hasAvailable && (
                    <span className="mt-0.5 text-[10px] text-emerald-600">예약가능</span>
                  )}
                  {!hasAvailable && hasReserved && (
                    <span className="mt-0.5 text-[10px] text-amber-600">예약중</span>
                  )}
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="space-y-1">
          <CardTitle className="text-base font-semibold text-slate-900">
            {selectedDate} ({selectedWeekday}) 장비 예약
          </CardTitle>
          <p className="text-sm text-slate-600">
            예약 가능한 장비 세트를 선택하여 대여를 신청하세요.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {feedback && (
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
          )}

          {classes.length > 0 && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">반 선택</label>
              <Select value={selectedClassId} onValueChange={setSelectedClassId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="반을 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  {classes.map((cls) => (
                    <SelectItem key={cls.id} value={cls.id}>
                      {cls.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {selectedSlot ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {/* A 세트 */}
              {selectedSlot.setA?.slotId ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-emerald-800">A 세트</span>
                    <Badge variant="secondary" className="bg-emerald-100 text-emerald-700">
                      예약 가능
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm text-emerald-700">
                    촬영 장비 A세트를 대여할 수 있습니다.
                  </p>
                  <Button
                    className="mt-3 w-full"
                    onClick={() => handleReserve(selectedSlot.setA!.slotId!, 'set_a')}
                    disabled={isReserving}
                  >
                    {isReserving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    예약하기
                  </Button>
                </div>
              ) : selectedSlot.setA?.rental ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-amber-800">A 세트</span>
                    <Badge variant="secondary" className="bg-amber-100 text-amber-700">
                      예약됨
                    </Badge>
                  </div>
                  <div className="mt-3 space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-amber-600">반</span>
                      <span className="font-medium text-amber-800">
                        {selectedSlot.setA.rental.className ?? '-'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-amber-600">이름</span>
                      <span className="font-medium text-amber-800">
                        {selectedSlot.setA.rental.studentName}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-amber-600">대여 상태</span>
                      <Badge
                        variant="outline"
                        className={
                          selectedSlot.setA.rental.status === 'rented'
                            ? 'border-blue-200 bg-blue-50 text-blue-700'
                            : selectedSlot.setA.rental.status === 'returned'
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                              : 'border-amber-200 bg-amber-50 text-amber-700'
                        }
                      >
                        {formatRentalStatusLabel(selectedSlot.setA.rental.status)}
                      </Badge>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4">
                  <span className="font-medium text-slate-500">A 세트</span>
                  <p className="mt-2 text-sm text-slate-400">예약 가능한 슬롯이 없습니다.</p>
                </div>
              )}

              {/* B 세트 */}
              {selectedSlot.setB?.slotId ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-emerald-800">B 세트</span>
                    <Badge variant="secondary" className="bg-emerald-100 text-emerald-700">
                      예약 가능
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm text-emerald-700">
                    촬영 장비 B세트를 대여할 수 있습니다.
                  </p>
                  <Button
                    className="mt-3 w-full"
                    onClick={() => handleReserve(selectedSlot.setB!.slotId!, 'set_b')}
                    disabled={isReserving}
                  >
                    {isReserving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    예약하기
                  </Button>
                </div>
              ) : selectedSlot.setB?.rental ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-amber-800">B 세트</span>
                    <Badge variant="secondary" className="bg-amber-100 text-amber-700">
                      예약됨
                    </Badge>
                  </div>
                  <div className="mt-3 space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-amber-600">반</span>
                      <span className="font-medium text-amber-800">
                        {selectedSlot.setB.rental.className ?? '-'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-amber-600">이름</span>
                      <span className="font-medium text-amber-800">
                        {selectedSlot.setB.rental.studentName}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-amber-600">대여 상태</span>
                      <Badge
                        variant="outline"
                        className={
                          selectedSlot.setB.rental.status === 'rented'
                            ? 'border-blue-200 bg-blue-50 text-blue-700'
                            : selectedSlot.setB.rental.status === 'returned'
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                              : 'border-amber-200 bg-amber-50 text-amber-700'
                        }
                      >
                        {formatRentalStatusLabel(selectedSlot.setB.rental.status)}
                      </Badge>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4">
                  <span className="font-medium text-slate-500">B 세트</span>
                  <p className="mt-2 text-sm text-slate-400">예약 가능한 슬롯이 없습니다.</p>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
              <p className="text-sm text-slate-500">
                선택한 날짜에 예약 가능한 장비가 없습니다.
              </p>
              <p className="mt-1 text-xs text-slate-400">
                달력에서 &apos;예약가능&apos; 또는 &apos;예약중&apos; 표시가 있는 날짜를 선택하세요.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

