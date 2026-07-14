export const DAY_OF_WEEK_LABELS = ['월', '화', '수', '목', '금', '토', '일'] as const

export interface ClassScheduleEntry {
  id: string
  classId: string
  className: string
  dayOfWeek: number
  period: number
  startTime: string
  endTime: string
  teacherId: string | null
  teacherName: string | null
}

export function formatTimeLabel(value: string) {
  return value.slice(0, 5)
}

export function formatScheduleTimeRange(entry: Pick<ClassScheduleEntry, 'startTime' | 'endTime'>) {
  return `${formatTimeLabel(entry.startTime)}~${formatTimeLabel(entry.endTime)}`
}

export function compareScheduleEntries(a: ClassScheduleEntry, b: ClassScheduleEntry) {
  if (a.dayOfWeek !== b.dayOfWeek) {
    return a.dayOfWeek - b.dayOfWeek
  }
  if (a.period !== b.period) {
    return a.period - b.period
  }
  return a.startTime.localeCompare(b.startTime)
}
