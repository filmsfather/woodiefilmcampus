'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Loader2, Trash2, X } from 'lucide-react'

import {
  createPracticeSlotBlockAction,
  deletePracticeSlotBlockAction,
} from '@/app/dashboard/manager/practice-feedback/actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { buildCalendarCells, getMonthRange } from '@/lib/counseling'
import {
  buildSlotTimeLabels,
  formatKstDateTime,
  formatSlotDateLabel,
  getPracticeBookingWindow,
} from '@/lib/practice/shared'
import { PRACTICE_ROOM_COUNT } from '@/lib/validation/practice'
import type { PracticeSlotBlockSummary } from '@/types/practice'

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']

const ROOM_NUMBERS = Array.from({ length: PRACTICE_ROOM_COUNT }, (_, index) => index + 1)

interface TeacherSelection {
  teacherId: string
  roomNo: number
  breakTimes: string[]
}

interface PracticeSlotPlannerProps {
  year: number
  month: number
  selectedDate: string
  today: string
  blocks: PracticeSlotBlockSummary[]
  teachers: Array<{ id: string; name: string }>
}

export function PracticeSlotPlanner({
  year,
  month,
  selectedDate,
  today,
  blocks,
  teachers,
}: PracticeSlotPlannerProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const [startTime, setStartTime] = useState('12:00')
  const [endTime, setEndTime] = useState('16:00')
  const [slotMinutes, setSlotMinutes] = useState('15')
  const [teacherSelections, setTeacherSelections] = useState<TeacherSelection[]>([])
  const [notes, setNotes] = useState('')

  const calendarCells = useMemo(() => buildCalendarCells(year, month), [year, month])

  const teacherNameMap = useMemo(() => new Map(teachers.map((teacher) => [teacher.id, teacher.name])), [teachers])

  /** 시작~종료/슬롯 길이에 따라 만들어질 시각 목록 (쉬는 시간 선택지) */
  const timeLabelOptions = useMemo(() => {
    const minutes = Number(slotMinutes)
    if (!Number.isFinite(minutes) || minutes <= 0) {
      return []
    }
    try {
      return buildSlotTimeLabels(startTime, endTime, minutes)
    } catch {
      return []
    }
  }, [startTime, endTime, slotMinutes])

  // 시간 범위가 바뀌어 선택지에서 사라진 쉬는 시간은 제거한다.
  useEffect(() => {
    setTeacherSelections((prev) => {
      if (prev.every((entry) => entry.breakTimes.every((breakTime) => timeLabelOptions.includes(breakTime)))) {
        return prev
      }
      return prev.map((entry) => ({
        ...entry,
        breakTimes: entry.breakTimes.filter((breakTime) => timeLabelOptions.includes(breakTime)),
      }))
    })
  }, [timeLabelOptions])

  const blocksByDate = useMemo(() => {
    const map = new Map<string, PracticeSlotBlockSummary[]>()
    for (const block of blocks) {
      const list = map.get(block.blockDate) ?? []
      list.push(block)
      map.set(block.blockDate, list)
    }
    return map
  }, [blocks])

  const selectedBlocks = blocksByDate.get(selectedDate) ?? []

  // 예약 창은 선택한 날짜가 속한 주 기준으로 자동 계산된다.
  const bookingWindow = useMemo(() => {
    try {
      return getPracticeBookingWindow(selectedDate)
    } catch {
      return null
    }
  }, [selectedDate])

  const estimatedSlotCount = timeLabelOptions.length * teacherSelections.length

  const estimatedBreakCount = teacherSelections.reduce(
    (sum, entry) => sum + entry.breakTimes.filter((breakTime) => timeLabelOptions.includes(breakTime)).length,
    0
  )

  const toggleTeacher = (teacherId: string, checked: boolean) => {
    if (!checked) {
      setTeacherSelections((prev) => prev.filter((entry) => entry.teacherId !== teacherId))
      return
    }
    if (teacherSelections.some((entry) => entry.teacherId === teacherId)) {
      return
    }
    if (teacherSelections.length >= PRACTICE_ROOM_COUNT) {
      setFeedback({
        type: 'error',
        message: `고사장이 ${PRACTICE_ROOM_COUNT}개이므로 선생님은 최대 ${PRACTICE_ROOM_COUNT}명까지 선택할 수 있습니다.`,
      })
      return
    }
    const usedRooms = new Set(teacherSelections.map((entry) => entry.roomNo))
    const nextRoom = ROOM_NUMBERS.find((room) => !usedRooms.has(room)) ?? 1
    setTeacherSelections((prev) => [...prev, { teacherId, roomNo: nextRoom, breakTimes: [] }])
  }

  const addBreakTime = (teacherId: string, label: string) => {
    setTeacherSelections((prev) =>
      prev.map((entry) =>
        entry.teacherId === teacherId && !entry.breakTimes.includes(label)
          ? { ...entry, breakTimes: [...entry.breakTimes, label].sort() }
          : entry
      )
    )
  }

  const removeBreakTime = (teacherId: string, label: string) => {
    setTeacherSelections((prev) =>
      prev.map((entry) =>
        entry.teacherId === teacherId
          ? { ...entry, breakTimes: entry.breakTimes.filter((breakTime) => breakTime !== label) }
          : entry
      )
    )
  }

  const updateSelection = (teacherId: string, patch: Partial<Omit<TeacherSelection, 'teacherId'>>) => {
    setTeacherSelections((prev) =>
      prev.map((entry) => (entry.teacherId === teacherId ? { ...entry, ...patch } : entry))
    )
  }

  const buildMonthHref = (offset: number) => {
    const base = new Date(Date.UTC(year, month - 1 + offset, 1))
    const nextYear = base.getUTCFullYear()
    const nextMonth = base.getUTCMonth() + 1
    const range = getMonthRange(nextYear, nextMonth)
    return `/dashboard/manager/practice-feedback/slots?date=${range.start}`
  }

  const handleSelectDate = (date: string) => {
    router.push(`/dashboard/manager/practice-feedback/slots?date=${date}`)
  }

  const handleCreate = () => {
    setFeedback(null)

    if (teacherSelections.length === 0) {
      setFeedback({ type: 'error', message: '선생님을 1명 이상 선택해주세요.' })
      return
    }

    startTransition(async () => {
      const result = await createPracticeSlotBlockAction({
        blockDate: selectedDate,
        startTime,
        endTime,
        slotMinutes: Number(slotMinutes),
        teachers: teacherSelections,
        notes: notes.trim() || null,
      })

      if (result.error) {
        setFeedback({ type: 'error', message: result.error })
        return
      }

      setFeedback({
        type: 'success',
        message: `슬롯 ${result.createdCount ?? 0}개를 만들었습니다.`,
      })
      setTeacherSelections([])
      setNotes('')
      router.refresh()
    })
  }

  const handleDeleteBlock = (blockId: string) => {
    if (!window.confirm('이 근무 블록과 예약 없는 슬롯을 모두 삭제할까요?')) {
      return
    }

    setFeedback(null)
    startTransition(async () => {
      const result = await deletePracticeSlotBlockAction({ blockId })
      if (result.error) {
        setFeedback({ type: 'error', message: result.error })
        return
      }
      setFeedback({ type: 'success', message: '근무 블록을 삭제했습니다.' })
      router.refresh()
    })
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="space-y-3">
          <CardTitle className="flex items-center justify-between">
            <Button variant="ghost" size="icon" asChild aria-label="이전 달">
              <a href={buildMonthHref(-1)}>
                <ChevronLeft className="h-5 w-5" />
              </a>
            </Button>
            <span className="text-base font-semibold text-slate-900">
              {year}년 {month.toString().padStart(2, '0')}월
            </span>
            <Button variant="ghost" size="icon" asChild aria-label="다음 달">
              <a href={buildMonthHref(1)}>
                <ChevronRight className="h-5 w-5" />
              </a>
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
              const dayBlocks = blocksByDate.get(cell.date) ?? []
              const slotTotal = dayBlocks.reduce((sum, block) => sum + block.slotCount, 0)
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
                    isSelected
                      ? 'border-emerald-400 bg-emerald-50 text-emerald-900'
                      : 'border-slate-200 hover:border-slate-300',
                  ].join(' ')}
                >
                  <span className="flex w-full items-center justify-between">
                    <span className="text-sm font-medium">{cell.label}</span>
                    {isToday ? <span className="h-2 w-2 rounded-full bg-emerald-500" /> : null}
                  </span>
                  {slotTotal > 0 ? (
                    <span className="text-[10px] text-slate-500">슬롯 {slotTotal}개</span>
                  ) : (
                    <span className="text-[10px] text-slate-400">없음</span>
                  )}
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

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

        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-slate-900">
              {formatSlotDateLabel(selectedDate)} 근무 블록 등록
            </CardTitle>
            <p className="text-sm text-slate-600">
              시간 범위와 선생님을 고르면 슬롯이 일괄 생성됩니다. 예: 12:00~16:00에 선생님 7명이면 15분 슬롯 112개.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="practice-block-start">시작 시각</Label>
                <Input
                  id="practice-block-start"
                  type="time"
                  step={300}
                  value={startTime}
                  onChange={(event) => setStartTime(event.target.value)}
                  disabled={isPending}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="practice-block-end">종료 시각</Label>
                <Input
                  id="practice-block-end"
                  type="time"
                  step={300}
                  value={endTime}
                  onChange={(event) => setEndTime(event.target.value)}
                  disabled={isPending}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="practice-block-minutes">슬롯 길이 (분)</Label>
                <Input
                  id="practice-block-minutes"
                  type="number"
                  min={5}
                  max={120}
                  step={5}
                  value={slotMinutes}
                  onChange={(event) => setSlotMinutes(event.target.value)}
                  disabled={isPending}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>
                선생님 ({teacherSelections.length}명 선택 · 최대 {PRACTICE_ROOM_COUNT}명)
              </Label>
              <div className="flex flex-wrap gap-2 rounded-md border border-slate-200 bg-slate-50 p-3">
                {teachers.length === 0 ? (
                  <span className="text-xs text-slate-500">등록된 교직원이 없습니다.</span>
                ) : (
                  teachers.map((teacher) => {
                    const checked = teacherSelections.some((entry) => entry.teacherId === teacher.id)
                    return (
                      <label
                        key={teacher.id}
                        className={[
                          'flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition',
                          checked
                            ? 'border-emerald-400 bg-emerald-50 text-emerald-900'
                            : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300',
                        ].join(' ')}
                      >
                        <Checkbox
                          checked={checked}
                          disabled={isPending}
                          onChange={(event) => toggleTeacher(teacher.id, event.target.checked)}
                        />
                        {teacher.name}
                      </label>
                    )
                  })
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={isPending || teacherSelections.length === 0}
                  onClick={() => setTeacherSelections([])}
                >
                  선택 해제
                </Button>
              </div>
            </div>

            {teacherSelections.length > 0 ? (
              <div className="space-y-2">
                <Label>고사장 · 쉬는 시간</Label>
                <p className="text-xs text-slate-500">
                  학생 화면에는 선생님 이름 대신 고사장 이름이 표시됩니다. 쉬는 시간을 지정하면 그 시각 슬롯은
                  예약이 막힙니다.
                </p>
                <div className="space-y-2 rounded-md border border-slate-200 bg-white p-3">
                  {teacherSelections.map((selection) => {
                    const usedRooms = new Set(
                      teacherSelections
                        .filter((entry) => entry.teacherId !== selection.teacherId)
                        .map((entry) => entry.roomNo)
                    )
                    const remainingBreakOptions = timeLabelOptions.filter(
                      (label) => !selection.breakTimes.includes(label)
                    )
                    return (
                      <div
                        key={selection.teacherId}
                        className="space-y-1.5 border-b border-slate-100 pb-2 last:border-b-0 last:pb-0"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="min-w-[96px] flex-1 truncate text-sm font-medium text-slate-800">
                            {teacherNameMap.get(selection.teacherId) ?? '이름 없음'}
                          </span>
                          <Select
                            value={String(selection.roomNo)}
                            onValueChange={(value) => updateSelection(selection.teacherId, { roomNo: Number(value) })}
                            disabled={isPending}
                          >
                            <SelectTrigger className="w-[120px]" size="sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {ROOM_NUMBERS.map((room) => (
                                <SelectItem key={room} value={String(room)} disabled={usedRooms.has(room)}>
                                  {room}고사장
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Select
                            value=""
                            onValueChange={(value) => addBreakTime(selection.teacherId, value)}
                            disabled={isPending || remainingBreakOptions.length === 0}
                          >
                            <SelectTrigger className="w-[150px]" size="sm">
                              <SelectValue placeholder="쉬는 시간 추가" />
                            </SelectTrigger>
                            <SelectContent>
                              {remainingBreakOptions.map((label) => (
                                <SelectItem key={label} value={label}>
                                  {label} 쉬기
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        {selection.breakTimes.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {selection.breakTimes.map((label) => (
                              <Badge key={label} variant="secondary" className="gap-1 pr-1 font-mono text-[11px]">
                                {label} 휴식
                                <button
                                  type="button"
                                  disabled={isPending}
                                  onClick={() => removeBreakTime(selection.teacherId, label)}
                                  className="rounded-full p-0.5 hover:bg-slate-300/60"
                                  aria-label={`${label} 쉬는 시간 삭제`}
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </Badge>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : null}

            <div className="space-y-2">
              <Label>학생 예약 기간</Label>
              <div className="space-y-1 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                {bookingWindow ? (
                  <>
                    <p>
                      <span className="font-medium text-slate-800">1차</span>{' '}
                      {formatKstDateTime(bookingWindow.phase1OpensAt)} · 하루 1타임
                    </p>
                    <p>
                      <span className="font-medium text-slate-800">2차</span>{' '}
                      {formatKstDateTime(bookingWindow.phase2OpensAt)} · 하루 3타임(누적)
                    </p>
                    <p>
                      <span className="font-medium text-slate-800">마감</span>{' '}
                      {formatKstDateTime(bookingWindow.closesAt)} (직전 일요일 자정)
                    </p>
                    <p className="text-slate-500">
                      선택한 날짜가 속한 주 기준으로 자동 계산됩니다. 같은 주의 블록은 함께 열리고 함께 닫힙니다.
                      마감 전후 모두 선생님 배정은 가능합니다.
                    </p>
                  </>
                ) : (
                  <p>날짜를 선택하면 예약 기간이 표시됩니다.</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="practice-block-notes">메모</Label>
              <Input
                id="practice-block-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="예: 오후 1부"
                maxLength={500}
                disabled={isPending}
              />
            </div>

            <div className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
              <span>
                생성 예정 슬롯: {estimatedSlotCount}개
                {estimatedBreakCount > 0 ? ` (쉬는 시간 ${estimatedBreakCount}개 포함)` : ''}
              </span>
              <Button size="sm" onClick={handleCreate} disabled={isPending || estimatedSlotCount === 0}>
                {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                슬롯 만들기
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-slate-900">
              {formatSlotDateLabel(selectedDate)} 등록된 블록
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {selectedBlocks.length === 0 ? (
              <p className="text-sm text-slate-500">이 날짜에 등록된 근무 블록이 없습니다.</p>
            ) : (
              selectedBlocks.map((block) => (
                <div
                  key={block.id}
                  className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-slate-200 bg-white p-3"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-slate-900">
                        {block.startTime} ~ {block.endTime}
                      </span>
                      <Badge variant="secondary">{block.slotMinutes}분 단위</Badge>
                      <Badge variant="outline">슬롯 {block.slotCount}개</Badge>
                      {block.freeBookingOpensAt ? (
                        <Badge variant="outline" className="text-emerald-700">
                          1차 {formatKstDateTime(block.freeBookingOpensAt)}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-slate-500">
                          담임 배정 전용
                        </Badge>
                      )}
                      {block.phase2OpensAt ? (
                        <Badge variant="outline" className="text-emerald-700">
                          2차 {formatKstDateTime(block.phase2OpensAt)}
                        </Badge>
                      ) : null}
                      {block.bookingClosesAt ? (
                        <Badge variant="outline" className="text-amber-700">
                          마감 {formatKstDateTime(block.bookingClosesAt)}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="text-xs text-slate-500">
                      선생님:{' '}
                      {block.teachers.length > 0
                        ? block.teachers
                            .map((teacher) =>
                              [
                                teacher.name,
                                teacher.roomNo ? `${teacher.roomNo}고사장` : null,
                                teacher.breakTimes.length > 0 ? `${teacher.breakTimes.join('·')} 휴식` : null,
                              ]
                                .filter(Boolean)
                                .join(' · ')
                            )
                            .join(', ')
                        : '없음'}
                    </p>
                    {block.notes ? <p className="text-xs text-slate-500">{block.notes}</p> : null}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:text-red-700"
                    disabled={isPending}
                    onClick={() => handleDeleteBlock(block.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                    <span className="sr-only">블록 삭제</span>
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
