import Link from 'next/link'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'

import { cn } from '@/lib/utils'

interface WeekNavigatorProps {
  label: string
  previousHref: string
  nextHref: string
  className?: string
}

export function WeekNavigator({ label, previousHref, nextHref, className }: WeekNavigatorProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-center gap-3 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm',
        className
      )}
    >
      <Link
        href={previousHref}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
        aria-label="이전 주"
      >
        <ChevronLeft className="h-4 w-4" />
      </Link>
      <div className="flex items-center gap-2 font-medium text-slate-900">
        <CalendarDays className="h-4 w-4 text-slate-500" />
        <span>{label}</span>
      </div>
      <Link
        href={nextHref}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
        aria-label="다음 주"
      >
        <ChevronRight className="h-4 w-4" />
      </Link>
    </div>
  )
}
