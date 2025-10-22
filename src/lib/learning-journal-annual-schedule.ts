import DateUtil from '@/lib/date-util'
import type { LearningJournalAnnualScheduleCategory } from '@/types/learning-journal'

export const LEARNING_JOURNAL_ANNUAL_SCHEDULE_CATEGORY_LABELS: Record<
  LearningJournalAnnualScheduleCategory,
  string
> = {
  annual: '정규 일정',
  film_production: '특강 일정',
}

export const LEARNING_JOURNAL_ANNUAL_SCHEDULE_CATEGORY_ORDER: LearningJournalAnnualScheduleCategory[] = [
  'annual',
  'film_production',
]

export const LEARNING_JOURNAL_ANNUAL_SCHEDULE_CATEGORY_OPTIONS =
  LEARNING_JOURNAL_ANNUAL_SCHEDULE_CATEGORY_ORDER.map((value) => ({
    value,
    label: LEARNING_JOURNAL_ANNUAL_SCHEDULE_CATEGORY_LABELS[value],
  }))

export function getAnnualScheduleCategoryLabel(category: LearningJournalAnnualScheduleCategory) {
  return LEARNING_JOURNAL_ANNUAL_SCHEDULE_CATEGORY_LABELS[category] ?? category
}

export function formatAnnualScheduleDateRange(start: string, end: string) {
  const startLabel = DateUtil.formatForDisplay(start, {
    locale: 'ko-KR',
    timeZone: 'Asia/Seoul',
    month: 'numeric',
    day: 'numeric',
  })
  const endLabel = DateUtil.formatForDisplay(end, {
    locale: 'ko-KR',
    timeZone: 'Asia/Seoul',
    month: 'numeric',
    day: 'numeric',
  })

  return `${startLabel} ~ ${endLabel}`
}

export function formatAnnualScheduleTuitionLabel(dueDate: string | null, amount: number | null) {
  if (!dueDate && (amount === null || Number.isNaN(amount))) {
    return '-'
  }

  const dueDateLabel = dueDate
    ? `납부일 ${DateUtil.formatForDisplay(dueDate, {
        locale: 'ko-KR',
        timeZone: 'Asia/Seoul',
        month: 'numeric',
        day: 'numeric',
      })}`
    : null

  const amountLabel = typeof amount === 'number' && Number.isFinite(amount)
    ? `${amount.toLocaleString('ko-KR')}원`
    : null

  if (dueDateLabel && amountLabel) {
    return `${dueDateLabel} / ${amountLabel}`
  }

  return dueDateLabel ?? amountLabel ?? '-'
}
