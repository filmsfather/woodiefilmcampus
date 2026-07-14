'use client'

import { useMemo, useState, useTransition } from 'react'
import { CalendarDays, Edit2, Loader2, Plus, Trash2 } from 'lucide-react'

import {
  deleteClassScheduleEntryAction,
  upsertClassScheduleEntryAction,
} from '@/app/dashboard/manager/classes/timetable-actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { ClassSummary, ProfileOption } from '@/types/class'
import {
  compareScheduleEntries,
  DAY_OF_WEEK_LABELS,
  formatScheduleTimeRange,
  type ClassScheduleEntry,
} from '@/types/timetable'

const NO_TEACHER_VALUE = 'none'

interface ClassScheduleManagerProps {
  classes: ClassSummary[]
  teacherOptions: ProfileOption[]
  entries: ClassScheduleEntry[]
}

interface FeedbackState {
  type: 'success' | 'error'
  message: string
}

interface EntryFormState {
  dayOfWeek: string
  period: string
  startTime: string
  endTime: string
  teacherId: string
}

const EMPTY_FORM: EntryFormState = {
  dayOfWeek: '',
  period: '',
  startTime: '',
  endTime: '',
  teacherId: NO_TEACHER_VALUE,
}

export function ClassScheduleManager({ classes, teacherOptions, entries }: ClassScheduleManagerProps) {
  const [items, setItems] = useState<ClassScheduleEntry[]>(entries)
  const [selectedClassId, setSelectedClassId] = useState<string | null>(classes[0]?.id ?? null)
  const [form, setForm] = useState<EntryFormState>(EMPTY_FORM)
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [feedback, setFeedback] = useState<FeedbackState | null>(null)
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const classMap = useMemo(() => new Map(classes.map((item) => [item.id, item])), [classes])
  const teacherMap = useMemo(
    () => new Map(teacherOptions.map((option) => [option.id, option])),
    [teacherOptions],
  )

  const selectedClass = selectedClassId ? classMap.get(selectedClassId) ?? null : null

  const entriesForClass = useMemo(() => {
    if (!selectedClassId) {
      return []
    }
    return items
      .filter((entry) => entry.classId === selectedClassId)
      .sort(compareScheduleEntries)
  }, [items, selectedClassId])

  function resetForm() {
    setForm(EMPTY_FORM)
    setEditingEntryId(null)
    setIsFormOpen(false)
  }

  function openCreateForm() {
    setForm(EMPTY_FORM)
    setEditingEntryId(null)
    setIsFormOpen(true)
    setFeedback(null)
  }

  function openEditForm(entry: ClassScheduleEntry) {
    setForm({
      dayOfWeek: String(entry.dayOfWeek),
      period: String(entry.period),
      startTime: entry.startTime.slice(0, 5),
      endTime: entry.endTime.slice(0, 5),
      teacherId: entry.teacherId ?? NO_TEACHER_VALUE,
    })
    setEditingEntryId(entry.id)
    setIsFormOpen(true)
    setFeedback(null)
  }

  function handleSubmit() {
    if (!selectedClassId) {
      return
    }

    if (form.dayOfWeek === '') {
      setFeedback({ type: 'error', message: '요일을 선택해주세요.' })
      return
    }

    const periodValue = Number(form.period)
    if (!Number.isInteger(periodValue) || periodValue < 1) {
      setFeedback({ type: 'error', message: '교시를 올바르게 입력해주세요.' })
      return
    }

    if (!form.startTime || !form.endTime) {
      setFeedback({ type: 'error', message: '시작/종료 시간을 입력해주세요.' })
      return
    }

    if (form.startTime >= form.endTime) {
      setFeedback({ type: 'error', message: '종료 시간은 시작 시간보다 늦어야 합니다.' })
      return
    }

    const input = {
      entryId: editingEntryId ?? undefined,
      classId: selectedClassId,
      dayOfWeek: Number(form.dayOfWeek),
      period: periodValue,
      startTime: form.startTime,
      endTime: form.endTime,
      teacherId: form.teacherId === NO_TEACHER_VALUE ? null : form.teacherId,
    }

    setFeedback(null)
    setPendingAction('save')

    startTransition(() => {
      void (async () => {
        try {
          const result = await upsertClassScheduleEntryAction(input)

          if (result.status === 'success' && result.entry) {
            const saved = result.entry
            const teacher = saved.teacherId ? teacherMap.get(saved.teacherId) ?? null : null
            const normalized: ClassScheduleEntry = {
              id: saved.id,
              classId: saved.classId,
              className: classMap.get(saved.classId)?.name ?? '이름 없는 반',
              dayOfWeek: saved.dayOfWeek,
              period: saved.period,
              startTime: saved.startTime,
              endTime: saved.endTime,
              teacherId: saved.teacherId,
              teacherName: teacher?.name ?? teacher?.email ?? null,
            }

            setItems((prev) => {
              const filtered = prev.filter((entry) => entry.id !== normalized.id)
              return [...filtered, normalized]
            })
            resetForm()
            setFeedback({ type: 'success', message: result.message ?? '저장했습니다.' })
          } else {
            setFeedback({ type: 'error', message: result.message ?? '저장하지 못했습니다.' })
          }
        } catch (error) {
          console.error('upsertClassScheduleEntryAction failed', error)
          setFeedback({ type: 'error', message: '요청 처리 중 오류가 발생했습니다.' })
        } finally {
          setPendingAction(null)
        }
      })()
    })
  }

  function handleDelete(entry: ClassScheduleEntry) {
    const confirmed = window.confirm(
      `${DAY_OF_WEEK_LABELS[entry.dayOfWeek]}요일 ${entry.period}교시 수업을 삭제하시겠습니까?`,
    )

    if (!confirmed) {
      return
    }

    setFeedback(null)
    setPendingAction(`delete-${entry.id}`)

    startTransition(() => {
      void (async () => {
        try {
          const result = await deleteClassScheduleEntryAction({ entryId: entry.id })

          if (result.status === 'success' && result.removedId) {
            setItems((prev) => prev.filter((item) => item.id !== result.removedId))
            if (editingEntryId === result.removedId) {
              resetForm()
            }
            setFeedback({ type: 'success', message: result.message ?? '삭제했습니다.' })
          } else {
            setFeedback({ type: 'error', message: result.message ?? '삭제하지 못했습니다.' })
          }
        } catch (error) {
          console.error('deleteClassScheduleEntryAction failed', error)
          setFeedback({ type: 'error', message: '요청 처리 중 오류가 발생했습니다.' })
        } finally {
          setPendingAction(null)
        }
      })()
    })
  }

  return (
    <section className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">반별 시간표 관리</h2>
            <p className="text-sm text-slate-500">
              반을 선택한 뒤 요일·교시·시간·선생님을 입력해 시간표를 구성하세요. 학생 화면에 바로 반영됩니다.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <CalendarDays className="size-4 text-slate-500" />
            <Select
              value={selectedClassId ?? ''}
              onValueChange={(value) => {
                setSelectedClassId(value)
                resetForm()
                setFeedback(null)
              }}
            >
              <SelectTrigger className="min-w-[200px]">
                <SelectValue placeholder="반 선택" />
              </SelectTrigger>
              <SelectContent>
                {classes.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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

        {!selectedClass ? (
          <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 px-4 py-12 text-center text-slate-500">
            먼저 반을 생성한 뒤 시간표를 입력할 수 있습니다.
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="overflow-auto rounded-md border border-slate-200">
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left text-slate-700">
                    <th className="border-b border-slate-200 px-4 py-2 font-medium">요일</th>
                    <th className="border-b border-slate-200 px-4 py-2 font-medium">교시</th>
                    <th className="border-b border-slate-200 px-4 py-2 font-medium">시간</th>
                    <th className="border-b border-slate-200 px-4 py-2 font-medium">선생님</th>
                    <th className="border-b border-slate-200 px-4 py-2 text-right font-medium">관리</th>
                  </tr>
                </thead>
                <tbody>
                  {entriesForClass.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                        아직 등록된 수업이 없습니다. 아래에서 수업을 추가해주세요.
                      </td>
                    </tr>
                  ) : (
                    entriesForClass.map((entry) => (
                      <tr key={entry.id} className="border-b border-slate-100 last:border-b-0">
                        <td className="px-4 py-3 font-medium text-slate-800">
                          {DAY_OF_WEEK_LABELS[entry.dayOfWeek]}
                        </td>
                        <td className="px-4 py-3 text-slate-700">{entry.period}교시</td>
                        <td className="px-4 py-3 text-slate-700">{formatScheduleTimeRange(entry)}</td>
                        <td className="px-4 py-3 text-slate-700">{entry.teacherName ?? '미지정'}</td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1">
                            <button
                              type="button"
                              className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                              onClick={() => openEditForm(entry)}
                              title="수정"
                            >
                              <Edit2 className="size-4" />
                            </button>
                            <button
                              type="button"
                              className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-destructive"
                              onClick={() => handleDelete(entry)}
                              disabled={pendingAction === `delete-${entry.id}`}
                              title="삭제"
                            >
                              {pendingAction === `delete-${entry.id}` ? (
                                <Loader2 className="size-4 animate-spin" />
                              ) : (
                                <Trash2 className="size-4" />
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {isFormOpen ? (
              <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
                <div className="mb-3 text-sm font-medium text-slate-700">
                  {editingEntryId ? '수업 수정' : '수업 추가'} · {selectedClass.name}
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-600">요일</label>
                    <Select
                      value={form.dayOfWeek}
                      onValueChange={(value) => setForm((prev) => ({ ...prev, dayOfWeek: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="요일" />
                      </SelectTrigger>
                      <SelectContent>
                        {DAY_OF_WEEK_LABELS.map((label, index) => (
                          <SelectItem key={label} value={String(index)}>
                            {label}요일
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-600">교시</label>
                    <Input
                      type="number"
                      min={1}
                      max={20}
                      value={form.period}
                      onChange={(event) => setForm((prev) => ({ ...prev, period: event.target.value }))}
                      placeholder="예) 1"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-600">시작 시간</label>
                    <Input
                      type="time"
                      value={form.startTime}
                      onChange={(event) => setForm((prev) => ({ ...prev, startTime: event.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-600">종료 시간</label>
                    <Input
                      type="time"
                      value={form.endTime}
                      onChange={(event) => setForm((prev) => ({ ...prev, endTime: event.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-slate-600">선생님</label>
                    <Select
                      value={form.teacherId}
                      onValueChange={(value) => setForm((prev) => ({ ...prev, teacherId: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="선생님 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_TEACHER_VALUE}>미지정</SelectItem>
                        {teacherOptions.map((option) => (
                          <SelectItem key={option.id} value={option.id}>
                            {option.name ?? option.email ?? '이름 없음'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="mt-4 flex gap-2">
                  <Button onClick={handleSubmit} disabled={pendingAction === 'save'}>
                    {pendingAction === 'save' ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                    {editingEntryId ? '수정 저장' : '추가'}
                  </Button>
                  <Button variant="ghost" onClick={resetForm}>
                    취소
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="outline" onClick={openCreateForm}>
                <Plus className="mr-2 size-4" /> 수업 추가
              </Button>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
