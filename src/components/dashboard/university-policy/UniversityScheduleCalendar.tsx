'use client'

import { useMemo, useState, type ChangeEvent } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  SCHEDULE_CATEGORY_META,
  expandISORange,
  parseISODate,
  type ScheduleCategory,
  type ScheduleEvent,
} from '@/lib/university-policy/schedule-events'
import { cn } from '@/lib/utils'

type CalendarDay = {
  iso: string
  date: Date
  isCurrentMonth: boolean
  isToday: boolean
}

const SEOUL_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const MONTH_TITLE_FORMATTER = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: 'long',
})

const FULL_DATE_FORMATTER = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  weekday: 'short',
})

const ALL_CATEGORIES: ScheduleCategory[] = [
  'application',
  'exam',
  'announcement',
  'enrollment',
  'other',
]

interface UniversityOption {
  id: string
  name: string
  shortName?: string
}

interface UniversityScheduleCalendarProps {
  events: ScheduleEvent[]
  universities: UniversityOption[]
  defaultMonthISO?: string
  detailBasePath?: string
}

function getMonthMatrix(base: Date): CalendarDay[] {
  const year = base.getFullYear()
  const month = base.getMonth()
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)

  const startWeekDay = firstDay.getDay()
  const totalDays = lastDay.getDate()

  const days: CalendarDay[] = []
  for (let offset = startWeekDay; offset > 0; offset -= 1) {
    const date = new Date(year, month, 1 - offset)
    days.push(buildDay(date, false))
  }
  for (let day = 1; day <= totalDays; day += 1) {
    const date = new Date(year, month, day)
    days.push(buildDay(date, true))
  }
  while (days.length % 7 !== 0) {
    const last = days[days.length - 1].date
    const next = new Date(last)
    next.setDate(last.getDate() + 1)
    days.push(buildDay(next, false))
  }
  return days
}

function buildDay(date: Date, isCurrentMonth: boolean): CalendarDay {
  const today = new Date()
  const isToday =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  return {
    iso: SEOUL_FORMATTER.format(date),
    date,
    isCurrentMonth,
    isToday,
  }
}

function parseDefaultMonth(input?: string): Date {
  if (input) {
    const [y, m] = input.split('-').map((part) => Number.parseInt(part, 10))
    if (Number.isFinite(y) && Number.isFinite(m)) {
      return new Date(y, m - 1, 1)
    }
  }
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), 1)
}

function getEventDayCount(event: ScheduleEvent): number {
  const start = parseISODate(event.startISO)
  const end = parseISODate(event.endISO)
  if (!start || !end) return 1
  const ms = end.getTime() - start.getTime()
  return Math.max(1, Math.round(ms / (1000 * 60 * 60 * 24)) + 1)
}

