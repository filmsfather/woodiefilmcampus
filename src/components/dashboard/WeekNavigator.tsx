'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useState, useEffect } from 'react'
import { ko } from 'date-fns/locale'
import { CalendarDays, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'

import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import DateUtil from '@/lib/date-util'
import { cn } from '@/lib/utils'

interface WeekNavigatorProps {
  label: string
  previousHref: string
  nextHref: string
  currentWeekStart?: Date
  className?: string
}

export function WeekNavigator({ label, previousHref, nextHref, currentWeekStart, className }: WeekNavigatorProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [loadingDirection, setLoadingDirection] = useState<'prev' | 'next' | 'direct' | null>(null)
  const [isCalendarOpen, setIsCalendarOpen] = useState(false)

  // 라우트가 변경되면 로딩 상태 초기화
  useEffect(() => {
    setLoadingDirection(null)
    setIsCalendarOpen(false)
  }, [pathname, searchParams])

  const handleNavigation = (href: string, direction: 'prev' | 'next' | 'direct') => {
    setLoadingDirection(direction)
    router.push(href)
  }

  const handleDateSelect = (date: Date | undefined) => {
    if (!date) return

    // 선택한 날짜가 속한 주의 시작일 계산
    const weekStart = DateUtil.startOfWeek(date)
    const weekParam = DateUtil.formatISODate(weekStart)

    // 현재 URL 파라미터 유지하면서 week만 변경
    const params = new URLSearchParams(searchParams.toString())
    params.set('week', weekParam)

    const href = `${pathname}?${params.toString()}`
    handleNavigation(href, 'direct')
    setIsCalendarOpen(false)
  }

  return (
    <div
      className={cn(
        'flex items-center justify-center gap-3 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm',
        className
      )}
    >
      <button
        onClick={() => handleNavigation(previousHref, 'prev')}
        disabled={loadingDirection !== null}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:border-slate-300 hover:text-slate-700 disabled:opacity-50"
        aria-label="이전 주"
      >
        {loadingDirection === 'prev' ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <ChevronLeft className="h-4 w-4" />
        )}
      </button>

      <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
        <PopoverTrigger asChild>
          <button
            disabled={loadingDirection !== null}
            className="flex items-center gap-2 font-medium text-slate-900 hover:text-slate-700 disabled:opacity-50"
          >
            {loadingDirection === 'direct' ? (
              <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
            ) : (
              <CalendarDays className="h-4 w-4 text-slate-500" />
            )}
            <span>{label}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="center">
          <Calendar
            mode="single"
            selected={currentWeekStart}
            onSelect={handleDateSelect}
            locale={ko}
          />
        </PopoverContent>
      </Popover>

      <button
        onClick={() => handleNavigation(nextHref, 'next')}
        disabled={loadingDirection !== null}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:border-slate-300 hover:text-slate-700 disabled:opacity-50"
        aria-label="다음 주"
      >
        {loadingDirection === 'next' ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
      </button>
    </div>
  )
}
