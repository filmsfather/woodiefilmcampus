'use client'

import { useMemo, useState, type ChangeEvent } from 'react'
import Link from 'next/link'

import { ADMISSION_MATERIAL_CATEGORIES, type AdmissionMaterialCategory } from '@/lib/admission-materials'
import { PAST_EXAM_UNIVERSITIES } from '@/lib/admission-materials-constants'
import type { AdmissionCalendarEvent } from '@/app/dashboard/teacher/admission-materials/actions'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

interface AdmissionScheduleCalendarProps {
  initialEvents: AdmissionCalendarEvent[]
}

type CalendarDay = {
  iso: string
  date: Date
  isCurrentMonth: boolean
  isToday: boolean
}

const seoulFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

// Expand an event into Asia/Seoul date keys covering every day in the range.
function expandEventDates(event: AdmissionCalendarEvent): string[] {
  const startDate = new Date(event.startAt)
  if (Number.isNaN(startDate.getTime())) {
    return []
  }

  const parsedEnd = event.endAt ? new Date(event.endAt) : null
  let endDate = parsedEnd && !Number.isNaN(parsedEnd.getTime()) ? parsedEnd : startDate

  if (endDate.getTime() < startDate.getTime()) {
    endDate = startDate
  }

  const dates: string[] = []
  const cursor = new Date(startDate)

  while (cursor.getTime() <= endDate.getTime()) {
    dates.push(seoulFormatter.format(cursor))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }

  return dates
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
    days.push(createDay(date, false))
  }

  for (let day = 1; day <= totalDays; day += 1) {
    const date = new Date(year, month, day)
    days.push(createDay(date, true))
  }

  const remaining = 7 - (days.length % 7 || 7)
  for (let i = 1; i <= remaining; i += 1) {
    const date = new Date(year, month + 1, i)
    days.push(createDay(date, false))
  }

  return days
}

function createDay(date: Date, isCurrentMonth: boolean): CalendarDay {
  const today = new Date()
  const isToday =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()

  return {
    iso: seoulFormatter.format(date),
    date,
    isCurrentMonth,
    isToday,
  }
}

function formatMonthTitle(date: Date) {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'long',
  }).format(date)
}

const ALL_CATEGORY_ORDER: AdmissionMaterialCategory[] = ['guideline', 'past_exam', 'success_review']
const TOGGLEABLE_CATEGORIES: AdmissionMaterialCategory[] = ['guideline']
const UNIVERSITY_FILTER_OPTIONS = ['all', ...PAST_EXAM_UNIVERSITIES] as const

type UniversityFilterOption = (typeof UNIVERSITY_FILTER_OPTIONS)[number]

function getUniversityOptionLabel(option: UniversityFilterOption) {
  if (option === 'all') {
    return '전체'
  }
  return option
}

function matchesUniversity(event: AdmissionCalendarEvent, selected: UniversityFilterOption) {
  if (selected === 'all') {
    return true
  }

  if (event.postUniversity && event.postUniversity === selected) {
    return true
  }

  if (event.postTargetLevel && event.postTargetLevel.includes(selected)) {
    return true
  }

  return false
}

