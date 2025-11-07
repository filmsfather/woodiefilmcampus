'use client'

import { useMemo, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type {
  TimetableAssignment,
  TimetablePeriod,
  TimetableSummary,
  TimetableTeacherColumn,
} from '@/types/timetable'

interface StudentTimetableViewerProps {
  timetables: TimetableSummary[]
}

function sortColumns(columns: TimetableTeacherColumn[]) {
  return [...columns].sort((a, b) => a.position - b.position)
}

function sortPeriods(periods: TimetablePeriod[]) {
  return [...periods].sort((a, b) => a.position - b.position)
}

export function StudentTimetableViewer({ timetables }: StudentTimetableViewerProps) {
  const [selectedTimetableId, setSelectedTimetableId] = useState<string | null>(timetables[0]?.id ?? null)

  const selectedTimetable = useMemo(() => {
    if (timetables.length === 0) {
      return null
    }

    if (!selectedTimetableId) {
      return timetables[0] ?? null
    }

    return timetables.find((item) => item.id === selectedTimetableId) ?? timetables[0] ?? null
  }, [selectedTimetableId, timetables])

  const assignmentsByCell = useMemo(() => {
    const map = new Map<string, TimetableAssignment[]>()

    if (!selectedTimetable) {
      return map
    }

    for (const assignment of selectedTimetable.assignments) {
      const key = `${assignment.teacherColumnId}:${assignment.periodId}`
      const current = map.get(key) ?? []
      current.push(assignment)
      map.set(key, current)
    }

    for (const [, assignments] of map) {
      assignments.sort((a, b) => a.className.localeCompare(b.className, 'ko'))
    }

    return map
  }, [selectedTimetable])

  if (!selectedTimetable) {
    return (
      <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-4 py-12 text-center text-sm text-slate-500">
        아직 확인할 수 있는 시간표가 없습니다.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {timetables.length > 1 ? (
        <div className="flex justify-end">
          <Select value={selectedTimetable?.id ?? ''} onValueChange={(value) => setSelectedTimetableId(value)}>
            <SelectTrigger className="w-full sm:w-60">
              <SelectValue placeholder="시간표를 선택하세요" />
            </SelectTrigger>
            <SelectContent>
              {timetables.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {selectedTimetable ? (
        <div className="overflow-auto">
          <table className="w-full min-w-[640px] table-fixed border-collapse">
            <thead>
              <tr>
                <th className="w-40 border border-slate-200 bg-slate-50 px-4 py-2 text-left text-sm font-medium text-slate-700">
                  교시
                </th>
                {sortColumns(selectedTimetable.teacherColumns).map((column) => (
                  <th
                    key={column.id}
                    className="min-w-[160px] border border-slate-200 bg-slate-50 px-4 py-2 text-left text-sm font-medium text-slate-700"
                  >
                    {column.teacherName ?? '담당 교사 미정'}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortPeriods(selectedTimetable.periods).map((period) => (
                <tr key={period.id}>
                  <td className="border border-slate-200 px-4 py-3 align-top">
                    <div className="whitespace-pre-line text-sm font-medium text-slate-800">{period.name}</div>
                  </td>
                  {sortColumns(selectedTimetable.teacherColumns).map((column) => {
                    const key = `${column.id}:${period.id}`
                    const assignments = assignmentsByCell.get(key) ?? []

                    return (
                      <td key={column.id} className="border border-slate-200 px-3 py-3 align-top">
                        {assignments.length === 0 ? (
                          <div className="rounded-md border border-dashed border-slate-200 px-3 py-6 text-center text-xs text-slate-400">
                            배정 없음
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {assignments.map((assignment) => (
                              <Badge key={assignment.id} variant="secondary" className="text-xs">
                                {assignment.className}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-slate-200 px-4 py-12 text-center text-sm text-slate-500">
          아직 확인할 수 있는 시간표가 없습니다.
        </div>
      )}
    </div>
  )
}
