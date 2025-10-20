'use client'

import { useMemo, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { TimetableAssignment, TimetablePeriod, TimetableSummary, TimetableTeacherColumn } from '@/types/timetable'

export interface TimetableForTeacher extends TimetableSummary {
  teacherColumnIds: string[]
}

export interface TeacherClassSummary {
  id: string
  name: string
  description: string | null
  homeroomTeacherName: string | null
  students: Array<{ id: string; name: string | null; email: string | null }>
}

interface TeacherTimetableViewerProps {
  timetables: TimetableForTeacher[]
  classes: TeacherClassSummary[]
}

function sortColumns(columns: TimetableTeacherColumn[]) {
  return [...columns].sort((a, b) => a.position - b.position)
}

function sortPeriods(periods: TimetablePeriod[]) {
  return [...periods].sort((a, b) => a.position - b.position)
}

export function TeacherTimetableViewer({ timetables, classes }: TeacherTimetableViewerProps) {
  const [selectedTimetableId, setSelectedTimetableId] = useState<string | null>(timetables[0]?.id ?? null)

  const selectedTimetable = useMemo(() => {
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

  return (
    <section className="space-y-8">
      <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">시간표</h2>
            <p className="text-sm text-slate-500">등록된 시간표를 선택해 전체 일정을 확인하세요.</p>
          </div>
          {timetables.length > 1 ? (
            <Select
              value={selectedTimetable?.id ?? ''}
              onValueChange={(value) => setSelectedTimetableId(value)}
            >
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
          ) : null}
        </div>

        {selectedTimetable ? (
          <div className="overflow-auto">
            <table className="w-full min-w-[720px] table-fixed border-collapse">
              <thead>
                <tr>
                  <th className="w-40 border border-slate-200 bg-slate-50 px-4 py-2 text-left text-sm font-medium text-slate-700">
                    교시 이름
                  </th>
                  {sortColumns(selectedTimetable.teacherColumns).map((column) => {
                    const isMyColumn = selectedTimetable.teacherColumnIds.includes(column.id)

                    return (
                      <th
                        key={column.id}
                        className={cn(
                          'min-w-[180px] border border-slate-200 bg-slate-50 px-4 py-2 text-left text-sm font-medium text-slate-700',
                          isMyColumn && 'bg-emerald-50 text-emerald-800',
                        )}
                      >
                        <div className="space-y-1">
                          <div>{column.teacherName ?? column.teacherEmail ?? '이름 없음'}</div>
                          {isMyColumn ? (
                            <Badge variant="outline" className="border-emerald-400 text-emerald-700">
                              내 수업
                            </Badge>
                          ) : null}
                        </div>
                      </th>
                    )
                  })}
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
                      const isMyColumn = selectedTimetable.teacherColumnIds.includes(column.id)

                      return (
                        <td
                          key={column.id}
                          className={cn(
                            'border border-slate-200 px-3 py-3 align-top',
                            isMyColumn && 'bg-emerald-50/40',
                          )}
                        >
                          {assignments.length === 0 ? (
                            <div className="rounded-md border border-dashed border-slate-200 px-3 py-6 text-center text-xs text-slate-400">
                              배정 없음
                            </div>
                          ) : (
                            <div className="space-y-2">
                              <div className="flex flex-wrap gap-2">
                                {assignments.map((assignment) => (
                                  <Badge key={assignment.id} variant="secondary">
                                    {assignment.className}
                                  </Badge>
                                ))}
                              </div>
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
          <div className="rounded-md border border-dashed border-slate-200 px-4 py-16 text-center text-sm text-slate-500">
            아직 확인할 수 있는 시간표가 없습니다.
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">소속 반</h2>
          <p className="text-sm text-slate-500">담당하고 있는 반의 기본 정보를 확인하세요.</p>
        </div>

        {classes.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 bg-white px-4 py-12 text-center text-sm text-slate-500">
            아직 소속된 반이 없습니다.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {classes.map((classItem) => (
              <Card key={classItem.id} className="border-slate-200">
                <CardHeader>
                  <CardTitle className="text-base text-slate-900">{classItem.name}</CardTitle>
                  {classItem.description ? (
                    <p className="text-sm text-slate-500">{classItem.description}</p>
                  ) : null}
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-slate-600">
                  <p>
                    <span className="font-medium text-slate-700">담임: </span>
                    {classItem.homeroomTeacherName ?? '미지정'}
                  </p>
                  <div>
                    <p className="font-medium text-slate-700">학생 ({classItem.students.length}명)</p>
                    {classItem.students.length === 0 ? (
                      <p className="mt-1 text-xs text-slate-500">배정된 학생이 없습니다.</p>
                    ) : (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {classItem.students.map((student) => (
                          <Badge key={student.id} variant="outline" className="text-xs">
                            {student.name ?? student.email ?? '이름 없음'}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
