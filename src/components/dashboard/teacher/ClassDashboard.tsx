'use client'

import Image from 'next/image'
import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  FileText,
  Pencil,
  Printer,
  Trash2,
} from 'lucide-react'

import { AssignmentEvaluationPanel } from '@/components/dashboard/teacher/AssignmentEvaluationPanel'
import { deleteAssignmentTarget, updateAssignmentDates } from '@/app/dashboard/teacher/actions'
import { useRouter, useSearchParams } from 'next/navigation'
import DateUtil from '@/lib/date-util'
import type { AssignmentDetail, WorkbookItemSummary } from '@/lib/assignment-evaluation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const TYPE_LABELS: Record<string, string> = {
  srs: 'SRS 반복',
  pdf: 'PDF 제출',
  writing: '서술형',
  film: '영화 감상',
  lecture: '인터넷 강의',
  image: '이미지 제출',
}

const STATUS_LABELS: Record<string, string> = {
  pending: '대기',
  not_started: '미시작',
  in_progress: '검토 필요',
  completed: '완료',
  canceled: '취소',
}

const STATUS_BADGE_VARIANT: Record<string, 'outline' | 'secondary' | 'default' | 'destructive'> = {
  pending: 'outline',
  not_started: 'outline',
  in_progress: 'default',
  completed: 'secondary',
  canceled: 'destructive',
}

interface ClassAssignmentSummary {
  id: string
  title: string
  subject: string
  type: string
  weekLabel: string | null
  publishedAt: string | null
  dueAt: string | null
  totalStudents: number
  completedStudents: number
  outstandingStudents: number
  completionRate: number
  hasPendingPrint: boolean
  detail: AssignmentDetail
  assignedBy: {
    id: string
    name: string | null
    email: string | null
  } | null
}

interface PendingTaskInfo {
  id: string
  status: string
  updatedAt: string
  student: {
    id: string
    name: string
    email: string | null
  }
  completedCount: number
  totalItems: number
  className: string
}

interface ClassSummary {
  incompleteStudents: number
  overdueAssignments: number
  pendingPrintRequests: number
  upcomingAssignments: number
  nextDueAtLabel: string | null
}

interface ClassDashboardProps {
  classId: string
  className: string
  managedClasses: Array<{ id: string; name: string }>
  teacherName: string | null
  assignments: ClassAssignmentSummary[]
  summary: ClassSummary
  initialAssignmentId?: string | null
}

