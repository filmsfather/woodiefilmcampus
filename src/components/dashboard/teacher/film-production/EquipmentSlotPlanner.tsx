'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Loader2, Camera, Check } from 'lucide-react'

import {
  buildCalendarCells,
  formatDateToISO,
  formatSetTypeLabel,
  formatSlotStatusLabel,
  getSlotStatusBadgeStyle,
  getRentalStatusBadgeStyle,
  formatRentalStatusLabel,
  type EquipmentSetType,
  type EquipmentSlotStatus,
  type EquipmentRentalStatus,
} from '@/lib/equipment-rental'
import {
  openEquipmentSlot,
  updateEquipmentSlotStatus,
  deleteEquipmentSlot,
  batchOpenEquipmentSlots,
} from '@/app/dashboard/teacher/film-production/actions'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']

interface RentalInfo {
  id: string
  studentId: string
  studentName: string
  className: string | null
  memo: string | null
  status: EquipmentRentalStatus
  checkoutPhotoPath: string | null
  returnPhotoPath: string | null
  checkedOutAt: string | null
  returnedAt: string | null
  createdAt: string
}

interface DaySlotInfo {
  id: string
  setType: EquipmentSetType
  status: EquipmentSlotStatus
  notes: string | null
  rental: RentalInfo | null
}

interface DaySummaryItem {
  date: string
  setA: EquipmentSlotStatus | null
  setB: EquipmentSlotStatus | null
}

interface EquipmentSlotPlannerProps {
  selectedDate: string
  today: string
  daySlots: DaySlotInfo[]
  monthSummary: DaySummaryItem[]
}

function getSetStatusDot(status: EquipmentSlotStatus | null) {
  if (!status) return 'bg-slate-300'
  switch (status) {
    case 'open':
      return 'bg-emerald-500'
    case 'reserved':
      return 'bg-amber-500'
    case 'closed':
      return 'bg-slate-400'
    default:
      return 'bg-slate-300'
  }
}