export default function UniversityScheduleCalendar({
  events,
  universities,
  defaultMonthISO,
  detailBasePath = '/dashboard/principal/universities',
}: UniversityScheduleCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(() =>
    parseDefaultMonth(defaultMonthISO)
  )
  const [selectedUniversity, setSelectedUniversity] = useState<string>('all')
  const [selectedCategories, setSelectedCategories] =
    useState<ScheduleCategory[]>(ALL_CATEGORIES)
  const [selectedDayISO, setSelectedDayISO] = useState<string | null>(null)

  const filteredEvents = useMemo(
    () =>
      events.filter((event) => {
        if (selectedUniversity !== 'all' && event.universityId !== selectedUniversity) {
          return false
        }
        if (!selectedCategories.includes(event.category)) {
          return false
        }
        return true
      }),
    [events, selectedUniversity, selectedCategories]
  )

  const eventsByDay = useMemo(() => {
    const map = new Map<string, ScheduleEvent[]>()
    for (const event of filteredEvents) {
      for (const iso of expandISORange(event.startISO, event.endISO)) {
        if (!map.has(iso)) map.set(iso, [])
        map.get(iso)!.push(event)
      }
    }
    for (const list of map.values()) {
      list.sort((a, b) => {
        if (a.category !== b.category) {
          return ALL_CATEGORIES.indexOf(a.category) - ALL_CATEGORIES.indexOf(b.category)
        }
        return a.universityName.localeCompare(b.universityName, 'ko')
      })
    }
    return map
  }, [filteredEvents])

  const days = useMemo(() => getMonthMatrix(currentMonth), [currentMonth])

  const monthEventCount = useMemo(() => {
    const monthKey = `${currentMonth.getFullYear()}-${String(
      currentMonth.getMonth() + 1
    ).padStart(2, '0')}`
    let total = 0
    for (const [iso, list] of eventsByDay.entries()) {
      if (iso.startsWith(monthKey)) total += list.length
    }
    return total
  }, [currentMonth, eventsByDay])

  const upcoming = useMemo(() => {
    const todayISO = SEOUL_FORMATTER.format(new Date())
    return filteredEvents
      .filter((event) => event.endISO >= todayISO)
      .slice(0, 8)
  }, [filteredEvents])

  const handleUniversityChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setSelectedUniversity(event.target.value)
    setSelectedDayISO(null)
  }

  const toggleCategory = (category: ScheduleCategory) => {
    setSelectedCategories((prev) => {
      const next = prev.includes(category)
        ? prev.filter((c) => c !== category)
        : [...prev, category]
      return next.length === 0 ? prev : next
    })
  }

  const goPrevMonth = () => {
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
    setSelectedDayISO(null)
  }
  const goNextMonth = () => {
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
    setSelectedDayISO(null)
  }
  const goToday = () => {
    const now = new Date()
    setCurrentMonth(new Date(now.getFullYear(), now.getMonth(), 1))
    setSelectedDayISO(SEOUL_FORMATTER.format(now))
  }

  const selectedDayEvents = selectedDayISO
    ? eventsByDay.get(selectedDayISO) ?? []
    : []

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardContent className="space-y-4 p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 sm:text-xl">
              {MONTH_TITLE_FORMATTER.format(currentMonth)}
            </h2>
            <p className="text-xs text-slate-500 sm:text-sm">
              이 달 등록된 일정 {monthEventCount}건 · 전체 등록 {events.length}건
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={goPrevMonth} aria-label="이전 달">
              <ChevronLeft className="size-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={goToday}>
              오늘
            </Button>
            <Button variant="outline" size="sm" onClick={goNextMonth} aria-label="다음 달">
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-1.5">
            {ALL_CATEGORIES.map((category) => {
              const meta = SCHEDULE_CATEGORY_META[category]
              const active = selectedCategories.includes(category)
              return (
                <button
                  key={category}
                  type="button"
                  onClick={() => toggleCategory(category)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition',
                    active
                      ? meta.chip
                      : 'border-slate-200 bg-white text-slate-400 hover:bg-slate-50'
                  )}
                >
                  <span className={cn('size-1.5 rounded-full', meta.dot)} />
                  {meta.label}
                </button>
              )
            })}
          </div>

          <div className="flex items-center gap-2">
            <label
              htmlFor="university-schedule-filter"
              className="text-xs font-medium text-slate-600"
            >
              대학
            </label>
            <select
              id="university-schedule-filter"
              value={selectedUniversity}
              onChange={handleUniversityChange}
              className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-xs outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
            >
              <option value="all">전체 대학</option>
              {universities.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.shortName ?? u.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 text-sm">
          {['일', '월', '화', '수', '목', '금', '토'].map((label, idx) => (
            <div
              key={label}
              className={cn(
                'bg-slate-50 py-2 text-center text-[11px] font-semibold tracking-wide',
                idx === 0 ? 'text-rose-600' : idx === 6 ? 'text-sky-600' : 'text-slate-600'
              )}
            >
              {label}
            </div>
          ))}
          {days.map((day) => {
            const dayEvents = eventsByDay.get(day.iso) ?? []
            const isSelected = day.iso === selectedDayISO
            const dayOfWeek = day.date.getDay()
            return (
              <button
                key={day.iso}
                type="button"
                onClick={() =>
                  setSelectedDayISO((prev) => (prev === day.iso ? null : day.iso))
                }
                className={cn(
                  'flex min-h-[120px] flex-col gap-1 bg-white p-1.5 text-left text-xs transition hover:bg-slate-50 sm:min-h-[132px] sm:p-2',
                  !day.isCurrentMonth && 'bg-slate-50 text-slate-400',
                  day.isToday && 'ring-2 ring-inset ring-slate-900',
                  isSelected && 'bg-slate-100 ring-2 ring-inset ring-slate-700'
                )}
              >
                <span
                  className={cn(
                    'inline-flex size-6 items-center justify-center text-[11px] font-medium',
                    day.isCurrentMonth
                      ? dayOfWeek === 0
                        ? 'text-rose-600'
                        : dayOfWeek === 6
                          ? 'text-sky-600'
                          : 'text-slate-700'
                      : 'text-slate-400',
                    day.isToday && 'rounded-full bg-slate-900 text-white'
                  )}
                >
                  {day.date.getDate()}
                </span>

                <div className="flex flex-col gap-0.5">
                  {dayEvents.slice(0, 3).map((event) => {
                    const meta = SCHEDULE_CATEGORY_META[event.category]
                    return (
                      <span
                        key={`${event.id}::${day.iso}`}
                        className={cn(
                          'truncate rounded border px-1.5 py-0.5 text-[10px] font-medium',
                          meta.chip
                        )}
                        title={`${event.universityShortName} · ${event.label} (${event.rawValue})`}
                      >
                        {event.universityShortName} · {event.label}
                      </span>
                    )
                  })}
                  {dayEvents.length > 3 ? (
                    <span className="text-[10px] font-medium text-slate-500">
                      +{dayEvents.length - 3}건 더보기
                    </span>
                  ) : null}
                </div>
              </button>
            )
          })}
        </div>

        {selectedDayISO ? (
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">
                {(() => {
                  const d = parseISODate(selectedDayISO)
                  return d ? FULL_DATE_FORMATTER.format(d) : selectedDayISO
                })()}{' '}
                일정
                <span className="ml-2 text-xs font-normal text-slate-500">
                  {selectedDayEvents.length}건
                </span>
              </h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedDayISO(null)}
                className="text-xs text-slate-500"
              >
                닫기
              </Button>
            </div>
            {selectedDayEvents.length === 0 ? (
              <p className="text-xs text-slate-500">선택한 날짜에 등록된 일정이 없습니다.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {selectedDayEvents.map((event) => {
                  const meta = SCHEDULE_CATEGORY_META[event.category]
                  return (
                    <li key={`${event.id}::${selectedDayISO}::detail`}>
                      <Link
                        href={`${detailBasePath}/${event.universityId}/programs/${event.programKey}`}
                        className="flex flex-col gap-1 py-2 transition hover:bg-slate-50"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={cn(
                              'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold',
                              meta.chip
                            )}
                          >
                            <span className={cn('size-1.5 rounded-full', meta.dot)} />
                            {meta.label}
                          </span>
                          <span className="text-sm font-semibold text-slate-900">
                            {event.universityName}
                          </span>
                          <span className="text-xs text-slate-500">
                            {event.year}학년도 · {event.admissionTrack}
                          </span>
                        </div>
                        <p className="text-xs font-medium text-slate-700">{event.label}</p>
                        <p className="text-[11px] text-slate-500">{event.rawValue}</p>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        ) : null}

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-900">다가오는 일정</h3>
          {upcoming.length === 0 ? (
            <p className="text-xs text-slate-500">
              현재 필터 조건에 맞는 향후 일정이 없습니다.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {upcoming.map((event) => {
                const meta = SCHEDULE_CATEGORY_META[event.category]
                const days = getEventDayCount(event)
                return (
                  <li key={`upcoming::${event.id}`}>
                    <Link
                      href={`${detailBasePath}/${event.universityId}/programs/${event.programKey}`}
                      className="flex flex-col gap-1 py-2 transition hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold',
                            meta.chip
                          )}
                        >
                          <span className={cn('size-1.5 rounded-full', meta.dot)} />
                          {meta.label}
                        </span>
                        <span className="text-sm font-semibold text-slate-900">
                          {event.universityName}
                        </span>
                        <span className="text-xs text-slate-700">{event.label}</span>
                      </div>
                      <span className="text-[11px] text-slate-500">
                        {event.startISO === event.endISO
                          ? event.startISO.replace(/-/g, '. ')
                          : `${event.startISO.replace(/-/g, '. ')} ~ ${event.endISO.replace(/-/g, '. ')} (${days}일)`}
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
