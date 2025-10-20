'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import {
  CalendarDays,
  Check,
  Edit2,
  Eye,
  LayoutGrid,
  Loader2,
  PenSquare,
  Plus,
  Trash2,
  Users,
} from 'lucide-react'

import {
  addTimetableTeacherAction,
  clearTimetableCellAssignmentsAction,
  createTimetableAction,
  createTimetablePeriodAction,
  deleteTimetableAction,
  deleteTimetablePeriodAction,
  removeTimetableTeacherAction,
  setTimetableCellAssignmentsAction,
  updateTimetableNameAction,
  updateTimetablePeriodAction,
} from '@/app/dashboard/manager/classes/timetable-actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import type { ClassSummary, ProfileOption } from '@/types/class'
import type {
  TimetableAssignment,
  TimetablePeriod,
  TimetableSummary,
  TimetableTeacherColumn,
} from '@/types/timetable'

interface TimetableManagerProps {
  timetables: TimetableSummary[]
  classes: ClassSummary[]
  teacherOptions: ProfileOption[]
}

interface FeedbackState {
  type: 'success' | 'error'
  message: string
}

interface ActiveCell {
  timetableId: string
  teacherColumnId: string
  periodId: string
}

export function TimetableManager({ timetables, classes, teacherOptions }: TimetableManagerProps) {
  const [items, setItems] = useState<TimetableSummary[]>(timetables)
  const [selectedTimetableId, setSelectedTimetableId] = useState<string | null>(
    timetables[0]?.id ?? null,
  )
  const [isCreatingTimetable, setIsCreatingTimetable] = useState(false)
  const [newTimetableName, setNewTimetableName] = useState('')
  const [timetableNameDraft, setTimetableNameDraft] = useState('')
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<FeedbackState | null>(null)
  const [isAssignmentSheetOpen, setIsAssignmentSheetOpen] = useState(false)
  const [activeCell, setActiveCell] = useState<ActiveCell | null>(null)
  const [selectedClassIdsForCell, setSelectedClassIdsForCell] = useState<string[]>([])
  const [classSearch, setClassSearch] = useState('')
  const [editingPeriodId, setEditingPeriodId] = useState<string | null>(null)
  const [periodDraftName, setPeriodDraftName] = useState('')
  const [teacherToAdd, setTeacherToAdd] = useState<string>('')
  const [isLoading, startTransition] = useTransition()
  const [isEditing, setIsEditing] = useState(false)

  useEffect(() => {
    setItems(timetables)
  }, [timetables])

  useEffect(() => {
    if (!selectedTimetableId || !timetables.some((item) => item.id === selectedTimetableId)) {
      setSelectedTimetableId(timetables[0]?.id ?? null)
    }
  }, [selectedTimetableId, timetables])

  const teacherOptionMap = useMemo(
    () => new Map(teacherOptions.map((option) => [option.id, option])),
    [teacherOptions],
  )
  const classMap = useMemo(() => new Map(classes.map((item) => [item.id, item])), [classes])

  const selectedTimetable = useMemo(
    () => items.find((item) => item.id === selectedTimetableId) ?? null,
    [items, selectedTimetableId],
  )

  useEffect(() => {
    setTimetableNameDraft(selectedTimetable?.name ?? '')
  }, [selectedTimetable?.id, selectedTimetable?.name])

  useEffect(() => {
    if (!isEditing) {
      setEditingPeriodId(null)
      setPeriodDraftName('')
      setIsAssignmentSheetOpen(false)
    }
  }, [isEditing])

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

    for (const entry of map.values()) {
      entry.sort((a, b) => a.className.localeCompare(b.className, 'ko'))
    }

    return map
  }, [selectedTimetable])

  const availableTeacherOptions = useMemo(() => {
    if (!selectedTimetable) {
      return teacherOptions
    }

    const assigned = new Set(selectedTimetable.teacherColumns.map((column) => column.teacherId))
    return teacherOptions.filter((option) => !assigned.has(option.id))
  }, [selectedTimetable, teacherOptions])

  function updateFeedback(next: FeedbackState | null) {
    setFeedback(next)
  }

  function runAction<T>(name: string, action: () => Promise<T & { status: 'success' | 'error'; message?: string }>, onSuccess?: (result: T & { status: 'success' | 'error'; message?: string }) => void) {
    updateFeedback(null)
    setPendingAction(name)

    startTransition(() => {
      void (async () => {
        try {
          const result = await action()

          if (result.status === 'success') {
            onSuccess?.(result)
            if (result.message) {
              updateFeedback({ type: 'success', message: result.message })
            }
          } else if (result.status === 'error') {
            if (result.message) {
              updateFeedback({ type: 'error', message: result.message })
            }
          }
        } catch (error) {
          console.error(name, error)
          updateFeedback({ type: 'error', message: '요청 처리 중 오류가 발생했습니다.' })
        } finally {
          setPendingAction(null)
        }
      })()
    })
  }

  function handleCreateTimetable() {
    const trimmed = newTimetableName.trim()

    if (!trimmed) {
      updateFeedback({ type: 'error', message: '시간표 이름을 입력해주세요.' })
      return
    }

    runAction('create-timetable', () => createTimetableAction({ name: trimmed }), (result) => {
      if (result.status !== 'success' || !result.timetable) {
        return
      }

      setItems((prev) => [
        ...prev,
        {
          id: result.timetable!.id,
          name: result.timetable!.name,
          createdAt: result.timetable!.createdAt,
          updatedAt: result.timetable!.updatedAt,
          teacherColumns: [],
          periods: [],
          assignments: [],
        },
      ])
      setSelectedTimetableId(result.timetable.id)
      setIsCreatingTimetable(false)
      setNewTimetableName('')
    })
  }

  function handleUpdateTimetableName() {
    if (!selectedTimetable) {
      return
    }

    const trimmed = timetableNameDraft.trim()

    if (!trimmed || trimmed === selectedTimetable.name) {
      setTimetableNameDraft(selectedTimetable.name)
      return
    }

    runAction(
      'rename-timetable',
      () => updateTimetableNameAction({ timetableId: selectedTimetable.id, name: trimmed }),
      (result) => {
        if (result.status !== 'success' || !result.timetable) {
          return
        }

        setItems((prev) =>
          prev.map((item) => (item.id === selectedTimetable.id ? { ...item, name: trimmed } : item)),
        )
      },
    )
  }

  function handleDeleteTimetable() {
    if (!selectedTimetable) {
      return
    }

    const confirmed = window.confirm('선택한 시간표를 삭제하시겠습니까? 삭제하면 복구할 수 없습니다.')

    if (!confirmed) {
      return
    }

    runAction('delete-timetable', () => deleteTimetableAction({ timetableId: selectedTimetable.id }), () => {
      setItems((prev) => {
        const nextItems = prev.filter((item) => item.id !== selectedTimetable.id)

        setSelectedTimetableId((current) => {
          if (current === selectedTimetable.id) {
            return nextItems[0]?.id ?? null
          }
          return current
        })

        return nextItems
      })
    })
  }

  function handleAddTeacher() {
    if (!selectedTimetable) {
      return
    }

    const teacherId = teacherToAdd.trim()

    if (!teacherId) {
      updateFeedback({ type: 'error', message: '추가할 선생님을 선택해주세요.' })
      return
    }

    runAction(
      'add-teacher',
      () => addTimetableTeacherAction({ timetableId: selectedTimetable.id, teacherId }),
      (result) => {
        if (result.status !== 'success' || !result.teacherColumn) {
          return
        }

        const option = teacherOptionMap.get(result.teacherColumn.teacherId)

        setItems((prev) =>
          prev.map((item) => {
            if (item.id !== selectedTimetable.id) {
              return item
            }

            const nextColumns: TimetableTeacherColumn[] = [
              ...item.teacherColumns,
              {
                id: result.teacherColumn!.id,
                timetableId: result.teacherColumn!.timetableId,
                teacherId: result.teacherColumn!.teacherId,
                position: result.teacherColumn!.position,
                teacherName: option?.name ?? null,
                teacherEmail: option?.email ?? null,
              },
            ].sort((a, b) => a.position - b.position)

            return {
              ...item,
              teacherColumns: nextColumns,
            }
          }),
        )

        setTeacherToAdd('')
      },
    )
  }

  function handleRemoveTeacher(column: TimetableTeacherColumn) {
    runAction(
      'remove-teacher',
      () => removeTimetableTeacherAction({ timetableTeacherId: column.id }),
      (result) => {
        if (result.status !== 'success' || !result.removedId || !selectedTimetable) {
          return
        }

        setItems((prev) =>
          prev.map((item) => {
            if (item.id !== selectedTimetable.id) {
              return item
            }

            return {
              ...item,
              teacherColumns: item.teacherColumns.filter((teacher) => teacher.id !== result.removedId),
              assignments: item.assignments.filter(
                (assignment) => assignment.teacherColumnId !== result.removedId,
              ),
            }
          }),
        )
      },
    )
  }

  function handleAddPeriod() {
    if (!selectedTimetable) {
      return
    }

    const defaultName = `새 교시 ${selectedTimetable.periods.length + 1}`

    runAction(
      'add-period',
      () => createTimetablePeriodAction({ timetableId: selectedTimetable.id, name: defaultName }),
      (result) => {
        if (result.status !== 'success' || !result.period || !selectedTimetable) {
          return
        }

        setItems((prev) =>
          prev.map((item) => {
            if (item.id !== selectedTimetable.id) {
              return item
            }

            return {
              ...item,
              periods: [...item.periods, result.period!].sort((a, b) => a.position - b.position),
            }
          }),
        )

        setEditingPeriodId(result.period.id)
        setPeriodDraftName(result.period.name)
      },
    )
  }

  function handleStartEditPeriod(period: TimetablePeriod) {
    setEditingPeriodId(period.id)
    setPeriodDraftName(period.name)
  }

  function handleUpdatePeriodName(period: TimetablePeriod) {
    const trimmed = periodDraftName.trim()

    if (!trimmed || trimmed === period.name) {
      setEditingPeriodId(null)
      setPeriodDraftName('')
      return
    }

    runAction(
      'rename-period',
      () => updateTimetablePeriodAction({ periodId: period.id, name: trimmed }),
      (result) => {
        if (result.status !== 'success' || !result.period || !selectedTimetable) {
          return
        }

        setItems((prev) =>
          prev.map((item) => {
            if (item.id !== selectedTimetable.id) {
              return item
            }

            return {
              ...item,
              periods: item.periods.map((row) => (row.id === period.id ? { ...row, name: trimmed } : row)),
            }
          }),
        )
      },
    )

    setEditingPeriodId(null)
    setPeriodDraftName('')
  }

  function handleDeletePeriod(period: TimetablePeriod) {
    const confirmed = window.confirm('해당 교시를 삭제하시겠습니까? 배정된 반도 함께 제거됩니다.')

    if (!confirmed) {
      return
    }

    runAction(
      'delete-period',
      () => deleteTimetablePeriodAction({ periodId: period.id }),
      (result) => {
        if (result.status !== 'success' || !result.removedId || !selectedTimetable) {
          return
        }

        setItems((prev) =>
          prev.map((item) => {
            if (item.id !== selectedTimetable.id) {
              return item
            }

            return {
              ...item,
              periods: item.periods.filter((row) => row.id !== result.removedId),
              assignments: item.assignments.filter((row) => row.periodId !== result.removedId),
            }
          }),
        )
      },
    )
  }

  function openAssignmentsSheet(cell: ActiveCell) {
    setActiveCell(cell)

    const key = `${cell.teacherColumnId}:${cell.periodId}`
    const existing = assignmentsByCell.get(key) ?? []
    setSelectedClassIdsForCell(existing.map((item) => item.classId))
    setClassSearch('')
    setIsAssignmentSheetOpen(true)
  }

  function handleToggleClassSelection(classId: string) {
    setSelectedClassIdsForCell((prev) => {
      if (prev.includes(classId)) {
        return prev.filter((id) => id !== classId)
      }
      return [...prev, classId]
    })
  }

  function handleSaveAssignments() {
    if (!activeCell) {
      return
    }

    if (selectedClassIdsForCell.length === 0) {
      updateFeedback({ type: 'error', message: '배정할 반을 선택해주세요.' })
      return
    }

    runAction(
      'save-cell-assignments',
      () =>
        setTimetableCellAssignmentsAction({
          timetableId: activeCell.timetableId,
          teacherColumnId: activeCell.teacherColumnId,
          periodId: activeCell.periodId,
          classIds: selectedClassIdsForCell,
        }),
      (result) => {
        if (result.status !== 'success' || !selectedTimetable) {
          return
        }

        setItems((prev) =>
          prev.map((item) => {
            if (item.id !== activeCell.timetableId) {
              return item
            }

            const filtered = item.assignments.filter(
              (assignment) =>
                !(
                  assignment.teacherColumnId === activeCell.teacherColumnId &&
                  assignment.periodId === activeCell.periodId
                ),
            )

            const nextAssignments: TimetableAssignment[] = [
              ...filtered,
              ...(result.assignments ?? []).map((assignment) => ({
                id: assignment.id,
                timetableId: item.id,
                teacherColumnId: activeCell.teacherColumnId,
                periodId: activeCell.periodId,
                classId: assignment.classId,
                className: classMap.get(assignment.classId)?.name ?? '이름 없는 반',
              })),
            ]

            return {
              ...item,
              assignments: nextAssignments,
            }
          }),
        )

        setIsAssignmentSheetOpen(false)
        setActiveCell(null)
      },
    )
  }

  function handleClearAssignments() {
    if (!activeCell) {
      return
    }

    runAction(
      'clear-cell-assignments',
      () =>
        clearTimetableCellAssignmentsAction({
          timetableId: activeCell.timetableId,
          teacherColumnId: activeCell.teacherColumnId,
          periodId: activeCell.periodId,
        }),
      (result) => {
        if (result.status !== 'success') {
          return
        }

        setItems((prev) =>
          prev.map((item) => {
            if (item.id !== activeCell.timetableId) {
              return item
            }

            return {
              ...item,
              assignments: item.assignments.filter(
                (assignment) =>
                  !(
                    assignment.teacherColumnId === activeCell.teacherColumnId &&
                    assignment.periodId === activeCell.periodId
                  ),
              ),
            }
          }),
        )

        setIsAssignmentSheetOpen(false)
        setActiveCell(null)
      },
    )
  }

  const filteredClassesForSheet = useMemo(() => {
    const term = classSearch.trim().toLowerCase()

    if (!term) {
      return classes
    }

    return classes.filter((item) => {
      const base = [item.name, item.description ?? ''].join(' ').toLowerCase()
      const teacherNames = item.teachers
        .map((teacher) => (teacher.name ?? teacher.email ?? '').toLowerCase())
        .join(' ')
      const studentNames = item.students
        .map((student) => (student.name ?? student.email ?? '').toLowerCase())
        .join(' ')

      return base.includes(term) || teacherNames.includes(term) || studentNames.includes(term)
    })
  }, [classSearch, classes])

  return (
    <section className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">시간표 관리</h2>
            <p className="text-sm text-slate-500">
              원하는 선생님과 교시를 추가한 뒤, 셀 단위로 반을 배정하여 운영 시간을 관리하세요.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={isEditing ? 'default' : 'outline'}
              onClick={() => setIsEditing((prev) => !prev)}
            >
              {isEditing ? (
                <Eye className="mr-2 size-4" />
              ) : (
                <PenSquare className="mr-2 size-4" />
              )}
              {isEditing ? '편집 종료' : '구성 편집'}
            </Button>
            <Button variant="outline" onClick={() => setIsCreatingTimetable((prev) => !prev)}>
              <Plus className="mr-2 size-4" /> 새 시간표 생성
            </Button>
          </div>
        </header>

        {feedback ? (
          <div
            className={cn(
              'mt-4 rounded-md border px-4 py-2 text-sm',
              feedback.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-destructive/40 bg-destructive/10 text-destructive',
            )}
          >
            {feedback.message}
          </div>
        ) : null}

        {isCreatingTimetable ? (
          <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                value={newTimetableName}
                onChange={(event) => setNewTimetableName(event.target.value)}
                placeholder="예) 토요반 정규 시간표"
                className="sm:w-64"
              />
              <div className="flex gap-2">
                <Button onClick={handleCreateTimetable} disabled={isLoading}>
                  {pendingAction === 'create-timetable' ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : null}
                  생성
                </Button>
                <Button variant="ghost" onClick={() => setIsCreatingTimetable(false)}>
                  취소
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="space-y-4">
        <aside className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
            <CalendarDays className="size-4 text-slate-500" />
            <span className="text-sm font-medium text-slate-700">시간표 목록</span>
          </div>
          <div className="mt-3 max-h-[420px] overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-2 py-3 text-sm text-slate-500">생성된 시간표가 없습니다.</p>
            ) : (
              <ul className="divide-y divide-slate-200">
                {items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedTimetableId(item.id)}
                      className={cn(
                        'flex w-full items-center justify-between px-2 py-3 text-left text-sm transition',
                        item.id === selectedTimetableId
                          ? 'bg-slate-100 font-medium text-slate-900'
                          : 'hover:bg-slate-50 text-slate-600',
                      )}
                    >
                      <span>{item.name}</span>
                      {item.id === selectedTimetableId ? (
                        <Check className="size-4 text-emerald-600" />
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          {selectedTimetable ? (
            <div className="space-y-4">
              <div className="flex flex-col gap-3 rounded-md border border-slate-200 p-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Input
                    value={timetableNameDraft}
                    onChange={(event) => setTimetableNameDraft(event.target.value)}
                    onBlur={handleUpdateTimetableName}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        handleUpdateTimetableName()
                      }
                    }}
                    className="sm:w-72"
                  />
                  <div className="text-xs text-slate-500">
                    최근 업데이트: {new Date(selectedTimetable.updatedAt).toLocaleString('ko-KR')}
                  </div>
                </div>
                <Button variant="ghost" className="justify-start text-destructive" onClick={handleDeleteTimetable}>
                  <Trash2 className="mr-2 size-4" /> 삭제
                </Button>
              </div>

              <div className="space-y-3 rounded-md border border-slate-200 p-4">
                <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <LayoutGrid className="size-4" /> 선생님/교시 구성
                  </div>
                  {isEditing ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Select value={teacherToAdd} onValueChange={(value) => setTeacherToAdd(value)}>
                        <SelectTrigger className="min-w-[180px]">
                          <SelectValue placeholder="선생님 선택" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableTeacherOptions.length === 0 ? (
                            <SelectItem value="" disabled>
                              추가할 선생님 없음
                            </SelectItem>
                          ) : (
                            availableTeacherOptions.map((option) => (
                              <SelectItem key={option.id} value={option.id}>
                                {option.name ?? option.email ?? '이름 없음'}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                      <Button
                        onClick={handleAddTeacher}
                        disabled={!teacherToAdd || pendingAction === 'add-teacher'}
                      >
                        {pendingAction === 'add-teacher' ? (
                          <Loader2 className="mr-2 size-4 animate-spin" />
                        ) : (
                          <Plus className="mr-2 size-4" />
                        )}
                        선생님 추가
                      </Button>
                    </div>
                  ) : null}
                </header>

                <div className="overflow-auto">
                  <table className="w-full min-w-[720px] table-fixed border-collapse">
                    <thead>
                      <tr>
                        <th className="w-48 border border-slate-200 bg-slate-50 px-4 py-2 text-left text-sm font-medium text-slate-700">
                          교시 이름
                        </th>
                        {selectedTimetable.teacherColumns.map((column) => (
                          <th
                            key={column.id}
                            className="min-w-[180px] border border-slate-200 bg-slate-50 px-4 py-2 text-left text-sm font-medium text-slate-700"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div>
                                <div className="text-sm font-semibold text-slate-800">
                                  {column.teacherName ?? column.teacherEmail ?? '이름 없음'}
                                </div>
                                {isEditing ? (
                                  <div className="text-xs text-slate-500">열 순서 {column.position + 1}</div>
                                ) : null}
                              </div>
                              {isEditing ? (
                                <button
                                  type="button"
                                  className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                                  onClick={() => handleRemoveTeacher(column)}
                                  title="선생님 제거"
                                >
                                  <Trash2 className="size-4" />
                                </button>
                              ) : null}
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {selectedTimetable.periods.map((period) => (
                        <tr key={period.id}>
                          <td className="border border-slate-200 px-4 py-3 align-top">
                            {editingPeriodId === period.id ? (
                              <div className="flex items-center gap-2">
                                <Textarea
                                  value={periodDraftName}
                                  onChange={(event) => setPeriodDraftName(event.target.value)}
                                  onBlur={() => handleUpdatePeriodName(period)}
                                  onKeyDown={(event) => {
                                    if (event.key === 'Enter' && !event.shiftKey) {
                                      event.preventDefault()
                                      handleUpdatePeriodName(period)
                                    }
                                  }}
                                  className="min-h-[72px] resize-none"
                                  autoFocus
                                />
                              </div>
                            ) : (
                              <div className="flex items-center justify-between gap-2">
                                <div>
                                  <div className="whitespace-pre-line text-sm font-medium text-slate-800">
                                    {period.name}
                                  </div>
                                  {isEditing ? (
                                    <div className="text-xs text-slate-500">교시 순서 {period.position + 1}</div>
                                  ) : null}
                                </div>
                                {isEditing ? (
                                  <div className="flex items-center gap-1">
                                    <button
                                      type="button"
                                      className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                                      onClick={() => handleStartEditPeriod(period)}
                                      title="교시 이름 수정"
                                    >
                                      <Edit2 className="size-4" />
                                    </button>
                                    <button
                                      type="button"
                                      className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                                      onClick={() => handleDeletePeriod(period)}
                                      title="교시 삭제"
                                    >
                                      <Trash2 className="size-4" />
                                    </button>
                                  </div>
                                ) : null}
                              </div>
                            )}
                          </td>
                          {selectedTimetable.teacherColumns.map((column) => {
                            const key = `${column.id}:${period.id}`
                            const assignments = assignmentsByCell.get(key) ?? []

                            return (
                              <td key={column.id} className="border border-slate-200 px-3 py-3 align-top">
                                {assignments.length === 0 ? (
                                  isEditing ? (
                                    <button
                                      type="button"
                                      className="w-full rounded-md border border-dashed border-slate-300 px-3 py-6 text-sm text-slate-500 transition hover:border-slate-400 hover:text-slate-700"
                                      onClick={() =>
                                        openAssignmentsSheet({
                                          timetableId: selectedTimetable.id,
                                          teacherColumnId: column.id,
                                          periodId: period.id,
                                        })
                                      }
                                    >
                                      <Plus className="mr-2 inline size-4" /> 반 배정하기
                                    </button>
                                  ) : (
                                    <div className="rounded-md border border-dashed border-slate-200 px-3 py-6 text-center text-xs text-slate-400">
                                      배정 없음
                                    </div>
                                  )
                                ) : (
                                  <div className="space-y-2">
                                    <div className="flex flex-wrap gap-2">
                                      {assignments.map((assignment) => (
                                        <Badge
                                          key={assignment.id}
                                          variant="secondary"
                                          className={cn(
                                            'cursor-default',
                                            isEditing && 'cursor-pointer',
                                          )}
                                          onClick={
                                            isEditing
                                              ? () =>
                                                  openAssignmentsSheet({
                                                    timetableId: selectedTimetable.id,
                                                    teacherColumnId: column.id,
                                                    periodId: period.id,
                                                  })
                                              : undefined
                                          }
                                        >
                                          {assignment.className}
                                        </Badge>
                                      ))}
                                    </div>
                                    {isEditing ? (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 px-2 text-xs text-slate-500"
                                        onClick={() =>
                                          openAssignmentsSheet({
                                            timetableId: selectedTimetable.id,
                                            teacherColumnId: column.id,
                                            periodId: period.id,
                                          })
                                        }
                                      >
                                        수정
                                      </Button>
                                    ) : null}
                                  </div>
                                )}
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                      {isEditing ? (
                        <tr>
                          <td
                            className="border border-slate-200 px-4 py-3"
                            colSpan={selectedTimetable.teacherColumns.length + 1}
                          >
                            <Button variant="outline" onClick={handleAddPeriod}>
                              <Plus className="mr-2 size-4" /> 교시 추가
                            </Button>
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-12 text-center text-slate-500">
              시간표를 선택하거나 새 시간표를 생성해주세요.
            </div>
          )}
        </div>
      </div>

      <Sheet open={isAssignmentSheetOpen && isEditing} onOpenChange={setIsAssignmentSheetOpen}>
        <SheetContent className="w-full max-w-xl">
          <SheetHeader>
            <SheetTitle>반 배정</SheetTitle>
          </SheetHeader>

          <div className="flex flex-col gap-4 px-4 py-4">
            <Input
              value={classSearch}
              onChange={(event) => setClassSearch(event.target.value)}
              placeholder="반, 교사, 학생 검색"
            />

            <div className="max-h-64 overflow-y-auto rounded-md border border-slate-200 p-3">
              {filteredClassesForSheet.length === 0 ? (
                <p className="text-sm text-slate-500">검색 결과가 없습니다.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {filteredClassesForSheet.map((item) => {
                    const checked = selectedClassIdsForCell.includes(item.id)
                    const teacher = item.teachers.find((teacher) => teacher.isHomeroom) ?? item.teachers[0]

                    return (
                      <li key={item.id}>
                        <label className="flex cursor-pointer items-start gap-3 rounded-md border border-transparent px-2 py-2 transition hover:border-slate-200 hover:bg-slate-50">
                          <input
                            type="checkbox"
                            className="mt-1 size-4"
                            checked={checked}
                            onChange={() => handleToggleClassSelection(item.id)}
                          />
                          <div className="space-y-1">
                            <div className="font-medium text-slate-800">{item.name}</div>
                            <div className="text-xs text-slate-500">
                              담임 {teacher?.name ?? teacher?.email ?? '미지정'} · 학생 {item.students.length}명
                            </div>
                          </div>
                        </label>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <Users className="size-4" /> 선택된 반 정보
              </div>
              {selectedClassIdsForCell.length === 0 ? (
                <p className="text-sm text-slate-500">아직 선택된 반이 없습니다.</p>
              ) : (
                <div className="space-y-3">
                  {selectedClassIdsForCell.map((classId) => {
                    const classInfo = classMap.get(classId)

                    if (!classInfo) {
                      return null
                    }

                    const homeroom = classInfo.teachers.find((teacher) => teacher.isHomeroom)

                    return (
                      <div key={classId} className="rounded-md border border-slate-200 p-3 text-sm">
                        <div className="flex items-center justify-between">
                          <div className="font-medium text-slate-800">{classInfo.name}</div>
                          <button
                            type="button"
                            className="text-xs text-slate-500 underline"
                            onClick={() => handleToggleClassSelection(classId)}
                          >
                            제외
                          </button>
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          담임 {homeroom?.name ?? homeroom?.email ?? '미지정'}
                        </div>
                        <div className="mt-2 text-xs text-slate-600">
                          학생 ({classInfo.students.length})
                        </div>
                        <ul className="mt-1 flex flex-wrap gap-1 text-xs text-slate-500">
                          {classInfo.students.length === 0 ? (
                            <li>배정된 학생 없음</li>
                          ) : (
                            classInfo.students.map((student) => (
                              <li key={student.id} className="rounded bg-slate-100 px-2 py-0.5">
                                {student.name ?? student.email ?? '이름 없음'}
                              </li>
                            ))
                          )}
                        </ul>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          <SheetFooter>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
              <Button
                variant="ghost"
                className="text-slate-500"
                onClick={handleClearAssignments}
                disabled={!activeCell || pendingAction === 'clear-cell-assignments'}
              >
                {pendingAction === 'clear-cell-assignments' ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : null}
                배정 해제
              </Button>
              <Button
                onClick={handleSaveAssignments}
                disabled={selectedClassIdsForCell.length === 0 || pendingAction === 'save-cell-assignments'}
              >
                {pendingAction === 'save-cell-assignments' ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : null}
                저장
              </Button>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </section>
  )
}
