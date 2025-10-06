import DateUtil from '@/lib/date-util'

export interface WeekRange {
  start: Date
  end: Date
  endExclusive: Date
  previousStart: Date
  nextStart: Date
  label: string
  param: string
}

function formatWeekLabel(start: Date, end: Date): string {
  const startMonth = DateUtil.formatForDisplay(start, { month: 'long' })
  const endMonth = DateUtil.formatForDisplay(end, { month: 'long' })
  const startDayLabel = DateUtil.formatForDisplay(start, { day: 'numeric' })
  const endDayLabel = DateUtil.formatForDisplay(end, { day: 'numeric' })
  if (start.getUTCMonth() === end.getUTCMonth() && start.getUTCFullYear() === end.getUTCFullYear()) {
    const trimmedStartDay = startDayLabel.replace('일', '')
    return `${startMonth} ${trimmedStartDay} ~ ${endDayLabel} 주간`
  }
  return `${startMonth} ${startDayLabel} ~ ${endMonth} ${endDayLabel} 주간`
}

export function resolveWeekRange(weekParam?: string | string[] | null): WeekRange {
  const requested = typeof weekParam === 'string' ? DateUtil.toUTCDate(weekParam) : null
  const base = requested && !Number.isNaN(requested.getTime()) ? requested : DateUtil.nowUTC()
  const start = DateUtil.startOfWeek(base)
  const end = DateUtil.endOfWeek(start)
  const nextStart = DateUtil.addDays(start, 7)
  const previousStart = DateUtil.addDays(start, -7)
  const endExclusive = DateUtil.addDays(start, 7)
  return {
    start,
    end,
    endExclusive,
    previousStart,
    nextStart,
    label: formatWeekLabel(start, end),
    param: DateUtil.formatISODate(start),
  }
}

export function buildWeekHref(
  path: string,
  params: Record<string, string | string[] | undefined>,
  weekStart: Date
): string {
  const query = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (typeof value === 'string') {
      query.append(key, value)
    } else if (Array.isArray(value)) {
      value.forEach((item) => {
        if (typeof item === 'string') {
          query.append(key, item)
        }
      })
    }
  })
  query.delete('week')
  query.set('week', DateUtil.formatISODate(weekStart))
  const queryString = query.toString()
  return queryString ? `${path}?${queryString}` : path
}
