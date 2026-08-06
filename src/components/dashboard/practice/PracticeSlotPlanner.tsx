'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Loader2, Trash2 } from 'lucide-react'

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
import { buildCalendarCells, getMonthRange } from '@/lib/counseling'
import { formatKstDateTime, formatSlotDateLabel } from '@/lib/practice/shared'
import type { PracticeSlotBlockSummary } from '@/types/practice'

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']

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
  const [teacherIds, setTeacherIds] = useState<string[]>([])
  const [freeBookingOpensAt, setFreeBookingOpensAt] = useState('')
  const [notes, setNotes] = useState('')

  const calendarCells = useMemo(() => buildCalendarCells(year, month), [year, month])

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

  const estimatedSlotCount = useMemo(() => {
    const parse = (label: string) => {
      const match = label.match(/^(\d{1,2}):(\d{2})$/)
      if (!match) return null
      return Number(match[1]) * 60 + Number(match[2])
    }
    const start = parse(startTime)
    const end = parse(endTime)
    const minutes = Number(slotMinutes)
    if (start === null || end === null || !Number.isFinite(minutes) || minutes <= 0 || end <= start) {
      return 0
    }
    return Math.floor((end - start) / minutes) * teacherIds.length
  }, [startTime, endTime, slotMinutes, teacherIds.length])

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

    if (teacherIds.length === 0) {
      setFeedback({ type: 'error', message: '선생님을 1명 이상 선택해주세요.' })
      return
    }

    startTransition(async () => {
      const result = await createPracticeSlotBlockAction({
        blockDate: selectedDate,
        startTime,
        endTime,
        slotMinutes: Number(slotMinutes),
        teacherIds,
        freeBookingOpensAt: freeBookingOpensAt || null,
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
      setTeacherIds([])
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
              <Label>선생님 ({teacherIds.length}명 선택)</Label>
              <div className="flex flex-wrap gap-2 rounded-md border border-slate-200 bg-slate-50 p-3">
                {teachers.length === 0 ? (
                  <span className="text-xs text-slate-500">등록된 교직원이 없습니다.</span>
                ) : (
                  teachers.map((teacher) => {
                    const checked = teacherIds.includes(teacher.id)
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
                          onChange={(event) =>
                            setTeacherIds((prev) =>
                              event.target.checked
                                ? [...prev, teacher.id]
                                : prev.filter((id) => id !== teacher.id)
                            )
                          }
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
                  variant="outline"
                  size="sm"
                  disabled={isPending}
                  onClick={() => setTeacherIds(teachers.map((teacher) => teacher.id))}
                >
                  전체 선택
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={isPending || teacherIds.length === 0}
                  onClick={() => setTeacherIds([])}
                >
                  선택 해제
                </Button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="practice-block-free">자유 예약 공개 시각</Label>
                <Input
                  id="practice-block-free"
                  type="datetime-local"
                  value={freeBookingOpensAt}
                  onChange={(event) => setFreeBookingOpensAt(event.target.value)}
                  disabled={isPending}
                />
                <p className="text-xs text-slate-500">
                  비워두면 담임 배정만 가능합니다. 예: 전주 금요일 21:00으로 설정하면 그 시각부터 학생이 빈 슬롯을
                  직접 예약할 수 있습니다.
                </p>
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
            </div>

            <div className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
              <span>생성 예정 슬롯: {estimatedSlotCount}개</span>
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
                          자유 예약 {formatKstDateTime(block.freeBookingOpensAt)}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-slate-500">
                          담임 배정 전용
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-slate-500">선생님: {block.teacherNames.join(', ') || '없음'}</p>
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
