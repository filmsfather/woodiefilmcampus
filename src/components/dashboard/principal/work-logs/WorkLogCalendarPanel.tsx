'use client'

import { Fragment, useEffect, useMemo, useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import {
  WORK_LOG_REVIEW_STATUS_LABEL,
  WORK_LOG_STATUS_OPTIONS,
  requiresWorkHours,
  resolveMonthRange,
  type TeacherProfileSummary,
  type WorkLogEntryWithTeacher,
  type WorkLogStatus,
} from '@/lib/work-logs'

interface WorkLogCalendarPanelProps {
  entries: WorkLogEntryWithTeacher[]
  monthToken: string
  monthLabel: string
  teacherDirectory: Record<string, TeacherProfileSummary>
  activeTeacherId: string | null
}

type CalendarDay = {
  iso: string
  date: Date
  isCurrentMonth: boolean
  isToday: boolean
}

type WeekSummary = {
  key: string
  start: Date
  end: Date
  totalHours: number
}

function toDateToken(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function buildMonthDays(monthStartDate: string): CalendarDay[] {
  const [yearToken, monthToken, dayToken] = monthStartDate.split('-').map((token) => Number.parseInt(token, 10))
  const firstDay = new Date(yearToken, monthToken - 1, dayToken)
  const startWeekDay = firstDay.getDay()

  const todayToken = toDateToken(new Date())
  const days: CalendarDay[] = []

  for (let offset = startWeekDay; offset > 0; offset -= 1) {
    const date = new Date(firstDay)
    date.setDate(firstDay.getDate() - offset)
    days.push({
      date,
      iso: toDateToken(date),
      isCurrentMonth: false,
      isToday: toDateToken(date) === todayToken,
    })
  }

  const lastDay = new Date(firstDay.getFullYear(), firstDay.getMonth() + 1, 0)
  for (let day = 1; day <= lastDay.getDate(); day += 1) {
    const date = new Date(firstDay.getFullYear(), firstDay.getMonth(), day)
    days.push({
      date,
      iso: toDateToken(date),
      isCurrentMonth: true,
      isToday: toDateToken(date) === todayToken,
    })
  }

  const remainder = (7 - (days.length % 7)) % 7
  for (let i = 1; i <= remainder; i += 1) {
    const date = new Date(lastDay.getFullYear(), lastDay.getMonth(), lastDay.getDate() + i)
    days.push({
      date,
      iso: toDateToken(date),
      isCurrentMonth: false,
      isToday: toDateToken(date) === todayToken,
    })
  }

  return days
}

function weekStart(date: Date): Date {
  const start = new Date(date)
  const day = start.getDay()
  const diff = (day + 6) % 7
  start.setDate(start.getDate() - diff)
  start.setHours(0, 0, 0, 0)
  return start
}

function clampDate(value: Date, min: Date, max: Date): Date {
  if (value.getTime() < min.getTime()) {
    return new Date(min.getTime())
  }
  if (value.getTime() > max.getTime()) {
    return new Date(max.getTime())
  }
  return value
}

function summarizeWeeks(entries: Record<string, WorkLogEntryWithTeacher>, days: CalendarDay[], monthStart: Date, monthEnd: Date): WeekSummary[] {
  const result = new Map<string, WeekSummary>()
  for (const day of days) {
    if (!day.isCurrentMonth) {
      continue
    }
    const entry = entries[day.iso]
    if (!entry || !requiresWorkHours(entry.status) || !entry.workHours) {
      continue
    }
    const start = weekStart(day.date)
    const end = new Date(start)
    end.setDate(start.getDate() + 6)

    const clampedStart = clampDate(start, monthStart, monthEnd)
    const clampedEnd = clampDate(end, monthStart, monthEnd)
    const key = toDateToken(clampedStart)
    const hours = Number(entry.workHours)

    const existing = result.get(key)
    if (existing) {
      existing.totalHours += hours
    } else {
      result.set(key, {
        key,
        start: clampedStart,
        end: clampedEnd,
        totalHours: hours,
      })
    }
  }
  return Array.from(result.values()).sort((a, b) => a.start.getTime() - b.start.getTime())
}

function formatHours(value: number | null | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '0'
  }
  return Number.isInteger(value) ? `${value}` : value.toFixed(1)
}

function getDefaultSelection(monthStartDate: string, entryMap: Record<string, WorkLogEntryWithTeacher>): string {
  const todayToken = toDateToken(new Date())
  if (todayToken.startsWith(monthStartDate.slice(0, 7)) && entryMap[todayToken]) {
    return todayToken
  }
  const firstEntry = Object.values(entryMap).sort((a, b) => a.workDate.localeCompare(b.workDate))[0]
  if (firstEntry) {
    return firstEntry.workDate
  }
  return monthStartDate
}

function getStatusMeta(status: WorkLogStatus) {
  return WORK_LOG_STATUS_OPTIONS.find((option) => option.value === status)
}

export function WorkLogCalendarPanel({ entries, monthToken, monthLabel, teacherDirectory, activeTeacherId }: WorkLogCalendarPanelProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const monthRange = useMemo(() => resolveMonthRange(monthToken), [monthToken])
  const monthStartDate = monthRange.startDate
  const monthStartBound = useMemo(() => new Date(monthRange.start), [monthRange.start])
  const monthEndBound = useMemo(() => new Date(new Date(monthRange.endExclusive).getTime() - 1), [monthRange.endExclusive])

  const days = useMemo(() => buildMonthDays(monthStartDate), [monthStartDate])

  const teacherOptions = useMemo(
    () =>
      Object.values(teacherDirectory).sort((a, b) => {
        const labelA = a.name ?? a.email ?? ''
        const labelB = b.name ?? b.email ?? ''
        return labelA.localeCompare(labelB, 'ko')
      }),
    [teacherDirectory]
  )

  const selectedTeacher = activeTeacherId ? teacherDirectory[activeTeacherId] ?? null : null

  const teacherEntries = useMemo(() => {
    if (!selectedTeacher) {
      return [] as WorkLogEntryWithTeacher[]
    }
    return entries
      .filter((entry) => entry.teacherId === selectedTeacher.id)
      .sort((a, b) => a.workDate.localeCompare(b.workDate))
  }, [entries, selectedTeacher])

  const entryMap = useMemo(() => {
    const map: Record<string, WorkLogEntryWithTeacher> = {}
    teacherEntries.forEach((entry) => {
      map[entry.workDate] = entry
    })
    return map
  }, [teacherEntries])

  const [selectedDate, setSelectedDate] = useState<string>(() => getDefaultSelection(monthStartDate, entryMap))

  useEffect(() => {
    setSelectedDate(getDefaultSelection(monthStartDate, entryMap))
  }, [monthStartDate, entryMap])

  const selectedEntry = entryMap[selectedDate] ?? null

  const weeklySummaries = useMemo(() => summarizeWeeks(entryMap, days, monthStartBound, monthEndBound), [entryMap, days, monthStartBound, monthEndBound])
  const monthlyTotal = useMemo(
    () =>
      teacherEntries
        .filter((entry) => requiresWorkHours(entry.status) && typeof entry.workHours === 'number')
        .reduce((sum, entry) => sum + (entry.workHours ?? 0), 0),
    [teacherEntries]
  )

  const updateSearchParams = (paramsToMerge: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams?.toString())
    Object.entries(paramsToMerge).forEach(([key, value]) => {
      if (value === null) {
        params.delete(key)
      } else {
        params.set(key, value)
      }
    })
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`)
    })
  }

  const shiftMonth = (offset: number) => {
    const [yearToken, monthTokenPart] = monthToken.split('-')
    const year = Number.parseInt(yearToken, 10)
    const month = Number.parseInt(monthTokenPart, 10) - 1
    const target = new Date(year, month + offset, 1)
    const nextYear = target.getFullYear()
    const nextMonth = `${target.getMonth() + 1}`.padStart(2, '0')
    updateSearchParams({ month: `${nextYear}-${nextMonth}` })
  }

  const handleTeacherSelect = (teacherId: string | null) => {
    updateSearchParams({ teacher: teacherId })
  }

  return (
    <Card className="border-slate-200">
      <CardHeader>
        <CardTitle className="text-lg text-slate-900">교사 근무 달력</CardTitle>
        <CardDescription>교사를 선택하면 해당 월의 근무일지를 달력으로 확인할 수 있습니다.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <span className="block text-xs font-medium text-slate-500">교사 선택</span>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={!selectedTeacher ? 'default' : 'outline'}
              onClick={() => handleTeacherSelect(null)}
              disabled={isPending}
            >
              전체 보기
            </Button>
            {teacherOptions.map((teacher) => {
              const isActive = teacher.id === activeTeacherId
              return (
                <Button
                  key={teacher.id}
                  type="button"
                  size="sm"
                  variant={isActive ? 'default' : 'outline'}
                  onClick={() => handleTeacherSelect(teacher.id)}
                  disabled={isPending}
                  className={cn('whitespace-nowrap')}
                >
                  {teacher.name ?? teacher.email ?? '이름 미기재'}
                </Button>
              )
            })}
          </div>
        </div>

        <div className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
          <span>{monthLabel}</span>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => shiftMonth(-1)} disabled={isPending}>
              이전 달
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => shiftMonth(1)} disabled={isPending}>
              다음 달
            </Button>
          </div>
        </div>

        {!selectedTeacher ? (
          <div className="rounded-md border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">
            달력을 보려면 상단에서 교사를 선택하세요.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-md border border-slate-200 bg-white p-4">
              <div className="text-sm text-slate-600">
                {selectedTeacher.name ?? selectedTeacher.email ?? '이름 미기재'} 선생님 근무 기록
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[2fr_3fr]">
              <div className="space-y-4">
                <div className="grid grid-cols-7 gap-px rounded-md border border-slate-200 bg-slate-200 text-xs">
                  {['일', '월', '화', '수', '목', '금', '토'].map((label) => (
                    <div key={label} className="bg-slate-100 py-2 text-center font-medium text-slate-600">
                      {label}
                    </div>
                  ))}
                  {days.map((day) => {
                    const entry = entryMap[day.iso]
                    const isSelected = selectedDate === day.iso
                    const statusLabel = entry ? getStatusMeta(entry.status)?.label : null
                    const reviewChip = entry ? WORK_LOG_REVIEW_STATUS_LABEL[entry.reviewStatus] : null

                    return (
                      <button
                        key={day.iso}
                        type="button"
                        onClick={() => setSelectedDate(day.iso)}
                        disabled={!day.isCurrentMonth}
                        className={cn(
                          'flex min-h-[112px] flex-col gap-2 border border-slate-100 bg-white p-2 text-left text-xs transition focus:outline-none focus:ring-2 focus:ring-slate-400',
                          !day.isCurrentMonth && 'bg-slate-50 text-slate-400',
                          day.isToday && 'border-slate-400',
                          isSelected && 'ring-2 ring-slate-500'
                        )}
                      >
                        <div className="flex items-center justify-between text-[11px] font-medium">
                          <span>{day.date.getDate()}</span>
                          {day.isToday ? <span className="text-slate-500">오늘</span> : null}
                        </div>
                        {entry ? (
                          <div className="flex flex-col gap-1 text-[11px] text-slate-600">
                            {statusLabel ? <span className="font-semibold text-slate-700">{statusLabel}</span> : null}
                            {requiresWorkHours(entry.status) && entry.workHours ? (
                              <span>{`근무 ${formatHours(entry.workHours)}시간`}</span>
                            ) : null}
                            {entry.status === 'substitute' ? (
                              <span>
                                대타 ·{' '}
                                {entry.substituteType === 'internal'
                                  ? '학원 선생님'
                                  : `외부 선생님${
                                      entry.externalTeacherHours
                                        ? ` · ${formatHours(entry.externalTeacherHours)}시간`
                                        : ''
                                    }`}
                              </span>
                            ) : null}
                            {reviewChip ? (
                              <span className="inline-flex w-fit rounded bg-slate-100 px-1 py-0.5 text-[10px] font-medium text-slate-700">
                                {reviewChip}
                              </span>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400">기록 없음</span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="space-y-4">
                <Card className="border-slate-200">
                  <CardHeader>
                    <CardTitle className="text-base text-slate-900">{selectedDate} 근무 상세</CardTitle>
                    <CardDescription>
                      {selectedEntry
                        ? `${WORK_LOG_STATUS_OPTIONS.find((option) => option.value === selectedEntry.status)?.description ?? ''}`
                        : '선택한 날짜의 근무 기록이 없습니다.'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm text-slate-600">
                    {!selectedEntry ? (
                      <div className="rounded-md border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">
                        기록이 없어요.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="rounded border border-slate-200 bg-slate-50 px-2 py-1 font-medium text-slate-700">
                            상태: {WORK_LOG_REVIEW_STATUS_LABEL[selectedEntry.reviewStatus]}
                          </span>
                          {requiresWorkHours(selectedEntry.status) && selectedEntry.workHours ? (
                            <span className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-slate-600">
                              근무 시간: {formatHours(selectedEntry.workHours)}시간
                            </span>
                          ) : null}
                          {selectedEntry.status === 'substitute' && selectedEntry.substituteType === 'external' && selectedEntry.externalTeacherHours ? (
                            <span className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-slate-600">
                              외부 대타 시간: {formatHours(selectedEntry.externalTeacherHours)}시간
                            </span>
                          ) : null}
                        </div>
                        <div className="grid gap-2 text-xs">
                          {selectedEntry.status === 'substitute' ? (
                            <Fragment>
                              <span className="font-semibold text-slate-700">대타 정보</span>
                              {selectedEntry.substituteType === 'internal' ? (
                                <span className="text-slate-600">
                                  학원 선생님: {teacherDirectory[selectedEntry.substituteTeacherId ?? '']?.name ?? teacherDirectory[selectedEntry.substituteTeacherId ?? '']?.email ?? '선택됨'}
                                </span>
                              ) : (
                                <div className="space-y-1 text-slate-600">
                                  <span>성함: {selectedEntry.externalTeacherName ?? '-'}</span>
                                  <span>연락처: {selectedEntry.externalTeacherPhone ?? '-'}</span>
                                  <span>은행/계좌: {selectedEntry.externalTeacherBank ?? '-'} / {selectedEntry.externalTeacherAccount ?? '-'}</span>
                                </div>
                              )}
                            </Fragment>
                          ) : null}
                          <div>
                            <span className="font-semibold text-slate-700">근무 메모</span>
                            <p className="mt-1 rounded-md border border-slate-200 bg-white p-3 min-h-[48px]">
                              {selectedEntry.notes?.length ? selectedEntry.notes : '메모가 없습니다.'}
                            </p>
                          </div>
                          {selectedEntry.reviewNote ? (
                            <div>
                              <span className="font-semibold text-slate-700">원장 메모</span>
                              <p className="mt-1 rounded-md border border-slate-200 bg-white p-3 min-h-[48px]">
                                {selectedEntry.reviewNote}
                              </p>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="border-slate-200">
                  <CardHeader>
                    <CardTitle className="text-base text-slate-900">주차별 근무 시간</CardTitle>
                    <CardDescription>근무/지각 기록만 합산됩니다.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    {weeklySummaries.length === 0 ? (
                      <p className="text-slate-500">이번 달 근무 시간이 없습니다.</p>
                    ) : (
                      weeklySummaries.map((week) => (
                        <div key={week.key} className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2">
                          <span className="text-slate-600">{`${week.start.getMonth() + 1}/${week.start.getDate()} ~ ${week.end.getMonth() + 1}/${week.end.getDate()}`}</span>
                          <span className="font-semibold text-slate-900">{formatHours(week.totalHours)}시간</span>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>

                <Card className="border-slate-200">
                  <CardHeader>
                    <CardTitle className="text-base text-slate-900">월간 근무 시간</CardTitle>
                    <CardDescription>근무/지각 기록의 총합입니다.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
                      <p className="text-sm text-slate-500">총 근무 시간</p>
                      <p className="text-2xl font-semibold text-slate-900">{formatHours(monthlyTotal)}시간</p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>

            <Card className="border-slate-200">
              <CardHeader>
                <CardTitle className="text-base text-slate-900">근무 요약 표</CardTitle>
                <CardDescription>날짜별 승인 상태와 근무 시간을 간단히 확인하세요.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead className="w-32">근무일</TableHead>
                      <TableHead className="w-28">유형</TableHead>
                      <TableHead className="w-24">근무 시간</TableHead>
                      <TableHead className="w-32">승인 상태</TableHead>
                      <TableHead>메모</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {teacherEntries.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="py-6 text-center text-sm text-slate-500">
                          기록이 없습니다.
                        </TableCell>
                      </TableRow>
                    ) : (
                      teacherEntries.map((entry) => {
                        const statusMeta = getStatusMeta(entry.status)
                        return (
                          <TableRow key={entry.id} className={cn(selectedDate === entry.workDate && 'bg-slate-50')}>
                            <TableCell>{entry.workDate}</TableCell>
                            <TableCell>{statusMeta?.label ?? entry.status}</TableCell>
                            <TableCell>
                              {requiresWorkHours(entry.status) && entry.workHours
                                ? `${formatHours(entry.workHours)}시간`
                                : '-'}
                            </TableCell>
                            <TableCell>{WORK_LOG_REVIEW_STATUS_LABEL[entry.reviewStatus]}</TableCell>
                            <TableCell className="max-w-[260px] truncate text-slate-500">{entry.notes ?? '-'}</TableCell>
                          </TableRow>
                        )
                      })
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
