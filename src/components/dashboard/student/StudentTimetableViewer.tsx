'use client'

import { useMemo, useState } from 'react'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { TimetablePeriod, TimetableSummary, TimetableTeacherColumn } from '@/types/timetable'

interface StudentTimetableViewerProps {
  timetables: TimetableSummary[]
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

  const teacherColumnMap = useMemo(() => {
    if (!selectedTimetable) {
      return new Map<string, TimetableTeacherColumn>()
    }

    return new Map(selectedTimetable.teacherColumns.map((column) => [column.id, column]))
  }, [selectedTimetable])

  const periodAssignments = useMemo(() => {
    if (!selectedTimetable) {
      return [] as Array<{ periodId: string; periodName: string; assignments: Array<{ id: string; teacherLabel: string }> }>
    }

    const assignmentsByPeriod = new Map<string, Array<{ id: string; teacherLabel: string }>>()

    for (const assignment of selectedTimetable.assignments) {
      const column = assignment.teacherColumnId ? teacherColumnMap.get(assignment.teacherColumnId) ?? null : null
      const teacherLabel = column?.teacherName ?? column?.teacherEmail ?? '담당 교사 미정'
      const current = assignmentsByPeriod.get(assignment.periodId) ?? []
      current.push({ id: assignment.id, teacherLabel })
      assignmentsByPeriod.set(assignment.periodId, current)
    }

    return sortPeriods(selectedTimetable.periods)
      .map((period) => {
        const assignments = assignmentsByPeriod.get(period.id) ?? []
        const sortedAssignments = [...assignments].sort((a, b) => a.teacherLabel.localeCompare(b.teacherLabel, 'ko'))

        if (sortedAssignments.length === 0) {
          return null
        }

        return {
          periodId: period.id,
          periodName: period.name,
          assignments: sortedAssignments,
        }
      })
      .filter((value): value is { periodId: string; periodName: string; assignments: Array<{ id: string; teacherLabel: string }> } => value !== null)
  }, [selectedTimetable, teacherColumnMap])

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

      <div className="rounded-lg border border-slate-200">
        <div className="border-b border-slate-200 px-4 py-3 text-sm font-medium text-slate-700">
          {selectedTimetable.name}
        </div>
        {periodAssignments.length > 0 ? (
          <div className="divide-y divide-slate-200">
            {periodAssignments.map((period) => (
              <div key={period.periodId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="text-sm font-semibold text-slate-900">{period.periodName}</div>
                <div className="flex flex-col text-right text-sm text-slate-700">
                  {period.assignments.map((assignment) => (
                    <span key={assignment.id}>{assignment.teacherLabel}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-4 py-8 text-center text-sm text-slate-500">아직 배정된 수업이 없습니다.</div>
        )}
      </div>
    </div>
  )
}