export function AdmissionScheduleCalendar({ initialEvents }: AdmissionScheduleCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [selectedCategories, setSelectedCategories] = useState<AdmissionMaterialCategory[]>(ALL_CATEGORY_ORDER)
  const [selectedUniversity, setSelectedUniversity] = useState<UniversityFilterOption>('all')

  const eventsByDay = useMemo(() => {
    const cache = new Map<string, AdmissionCalendarEvent[]>()

    for (const event of initialEvents) {
      if (!selectedCategories.includes(event.category)) {
        continue
      }

      if (!matchesUniversity(event, selectedUniversity)) {
        continue
      }

      const dateKeys = expandEventDates(event)

      for (const iso of dateKeys) {
        if (!cache.has(iso)) {
          cache.set(iso, [])
        }
        cache.get(iso)!.push(event)
      }
    }

    for (const list of cache.values()) {
      list.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
    }

    return cache
  }, [initialEvents, selectedCategories, selectedUniversity])

  const days = useMemo(() => getMonthMatrix(currentMonth), [currentMonth])

  const toggleCategory = (category: AdmissionMaterialCategory) => {
    if (!TOGGLEABLE_CATEGORIES.includes(category)) {
      return
    }

    setSelectedCategories((prev) => {
      if (prev.includes(category)) {
        return prev.filter((item) => item !== category)
      }
      return [...prev, category]
    })
  }

  const handleUniversityChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setSelectedUniversity(event.target.value as UniversityFilterOption)
  }

  const goPrevMonth = () => {
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
  }

  const goNextMonth = () => {
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
  }

  return (
    <Card className="border-slate-200">
      <CardContent className="space-y-4 p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">{formatMonthTitle(currentMonth)}</h2>
            <p className="text-sm text-slate-500">카테고리와 대학교를 선택하면 필요한 일정만 볼 수 있습니다.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="icon" onClick={goPrevMonth}>
              {'<'}
            </Button>
            <Button variant="outline" size="icon" onClick={goNextMonth}>
              {'>'}
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {TOGGLEABLE_CATEGORIES.map((category) => {
              const meta = ADMISSION_MATERIAL_CATEGORIES[category]
              const isActive = selectedCategories.includes(category)
              return (
                <Button
                  key={category}
                  type="button"
                  size="sm"
                  variant={isActive ? 'secondary' : 'outline'}
                  onClick={() => toggleCategory(category)}
                  className="text-xs"
                >
                  {meta.label}
                </Button>
              )
            })}
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="admission-calendar-university" className="text-xs font-medium text-slate-600">
              대학교
            </label>
            <select
              id="admission-calendar-university"
              value={selectedUniversity}
              onChange={handleUniversityChange}
              className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-xs outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
            >
              {UNIVERSITY_FILTER_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {getUniversityOptionLabel(option)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-px rounded-md border border-slate-200 bg-slate-200 text-sm">
          {["일", "월", "화", "수", "목", "금", "토"].map((day) => (
            <div key={day} className="bg-slate-100 py-2 text-center text-xs font-medium text-slate-600">
              {day}
            </div>
          ))}
          {days.map((day) => {
            const events = eventsByDay.get(day.iso) ?? []
            const isCurrent = day.isCurrentMonth
            const cellClasses = [
              'min-h-[112px] bg-white p-2 text-xs',
              !isCurrent ? 'bg-slate-50 text-slate-400' : 'text-slate-700',
              day.isToday ? 'border-2 border-slate-400' : 'border border-slate-100',
            ].join(' ')

            return (
              <div key={day.iso} className={cellClasses}>
                <div className="mb-1 flex items-center justify-between text-[11px] font-medium">
                  <span>{day.date.getDate()}</span>
                  {day.isToday ? <span className="text-slate-500">오늘</span> : null}
                </div>
                <div className="space-y-1">
                  {events.slice(0, 2).map((event) => (
                    <Link
                      key={event.id}
                      href={`/dashboard/teacher/admission-materials/${event.category}/${event.postId}`}
                      className="block rounded-md border border-slate-200 bg-slate-50 p-2 hover:border-slate-400"
                    >
                      <p className="line-clamp-1 text-[12px] font-semibold text-slate-800">
                        {event.postTargetLevel && event.postTargetLevel.trim().length > 0
                          ? event.postTargetLevel
                          : event.postTitle}
                      </p>
                      <p className="mt-1 line-clamp-2 text-[11px] text-slate-600">{event.scheduleTitle}</p>
                    </Link>
                  ))}
                  {events.length > 2 ? (
                    <span className="block text-[11px] text-slate-500">외 {events.length - 2}건</span>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
