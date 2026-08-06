import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { shiftIsoDate } from '@/lib/counseling'
import { formatSlotDateLabel } from '@/lib/practice/shared'

export function PracticeDateNav({
  basePath,
  date,
  today,
}: {
  basePath: string
  date: string
  today: string
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button asChild variant="outline" size="icon" aria-label="이전 날">
        <Link href={`${basePath}?date=${shiftIsoDate(date, -1)}`}>
          <ChevronLeft className="h-4 w-4" />
        </Link>
      </Button>
      <span className="min-w-[140px] text-center text-base font-semibold text-slate-900">
        {formatSlotDateLabel(date)}
      </span>
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