export function ClassDashboard({
  classId,
  className,
  managedClasses,
  teacherName,
  assignments,
  summary,
  initialAssignmentId,
}: ClassDashboardProps) {
  const [activeAssignmentId, setActiveAssignmentId] = useState<string | null>(
    initialAssignmentId && assignments.some((assignment) => assignment.id === initialAssignmentId)
      ? initialAssignmentId
      : assignments[0]?.id ?? null
  )
  const [focusStudentTaskId, setFocusStudentTaskId] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [isDeletingClass, startDeleteClass] = useTransition()
  const [isPrintRequestsOpen, setIsPrintRequestsOpen] = useState(false)
  const [isAssignmentListOpen, setIsAssignmentListOpen] = useState(false)
  const [isContentOpen, setIsContentOpen] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const searchParamsString = searchParams.toString()

  const activeAssignment = useMemo(
    () => assignments.find((assignment) => assignment.id === activeAssignmentId) ?? null,
    [assignments, activeAssignmentId]
  )
  const activeDetail = activeAssignment?.detail ?? null
  const hasAssignments = assignments.length > 0
  const generatedAt = useMemo(() => DateUtil.nowUTC().toISOString(), [])
  const printRequestRows = useMemo(
    () =>
      assignments.flatMap((assignment) =>
        assignment.detail.printRequests.map((request) => ({ assignment, request }))
      ),
    [assignments]
  )

  useEffect(() => {
    if (activeAssignmentId && !assignments.some((assignment) => assignment.id === activeAssignmentId)) {
      setActiveAssignmentId(assignments[0]?.id ?? null)
    }
  }, [assignments, activeAssignmentId])

  useEffect(() => {
    if (!activeDetail) {
      setFocusStudentTaskId(null)
      return
    }
    setFocusStudentTaskId((current) => {
      if (current && activeDetail.studentTasks.some((task) => task.id === current)) {
        return current
      }
      const firstPending = activeDetail.studentTasks.find(
        (task) => task.status !== 'completed' && task.status !== 'canceled'
      )
      return firstPending ? firstPending.id : null
    })
  }, [activeDetail])

  const handleDeleteClassAssignment = useCallback(() => {
    const targetAssignment = activeAssignment
    if (!targetAssignment) {
      return
    }
    if (
      !window.confirm(
        `${className} 반에서 "${targetAssignment.title}" 과제를 삭제하시겠어요?`
      )
    ) {
      return
    }
    setActionMessage(null)
    const targetAssignmentId = targetAssignment.id
    startDeleteClass(async () => {
      const result = await deleteAssignmentTarget({ assignmentId: targetAssignmentId, classId })
      if (result?.error) {
        setActionMessage({ type: 'error', text: result.error })
        return
      }
      setActionMessage({ type: 'success', text: '반에서 과제를 삭제했습니다.' })
      setFocusStudentTaskId(null)
      setActiveAssignmentId((prev) => (prev === targetAssignmentId ? null : prev))
      router.refresh()
    })
  }, [activeAssignment, classId, className, router])

  const handleClassChange = useCallback(
    (nextClassId: string) => {
      if (!nextClassId || nextClassId === classId) {
        return
      }
      const params = new URLSearchParams(searchParamsString)
      params.delete('assignment')
      const queryString = params.toString()
      const target = queryString
        ? `/dashboard/teacher/review/${nextClassId}?${queryString}`
        : `/dashboard/teacher/review/${nextClassId}`
      router.push(target)
    },
    [classId, router, searchParamsString]
  )

  const statusSummary = useMemo(() => {
    if (!activeDetail) {
      return null
    }
    const counters: Record<string, number> = {
      pending: 0,
      not_started: 0,
      in_progress: 0,
      completed: 0,
      canceled: 0,
    }
    activeDetail.studentTasks.forEach((task) => {
      counters[task.status] = (counters[task.status] ?? 0) + 1
    })
    return counters
  }, [activeDetail])

  const classLookup = useMemo(() => {
    if (!activeDetail) {
      return new Map<string | null, string>()
    }
    return new Map(activeDetail.classes.map((cls) => [cls.id, cls.name]))
  }, [activeDetail])

  const workbookItems = useMemo<WorkbookItemSummary[]>(() => {
    if (!activeDetail) {
      return []
    }
    const unique = new Map<string, WorkbookItemSummary>()
    activeDetail.studentTasks.forEach((task) => {
      task.items.forEach((item) => {
        if (item.workbookItem && !unique.has(item.workbookItem.id)) {
          unique.set(item.workbookItem.id, item.workbookItem)
        }
      })
    })
    return Array.from(unique.values()).sort((a, b) => a.position - b.position)
  }, [activeDetail])

  const pendingTasks = useMemo<PendingTaskInfo[]>(() => {
    if (!activeDetail) {
      return []
    }
    const fallbackClass = activeDetail.classes[0]?.name ?? '반 정보 없음'
    return activeDetail.studentTasks
      .map((task) => {
        const completedCount = task.items.filter((item) => Boolean(item.completedAt)).length
        const totalItems = task.items.length
        return {
          id: task.id,
          status: task.status,
          updatedAt: task.updatedAt,
          student: {
            id: task.student.id,
            name: task.student.name,
            email: task.student.email ?? null,
          },
          completedCount,
          totalItems,
          className: task.student.classId
            ? classLookup.get(task.student.classId) ?? fallbackClass
            : fallbackClass,
        }
      })
      .filter((task) => task.status !== 'completed' && task.status !== 'canceled')
      .sort((a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt))
  }, [activeDetail, classLookup])

  const handleFocusStudentTask = useCallback((studentTaskId: string | null) => {
    setFocusStudentTaskId(studentTaskId)
  }, [])

  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <Select value={classId} onValueChange={handleClassChange}>
            <SelectTrigger className="h-auto border-none bg-transparent p-0 shadow-none hover:bg-transparent focus:ring-0">
              <h1 className="text-2xl font-semibold text-slate-900">
                {className} 반 과제 점검
              </h1>
            </SelectTrigger>
            <SelectContent>
              {managedClasses.map((managedClass) => (
                <SelectItem key={managedClass.id} value={managedClass.id}>
                  {managedClass.name} 반 과제 점검
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="text-sm text-slate-600">반의 과제 진행 상황을 확인하고 필요한 학생을 빠르게 평가하세요.</p>
      </header>

      {/* 과제 목록 */}
      <Card className="border-slate-200">
        <CardHeader
          className="flex cursor-pointer flex-col gap-2 transition-colors hover:bg-slate-50 md:flex-row md:items-center md:justify-between"
          onClick={() => setIsAssignmentListOpen((prev) => !prev)}
        >
          <div className="flex items-center gap-2">
            <ChevronDown
              className={`h-4 w-4 text-slate-500 transition-transform ${isAssignmentListOpen ? 'rotate-180' : ''}`}
            />
            <CardTitle className="text-base text-slate-900">과제 목록</CardTitle>
            <Badge variant="secondary" className="text-xs">
              {assignments.length}개
            </Badge>
          </div>
          {activeAssignment && (
            <p className="text-xs text-slate-500">
              선택: {activeAssignment.title}
            </p>
          )}
        </CardHeader>
        {isAssignmentListOpen && (
          <CardContent className="px-0">
            {!hasAssignments ? (
              <div className="px-4 py-4 text-center text-xs text-slate-500 sm:px-6">
                아직 이 반에 배정된 과제가 없습니다.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {assignments.map((assignment) => {
                  const isActive = assignment.id === activeAssignmentId
                  const publishedLabel = assignment.publishedAt
                    ? DateUtil.formatForDisplay(assignment.publishedAt, { month: 'short', day: 'numeric' })
                    : '-'
                  const dueLabel = assignment.dueAt
                    ? DateUtil.formatForDisplay(assignment.dueAt, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : '없음'

                  return (
                    <button
                      key={assignment.id}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setActiveAssignmentId(assignment.id)
                        setIsAssignmentListOpen(false)
                      }}
                      className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors sm:px-6 ${
                        isActive ? 'bg-primary/5' : 'hover:bg-slate-50'
                      }`}
                    >
                      <FileText className={`h-4 w-4 shrink-0 ${isActive ? 'text-primary' : 'text-slate-400'}`} />
                      <div className="min-w-0 flex-1">
                        <p className={`truncate text-sm font-medium ${isActive ? 'text-primary' : 'text-slate-700'}`}>
                          {assignment.title}
                        </p>
                        <p className="truncate text-xs text-slate-500">{assignment.subject}</p>
                      </div>
                      <div className="shrink-0 text-right text-xs text-slate-500">
                        <p>출제 {publishedLabel}</p>
                        <p>마감 {dueLabel}</p>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* 과제 상세 및 평가 */}
      {hasAssignments && (
        <div className="space-y-4">
            {actionMessage && (
              <div
                className={`rounded-md border px-3 py-2 text-xs ${
                  actionMessage.type === 'error'
                    ? 'border-destructive/40 bg-destructive/10 text-destructive'
                    : 'border-emerald-300 bg-emerald-50 text-emerald-700'
                }`}
              >
                {actionMessage.text}
              </div>
            )}
            {activeAssignment && activeDetail ? (
              <>
                <Card className="border-slate-200">
                  <CardHeader className="space-y-2 pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 space-y-1">
                        <CardTitle className="text-base text-slate-900">{activeAssignment.title}</CardTitle>
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                          <Badge variant="outline" className="text-[10px]">{activeAssignment.subject}</Badge>
                          <Badge variant="secondary" className="text-[10px]">{TYPE_LABELS[activeAssignment.type] ?? activeAssignment.type.toUpperCase()}</Badge>
                          {activeAssignment.assignedBy && (
                            <span>
                              {activeAssignment.assignedBy.name?.trim()
                                ? activeAssignment.assignedBy.name
                                : activeAssignment.assignedBy.email ?? ''}
                            </span>
                          )}
                          <span className="inline-flex items-center gap-0.5">
                            <CheckCircle2 className="h-3 w-3" /> {activeAssignment.completedStudents}/{activeAssignment.totalStudents}명
                          </span>
                          <AssignmentDateEditor
                            assignmentId={activeAssignment.id}
                            publishedAt={activeAssignment.publishedAt}
                            dueAt={activeAssignment.dueAt}
                            onSaved={() => router.refresh()}
                          />
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 shrink-0 p-0 text-slate-400 hover:text-destructive"
                        onClick={handleDeleteClassAssignment}
                        disabled={isDeletingClass}
                        title="이 반에서 삭제"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <AssignmentContentSection
                      type={activeAssignment.type}
                      config={activeDetail.config}
                      items={workbookItems}
                      isOpen={isContentOpen}
                      onToggle={() => setIsContentOpen((prev) => !prev)}
                    />
                    <div className="flex flex-wrap gap-2">
                      {activeDetail.studentTasks.length === 0 ? (
                        <p className="text-xs text-slate-500">학생 데이터가 없습니다.</p>
                      ) : (
                        activeDetail.studentTasks.map((task) => {
                          const isSelected = focusStudentTaskId === task.id
                          const statusVariant = STATUS_BADGE_VARIANT[task.status] ?? 'outline'
                          return (
                            <Button
                              key={task.id}
                              size="sm"
                              variant={isSelected ? 'default' : 'outline'}
                              onClick={() => handleFocusStudentTask(task.id)}
                              className={`gap-1.5 ${
                                !isSelected && statusVariant === 'destructive'
                                  ? 'border-destructive/50 text-destructive hover:bg-destructive/10'
                                  : !isSelected && statusVariant === 'secondary'
                                    ? 'border-emerald-300 text-emerald-700 hover:bg-emerald-50'
                                    : ''
                              }`}
                            >
                              {task.student.name}
                              <Badge
                                variant={isSelected ? 'outline' : statusVariant}
                                className={`text-[10px] px-1.5 py-0 ${isSelected ? 'bg-white/20 border-white/40 text-white' : ''}`}
                              >
                                {STATUS_LABELS[task.status] ?? task.status}
                              </Badge>
                            </Button>
                          )
                        })
                      )}
                    </div>
                  </CardContent>
                </Card>

                <AssignmentEvaluationPanel
                  teacherName={teacherName}
                  assignment={activeDetail}
                  generatedAt={generatedAt}
                  focusStudentTaskId={focusStudentTaskId}
                  classContext={{ id: classId, name: className }}
                  onFocusStudentTask={handleFocusStudentTask}
                  variant="embedded"
                />
              </>
            ) : (
              <Card className="border-slate-200">
                <CardContent className="py-16 text-center text-sm text-slate-500">
                  확인할 과제를 선택하세요.
                </CardContent>
              </Card>
            )}
          </div>
      )}

      <Card id="print-requests" className="border-slate-200">
        <CardHeader
          className="flex cursor-pointer flex-col gap-2 transition-colors hover:bg-slate-50 md:flex-row md:items-center md:justify-between"
          onClick={() => setIsPrintRequestsOpen((prev) => !prev)}
        >
          <div className="flex items-center gap-2">
            <ChevronDown
              className={`h-4 w-4 text-slate-500 transition-transform ${isPrintRequestsOpen ? 'rotate-180' : ''}`}
            />
            <CardTitle className="text-base text-slate-900">인쇄 요청 현황</CardTitle>
            {printRequestRows.length > 0 && (
              <Badge variant="secondary" className="text-xs">
                {printRequestRows.length}건
              </Badge>
            )}
          </div>
          <p className="text-xs text-slate-500">대기 중인 요청은 관리자에게 인쇄를 의뢰해주세요.</p>
        </CardHeader>
        {isPrintRequestsOpen && (
          <CardContent className="space-y-2 text-sm text-slate-600">
            {printRequestRows.length === 0 ? (
              <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-center text-xs text-slate-500">
                현재 등록된 인쇄 요청이 없습니다.
              </div>
            ) : (
              <div className="space-y-2">
                {printRequestRows.map(({ assignment, request }) => {
                  const desiredLabel = request.desiredDate
                    ? DateUtil.formatForDisplay(request.desiredDate, { month: 'short', day: 'numeric' })
                    : '희망일 미정'
                  return (
                    <div
                      key={request.id}
                      className="flex flex-col gap-1 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 md:flex-row md:items-center md:justify-between"
                    >
                      <div className="flex flex-col gap-1">
                        <span className="font-medium text-slate-900">
                          {assignment.title} — {desiredLabel}
                          {request.desiredPeriod ? ` · ${request.desiredPeriod}` : ''}
                        </span>
                        <span className="text-[11px] text-slate-500">
                          {request.copies}부 · {request.colorMode === 'color' ? '컬러' : '흑백'}
                          {request.notes ? ` · 메모 ${request.notes}` : ''}
                        </span>
                      </div>
                      <Badge variant={request.status === 'requested' ? 'destructive' : 'secondary'}>
                        {request.status === 'requested' ? '대기' : request.status === 'done' ? '완료' : '취소'}
                      </Badge>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {summary.upcomingAssignments > 0 && (
        <Card className="border-slate-200 bg-slate-50">
          <CardContent className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <AlertCircle className="h-3 w-3" /> 마감 임박 과제 {summary.upcomingAssignments}건이 있습니다. 우선적으로 점검해주세요.
          </CardContent>
        </Card>
      )}
    </section>
  )
}

function toLocalDatetimeValue(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function AssignmentDateEditor({
  assignmentId,
  publishedAt,
  dueAt,
  onSaved,
}: {
  assignmentId: string
  publishedAt: string | null
  dueAt: string | null
  onSaved: () => void
}) {
  const [open, setOpen] = useState(false)
  const [pubValue, setPubValue] = useState(() => toLocalDatetimeValue(publishedAt))
  const [dueValue, setDueValue] = useState(() => toLocalDatetimeValue(dueAt))
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setPubValue(toLocalDatetimeValue(publishedAt))
      setDueValue(toLocalDatetimeValue(dueAt))
      setError(null)
    }
  }, [open, publishedAt, dueAt])

  const handleSave = () => {
    setError(null)
    startTransition(async () => {
      const result = await updateAssignmentDates({
        assignmentId,
        publishedAt: pubValue ? new Date(pubValue).toISOString() : null,
        dueAt: dueValue ? new Date(dueValue).toISOString() : null,
      })
      if (result.error) {
        setError(result.error)
        return
      }
      setOpen(false)
      onSaved()
    })
  }

  const pubLabel = publishedAt
    ? DateUtil.formatForDisplay(publishedAt, { month: 'short', day: 'numeric' })
    : '-'
  const dueLabel = dueAt
    ? DateUtil.formatForDisplay(dueAt, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '없음'

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="group flex items-center gap-2 rounded-md px-2 py-1 text-xs text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
        >
          <span>출제 {pubLabel}</span>
          <span className="text-slate-300">|</span>
          <span>마감 {dueLabel}</span>
          <Pencil className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-3">
        <p className="text-sm font-medium text-slate-900">날짜 수정</p>
        <div className="space-y-2">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-600">출제일</span>
            <input
              type="datetime-local"
              value={pubValue}
              onChange={(e) => setPubValue(e.target.value)}
              className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-sm text-slate-700 outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-600">마감일</span>
            <input
              type="datetime-local"
              value={dueValue}
              onChange={(e) => setDueValue(e.target.value)}
              className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-sm text-slate-700 outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </label>
        </div>
        {error && (
          <p className="text-xs text-destructive">{error}</p>
        )}
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={isPending}>
            취소
          </Button>
          <Button size="sm" onClick={handleSave} disabled={isPending}>
            {isPending ? '저장 중...' : '저장'}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

interface WorkbookConfigShape {
  srs?: { allowMultipleCorrect?: boolean }
  pdf?: { instructions?: string }
  writing?: { instructions?: string; maxCharacters?: number }
  film?: { noteCount?: number; filters?: Record<string, string | null | undefined> }
  lecture?: { youtubeUrl?: string; instructions?: string }
  image?: { instructions?: string }
  essay?: { topic?: string }
}

function AssignmentContentSection({
  type,
  config,
  items,
  isOpen,
  onToggle,
}: {
  type: string
  config: Record<string, unknown> | null
  items: WorkbookItemSummary[]
  isOpen: boolean
  onToggle: () => void
}) {
  const typed = (config ?? {}) as WorkbookConfigShape
  const guideline = renderConfigGuideline(type, typed)
  const hasItems = items.length > 0
  const hasContent = Boolean(guideline) || hasItems

  return (
    <div className="rounded-md border border-slate-200">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
      >
        <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        과제 내용
        {hasItems && (
          <Badge variant="secondary" className="text-[10px]">
            문항 {items.length}개
          </Badge>
        )}
      </button>
      {isOpen && (
        <div className="space-y-3 border-t border-slate-100 px-3 py-3 text-xs text-slate-600">
          {!hasContent ? (
            <p className="text-slate-500">표시할 과제 내용이 없습니다.</p>
          ) : (
            <>
              {guideline}
              {hasItems && (
                <div className="space-y-2">
                  <p className="text-[11px] font-medium text-slate-500">문항 목록</p>
                  {items.map((item) => (
                    <div key={item.id} className="rounded-md border border-slate-200 bg-white p-3">
                      <p className="text-[11px] font-semibold text-slate-900">문항 {item.position}</p>
                      <p className="mt-1 whitespace-pre-line text-slate-700">{item.prompt}</p>
                      {item.choices.length > 0 && (
                        <ul className="mt-2 space-y-1">
                          {item.choices.map((choice) => (
                            <li
                              key={choice.id}
                              className={`flex items-center gap-2 ${choice.isCorrect ? 'text-emerald-700' : 'text-slate-600'}`}
                            >
                              {choice.isCorrect ? (
                                <Badge variant="outline" className="border-emerald-500 text-[10px] text-emerald-600">
                                  정답
                                </Badge>
                              ) : (
                                <span className="inline-block size-1.5 rounded-full bg-slate-300" />
                              )}
                              <span>
                                {choice.label ? `${choice.label}. ` : ''}
                                {choice.content}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                      {item.shortFields.length > 0 && (
                        <ul className="mt-2 space-y-1">
                          {item.shortFields
                            .slice()
                            .sort((a, b) => a.position - b.position)
                            .map((field) => (
                              <li key={field.id} className="rounded border border-slate-200 bg-slate-50 px-2 py-1">
                                {field.label && <span className="font-medium text-slate-500">{field.label}: </span>}
                                <span className="text-slate-700">{field.answer}</span>
                              </li>
                            ))}
                        </ul>
                      )}
                      {item.explanation && (
                        <p className="mt-2 whitespace-pre-line text-[11px] text-slate-500">해설: {item.explanation}</p>
                      )}
                      {item.media.length > 0 && (
                        <div className="mt-2 space-y-2">
                          <p className="text-[11px] font-medium text-slate-500">첨부 파일</p>
                          <div className="flex flex-col gap-3">
                            {item.media.map((media) => {
                              if (media.mimeType?.startsWith('image/')) {
                                return (
                                  <a
                                    key={media.id}
                                    href={media.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-block w-fit"
                                  >
                                    <Image
                                      src={media.url}
                                      alt={media.filename || '첨부 이미지'}
                                      width={320}
                                      height={240}
                                      unoptimized
                                      className="max-h-48 w-auto rounded-md border border-slate-200 object-contain"
                                    />
                                  </a>
                                )
                              }

                              if (media.mimeType === 'application/pdf') {
                                return (
                                  <div key={media.id} className="space-y-1.5">
                                    <iframe
                                      src={`${media.url}#pagemode=none`}
                                      title={media.filename || '첨부 PDF'}
                                      className="h-96 w-full rounded-md border border-slate-200 bg-white"
                                    />
                                    <a
                                      href={media.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="inline-flex w-fit items-center gap-1.5 text-primary"
                                    >
                                      <FileText className="h-3.5 w-3.5 shrink-0" />
                                      <span className="underline">{media.filename || '새 탭에서 열기'}</span>
                                    </a>
                                  </div>
                                )
                              }

                              return (
                                <a
                                  key={media.id}
                                  href={media.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex w-fit items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-primary transition-colors hover:bg-slate-100"
                                >
                                  <FileText className="h-3.5 w-3.5 shrink-0" />
                                  <span className="underline">{media.filename || '첨부파일 열기'}</span>
                                </a>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function renderConfigGuideline(type: string, config: WorkbookConfigShape) {
  switch (type) {
    case 'pdf':
      return config.pdf?.instructions ? (
        <div>
          <p className="font-medium text-slate-700">PDF 제출 안내</p>
          <p className="mt-0.5 whitespace-pre-line text-slate-600">{config.pdf.instructions}</p>
        </div>
      ) : null
    case 'writing':
      return config.writing?.instructions || config.writing?.maxCharacters ? (
        <div className="space-y-0.5">
          {config.writing?.instructions && (
            <p className="whitespace-pre-line">
              <span className="font-medium text-slate-700">작성 안내:</span> {config.writing.instructions}
            </p>
          )}
          {config.writing?.maxCharacters ? (
            <p>
              <span className="font-medium text-slate-700">글자 수 제한:</span>{' '}
              {config.writing.maxCharacters.toLocaleString()}자
            </p>
          ) : null}
        </div>
      ) : null
    case 'image':
      return config.image?.instructions ? (
        <div>
          <p className="font-medium text-slate-700">이미지 제출 안내</p>
          <p className="mt-0.5 whitespace-pre-line text-slate-600">{config.image.instructions}</p>
        </div>
      ) : null
    case 'lecture':
      return config.lecture?.youtubeUrl || config.lecture?.instructions ? (
        <div className="space-y-0.5">
          {config.lecture?.youtubeUrl && (
            <p>
              <span className="font-medium text-slate-700">강의 링크:</span>{' '}
              <a
                href={config.lecture.youtubeUrl}
                target="_blank"
                rel="noreferrer"
                className="text-primary underline"
              >
                {config.lecture.youtubeUrl}
              </a>
            </p>
          )}
          {config.lecture?.instructions && (
            <p className="whitespace-pre-line">
              <span className="font-medium text-slate-700">요약 안내:</span> {config.lecture.instructions}
            </p>
          )}
        </div>
      ) : null
    case 'essay':
      return config.essay?.topic ? (
        <div>
          <p className="font-medium text-slate-700">에세이 주제</p>
          <p className="mt-0.5 whitespace-pre-line text-slate-600">{config.essay.topic}</p>
        </div>
      ) : null
    case 'film': {
      const filters = Object.entries(config.film?.filters ?? {}).filter(([, value]) => Boolean(value))
      return (
        <div className="space-y-1">
          <p>
            <span className="font-medium text-slate-700">필수 감상 노트 수:</span> {config.film?.noteCount ?? '-'}개
          </p>
          {filters.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {filters.map(([key, value]) => (
                <span key={key} className="rounded bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">
                  {key}: {String(value)}
                </span>
              ))}
            </div>
          )}
        </div>
      )
    }
    case 'srs':
      return (
        <div>
          <p>
            <span className="font-medium text-slate-700">복수 정답 허용:</span>{' '}
            {config.srs?.allowMultipleCorrect ? '예' : '아니오'}
          </p>
        </div>
      )
    default:
      return null
  }
}

