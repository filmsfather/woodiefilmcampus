'use client'

import { useState } from 'react'
import { ChevronDownIcon } from 'lucide-react'

import { cn } from '@/lib/utils'
import type { LearningJournalAnnualSchedule } from '@/types/learning-journal'
import { AnnualScheduleTable } from '@/components/dashboard/learning-journal/AnnualScheduleTable'

interface AnnualScheduleCategorySectionProps {
  category: string
  label: string
  schedules: LearningJournalAnnualSchedule[]
  emptyMessage: string
  showTuition?: boolean
  defaultOpen?: boolean
}

export function AnnualScheduleCategorySection({
  category,
  label,
  schedules,
  emptyMessage,
  showTuition = false,
  defaultOpen = false,
}: AnnualScheduleCategorySectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  const contentId = `${category}-annual-schedule-section`

  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 rounded-t-lg px-4 py-3 text-left text-sm font-medium text-slate-900 transition-colors hover:bg-slate-50"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-controls={contentId}
      >
        <span>{label} 보기</span>
        <ChevronDownIcon className={cn('size-4 transition-transform', isOpen ? 'rotate-180' : '')} />
      </button>
      {isOpen ? (
        <div id={contentId} className="border-t border-slate-100 px-4 py-4">
          <AnnualScheduleTable
            schedules={schedules}
            showTuition={showTuition}
            emptyMessage={emptyMessage}
            className="mt-0"
          />
        </div>
      ) : null}
    </div>
  )
}
