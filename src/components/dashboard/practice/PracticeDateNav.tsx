'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ko } from 'date-fns/locale'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { shiftIsoDate } from '@/lib/counseling'
import { formatSlotDateLabel } from '@/lib/practice/shared'

function toIsoDate(date: Date): string {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function PracticeDateNav({
  basePath,
  date,
  today,
}: {
  basePath: string
  date: string
  today: string
}) {
  const router = useRouter()
  const [isCalendarOpen, setIsCalendarOpen] = useState(false)

  const handleDateSelect = (selected: Date | undefined) => {
    if (!selected) {
      return
    }
    setIsCalendarOpen(false)
    router.push(`${basePath}?date=${toIsoDate(selected)}`)
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button asChild variant="outline" size="icon" aria-label="이전 날">
        <Link href={`${basePath}?date=${shiftIsoDate(date, -1)}`}>
          <ChevronLeft className="h-4 w-4" />
        </Link>
      </Button>
      <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex min-w-[140px] items-center justify-center gap-1.5 rounded-md px-2 py-1 text-base font-semibold text-slate-900 transition hover:bg-slate-100"
            aria-label="달력에서 날짜 선택"
          >
            <CalendarDays className="h-4 w-4 text-slate-500" />
            {formatSlotDateLabel(date)}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="center">
          <Calendar
            mode="single"
            selected={new Date(`${date}T00:00:00`)}
            defaultMonth={new Date(`${date}T00:00:00`)}
            onSelect={handleDateSelect}
            locale={ko}
          />
        </PopoverContent>
      </Popover>
      <Button asChild variant="outline" size="icon" aria-label="다음 날">
        <Link href={`${basePath}?date=${shiftIsoDate(date, 1)}`}>
          <ChevronRight className="h-4 w-4" />
        </Link>
      </Button>
      {date !== today ? (
        <Button asChild variant="ghost" size="sm">
          <Link href={`${basePath}?date=${today}`}>오늘</Link>
        </Button>
      ) : null}
    </div>
  )
}
