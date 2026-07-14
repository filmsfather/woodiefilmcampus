import {
  compareScheduleEntries,
  DAY_OF_WEEK_LABELS,
  formatScheduleTimeRange,
  type ClassScheduleEntry,
} from '@/types/timetable'

interface StudentTimetableViewerProps {
  entries: ClassScheduleEntry[]
}

export function StudentTimetableViewer({ entries }: StudentTimetableViewerProps) {
  if (entries.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-4 py-12 text-center text-sm text-slate-500">
        아직 확인할 수 있는 시간표가 없습니다.
      </div>
    )
  }

  const sorted = [...entries].sort(compareScheduleEntries)

  const byDay = new Map<number, ClassScheduleEntry[]>()
  for (const entry of sorted) {
    const current = byDay.get(entry.dayOfWeek) ?? []
    current.push(entry)
    byDay.set(entry.dayOfWeek, current)
  }

  return (
    <div className="space-y-3">
      {Array.from(byDay.entries()).map(([dayOfWeek, dayEntries]) => (
        <div key={dayOfWeek} className="rounded-lg border border-slate-200">
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-800">
            {DAY_OF_WEEK_LABELS[dayOfWeek]}요일
          </div>
          <div className="divide-y divide-slate-100">
            {dayEntries.map((entry) => (
              <div key={entry.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">
                <span className="w-14 shrink-0 font-medium text-slate-900">{entry.period}교시</span>
                <span className="w-28 shrink-0 text-slate-600">{formatScheduleTimeRange(entry)}</span>
                <span className="font-medium text-slate-800">{entry.className}</span>
                <span className="ml-auto text-slate-500">{entry.teacherName ?? '담당 교사 미정'}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