export function EquipmentSlotPlanner({
  selectedDate,
  today,
  daySlots,
  monthSummary,
}: EquipmentSlotPlannerProps) {
  const router = useRouter()
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  )
  const [busySlotId, setBusySlotId] = useState<string | null>(null)
  const [isOpening, setIsOpening] = useState<EquipmentSetType | null>(null)

  // 일괄 선택 모드
  const [batchMode, setBatchMode] = useState(false)
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set())
  const [batchSetA, setBatchSetA] = useState(true)
  const [batchSetB, setBatchSetB] = useState(true)
  const [isBatchOpening, setIsBatchOpening] = useState(false)

  const [year, month] = selectedDate
    .split('-')
    .map((value, index) => (index < 2 ? Number(value) : value)) as [number, number, string]
  const summaryMap = useMemo(
    () => new Map(monthSummary.map((item) => [item.date, item])),
    [monthSummary]
  )
  const calendarCells = useMemo(() => buildCalendarCells(year, month), [year, month])

  const selectedWeekday = WEEKDAY_LABELS[new Date(`${selectedDate}T00:00:00Z`).getUTCDay()]

  const slotBySetType = useMemo(() => {
    const map = new Map<EquipmentSetType, DaySlotInfo>()
    for (const slot of daySlots) {
      map.set(slot.setType, slot)
    }
    return map
  }, [daySlots])

  const handleSelectDate = (date: string) => {
    if (batchMode) {
      // 일괄 선택 모드: 날짜 토글
      setSelectedDates((prev) => {
        const next = new Set(prev)
        if (next.has(date)) {
          next.delete(date)
        } else {
          next.add(date)
        }
        return next
      })
    } else {
      // 일반 모드: 페이지 이동
      setFeedback(null)
      router.push(`/dashboard/teacher/film-production?date=${date}`)
    }
  }

  const handleChangeMonth = (delta: number) => {
    const base = new Date(Date.UTC(year, month - 1, 1))
    base.setUTCMonth(base.getUTCMonth() + delta)
    const target = formatDateToISO(base)
    setFeedback(null)
    setSelectedDates(new Set())
    router.push(`/dashboard/teacher/film-production?date=${target}`)
  }

  const handleToggleBatchMode = () => {
    setBatchMode((prev) => !prev)
    setSelectedDates(new Set())
    setFeedback(null)
  }

  const handleBatchOpen = async () => {
    if (selectedDates.size === 0) {
      setFeedback({ type: 'error', message: '날짜를 선택해주세요.' })
      return
    }

    const setTypes: EquipmentSetType[] = []
    if (batchSetA) setTypes.push('set_a')
    if (batchSetB) setTypes.push('set_b')

    if (setTypes.length === 0) {
      setFeedback({ type: 'error', message: '세트를 선택해주세요.' })
      return
    }

    setIsBatchOpening(true)
    setFeedback(null)

    try {
      const result = await batchOpenEquipmentSlots({
        dates: Array.from(selectedDates).sort(),
        setTypes,
      })

      if (result?.error) {
        setFeedback({ type: 'error', message: result.error })
      } else {
        setFeedback({
          type: 'success',
          message: `${selectedDates.size}개 날짜에 슬롯이 오픈되었습니다.`,
        })
        setSelectedDates(new Set())
        setBatchMode(false)
        router.refresh()
      }
    } catch (error) {
      console.error('[equipment] batch open error', error)
      setFeedback({ type: 'error', message: '일괄 오픈에 실패했습니다.' })
    } finally {
      setIsBatchOpening(false)
    }
  }

  const handleOpenSlot = async (setType: EquipmentSetType) => {
    setIsOpening(setType)
    setFeedback(null)
    try {
      const result = await openEquipmentSlot({ slotDate: selectedDate, setType })
      if (result?.error) {
        setFeedback({ type: 'error', message: result.error })
      } else {
        setFeedback({
          type: 'success',
          message: `${formatSetTypeLabel(setType)} 예약이 오픈되었습니다.`,
        })
        router.refresh()
      }
    } catch (error) {
      console.error('[equipment] open slot client error', error)
      setFeedback({ type: 'error', message: '슬롯을 오픈하지 못했습니다.' })
    } finally {
      setIsOpening(null)
    }
  }

  const handleUpdateSlot = async (slotId: string, status: EquipmentSlotStatus) => {
    setBusySlotId(slotId)
    setFeedback(null)
    try {
      const result = await updateEquipmentSlotStatus({ slotId, status })
      if (result?.error) {
        setFeedback({ type: 'error', message: result.error })
      } else {
        setFeedback({ type: 'success', message: '슬롯 상태를 변경했습니다.' })
        router.refresh()
      }
    } catch (error) {
      console.error('[equipment] update slot client error', error)
      setFeedback({ type: 'error', message: '슬롯 상태 변경에 실패했습니다.' })
    } finally {
      setBusySlotId(null)
    }
  }

  const handleDeleteSlot = async (slotId: string) => {
    setBusySlotId(slotId)
    setFeedback(null)
    try {
      const result = await deleteEquipmentSlot({ slotId })
      if (result?.error) {
        setFeedback({ type: 'error', message: result.error })
      } else {
        setFeedback({ type: 'success', message: '슬롯을 삭제했습니다.' })
        router.refresh()
      }
    } catch (error) {
      console.error('[equipment] delete slot client error', error)
      setFeedback({ type: 'error', message: '슬롯 삭제에 실패했습니다.' })
    } finally {
      setBusySlotId(null)
    }
  }

  const renderSetSlot = (setType: EquipmentSetType) => {
    const slot = slotBySetType.get(setType)
    const isBusy = busySlotId === slot?.id

    if (!slot) {
      // 슬롯 없음 - 오픈 버튼 표시
      return (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4">
          <div className="flex items-center justify-between">
            <span className="font-medium text-slate-700">{formatSetTypeLabel(setType)}</span>
            <Button
              size="sm"
              onClick={() => handleOpenSlot(setType)}
              disabled={isOpening === setType}
            >
              {isOpening === setType ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              오픈하기
            </Button>
          </div>
          <p className="mt-2 text-sm text-slate-500">예약 가능 슬롯이 없습니다.</p>
        </div>
      )
    }

    return (
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-700">{formatSetTypeLabel(setType)}</span>
            <Badge className={getSlotStatusBadgeStyle(slot.status)}>
              {formatSlotStatusLabel(slot.status)}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            {slot.status === 'open' && !slot.rental && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleUpdateSlot(slot.id, 'closed')}
                  disabled={isBusy}
                >
                  닫기
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => handleDeleteSlot(slot.id)}
                  disabled={isBusy}
                  aria-label="삭제"
                >
                  ×
                </Button>
              </>
            )}
            {slot.status === 'closed' && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleUpdateSlot(slot.id, 'open')}
                disabled={isBusy}
              >
                다시 열기
              </Button>
            )}
          </div>
        </div>

        {slot.rental && (
          <div className="mt-3 rounded-md border border-amber-100 bg-amber-50 px-3 py-2">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-semibold text-amber-800">{slot.rental.studentName}</span>
              {slot.rental.className && (
                <span className="text-amber-700">({slot.rental.className})</span>
              )}
              <Badge className={getRentalStatusBadgeStyle(slot.rental.status)}>
                {formatRentalStatusLabel(slot.rental.status)}
              </Badge>
            </div>
            {slot.rental.memo && (
              <p className="mt-1 text-xs text-amber-700">{slot.rental.memo}</p>
            )}
            <div className="mt-2 flex items-center gap-3 text-xs text-amber-600">
              <span className="flex items-center gap-1">
                <Camera className="h-3 w-3" />
                대여: {slot.rental.checkoutPhotoPath ? '✓' : '—'}
              </span>
              <span className="flex items-center gap-1">
                <Camera className="h-3 w-3" />
                반납: {slot.rental.returnPhotoPath ? '✓' : '—'}
              </span>
            </div>
          </div>
        )}
      </div>
    )
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
          <div className="flex items-center justify-between">
            <div className="grid grid-cols-7 flex-1 text-center text-xs font-medium text-slate-500">
              {WEEKDAY_LABELS.map((weekday) => (
                <span key={weekday}>{weekday}</span>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-7 gap-1 text-sm">
            {calendarCells.map((cell) => {
              const summary = summaryMap.get(cell.date)
              const isSelected = batchMode ? selectedDates.has(cell.date) : cell.date === selectedDate
              const isToday = cell.date === today
              return (
                <button
                  key={cell.date}
                  type="button"
                  onClick={() => handleSelectDate(cell.date)}
                  className={[
                    'flex h-14 flex-col items-center justify-between rounded-lg border p-1 text-xs transition',
                    cell.inCurrentMonth ? 'bg-white' : 'bg-slate-50 text-slate-400',
                    isSelected
                      ? batchMode
                        ? 'border-blue-400 bg-blue-50 text-blue-900'
                        : 'border-emerald-400 bg-emerald-50 text-emerald-900'
                      : 'border-slate-200 hover:border-slate-300',
                  ].join(' ')}
                >
                  <span className="flex w-full items-center justify-between">
                    <span className="text-sm font-medium">{cell.label}</span>
                    {isToday ? <span className="h-2 w-2 rounded-full bg-emerald-500" /> : null}
                    {batchMode && isSelected ? (
                      <Check className="h-3 w-3 text-blue-600" />
                    ) : null}
                  </span>
                  <span className="flex items-center gap-1">
                    <span
                      className={`h-2 w-2 rounded-full ${getSetStatusDot(summary?.setA ?? null)}`}
                      title="A 세트"
                    />
                    <span
                      className={`h-2 w-2 rounded-full ${getSetStatusDot(summary?.setB ?? null)}`}
                      title="B 세트"
                    />
                  </span>
                </button>
              )
            })}
          </div>
          <div className="flex items-center justify-between text-xs text-slate-500">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-emerald-500" /> 오픈
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-amber-500" /> 예약됨
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-slate-400" /> 마감
              </span>
            </div>
          </div>
          <Button
            variant={batchMode ? 'default' : 'outline'}
            size="sm"
            className="w-full"
            onClick={handleToggleBatchMode}
          >
            {batchMode ? '일괄 선택 취소' : '일괄 오픈 모드'}
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {/* 일괄 오픈 패널 */}
        {batchMode && (
          <Card className="border-blue-200 bg-blue-50/50 shadow-sm">
            <CardHeader className="space-y-1">
              <CardTitle className="text-base font-semibold text-blue-900">
                일괄 오픈
              </CardTitle>
              <p className="text-sm text-blue-700">
                달력에서 날짜를 클릭하여 선택하고, 아래 옵션을 설정한 후 오픈하기 버튼을 누르세요.
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

              <div className="space-y-2">
                <span className="text-sm font-medium text-blue-800">선택된 날짜</span>
                {selectedDates.size > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {Array.from(selectedDates)
                      .sort()
                      .map((date) => (
                        <Badge
                          key={date}
                          variant="secondary"
                          className="bg-blue-100 text-blue-800"
                        >
                          {date}
                        </Badge>
                      ))}
                  </div>
                ) : (
                  <p className="text-sm text-blue-600">달력에서 날짜를 클릭하세요.</p>
                )}
              </div>

              <div className="space-y-2">
                <span className="text-sm font-medium text-blue-800">오픈할 세트</span>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={batchSetA}
                      onChange={(e) => setBatchSetA(e.target.checked)}
                    />
                    <span className="text-sm text-blue-800">A 세트</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={batchSetB}
                      onChange={(e) => setBatchSetB(e.target.checked)}
                    />
                    <span className="text-sm text-blue-800">B 세트</span>
                  </label>
                </div>
              </div>

              <Button
                className="w-full"
                onClick={handleBatchOpen}
                disabled={isBatchOpening || selectedDates.size === 0}
              >
                {isBatchOpening ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                {selectedDates.size > 0
                  ? `${selectedDates.size}개 날짜 일괄 오픈`
                  : '날짜를 선택하세요'}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* 개별 날짜 슬롯 관리 */}
        {!batchMode && (
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="space-y-1">
              <CardTitle className="text-base font-semibold text-slate-900">
                {selectedDate} ({selectedWeekday}) 장비 예약
              </CardTitle>
              <p className="text-sm text-slate-600">
                A세트와 B세트의 예약 가능 상태를 관리합니다. 오픈 버튼을 눌러 학생들이 예약할 수 있도록
                슬롯을 열어주세요.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
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

              <div className="grid gap-4 sm:grid-cols-2">
                {renderSetSlot('set_a')}
                {renderSetSlot('set_b')}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
