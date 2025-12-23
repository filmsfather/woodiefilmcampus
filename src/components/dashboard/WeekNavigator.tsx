'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'

import { cn } from '@/lib/utils'

interface WeekNavigatorProps {
  label: string
  previousHref: string
  nextHref: string
  className?: string
}

export function WeekNavigator({ label, previousHref, nextHref, className }: WeekNavigatorProps) {
  const router = useRouter()
  const [loadingDirection, setLoadingDirection] = useState<'prev' | 'next' | null>(null)

  const handleNavigation = (href: string, direction: 'prev' | 'next') => {
    setLoadingDirection(direction)
    router.push(href)
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
      <div className="flex items-center gap-2 font-medium text-slate-900">
        <CalendarDays className="h-4 w-4 text-slate-500" />
        <span>{label}</span>
      </div>
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
