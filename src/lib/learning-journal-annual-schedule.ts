import DateUtil from '@/lib/date-util'

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
