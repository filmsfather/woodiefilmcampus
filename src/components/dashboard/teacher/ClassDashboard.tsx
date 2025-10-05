'use client'

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import {
  AlertCircle,
  Calendar,
  CalendarClock,
  CheckCircle2,
  CircleDot,
  Printer,
  Users,
} from 'lucide-react'

import { AssignmentEvaluationPanel } from '@/components/dashboard/teacher/AssignmentEvaluationPanel'
import { deleteAssignmentTarget } from '@/app/dashboard/teacher/actions'
import { useRouter } from 'next/navigation'
import DateUtil from '@/lib/date-util'
import type { AssignmentDetail } from '@/lib/assignment-evaluation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const TYPE_LABELS: Record<string, string> = {
  srs: 'SRS 반복',
  pdf: 'PDF 제출',
  writing: '서술형',
  film: '영화 감상',
  lecture: '인터넷 강의',
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
  dueAt: string | null
  totalStudents: number
  completedStudents: number
  outstandingStudents: number
  completionRate: number
  hasPendingPrint: boolean
  detail: AssignmentDetail
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
  teacherName: string | null
  assignments: ClassAssignmentSummary[]
  summary: ClassSummary
  initialAssignmentId?: string | null
}

export function ClassDashboard({
  classId,
  className,
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
  const router = useRouter()

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
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">{className} 반 과제 점검</h1>
            <p className="text-sm text-slate-600">반의 과제 진행 상황을 확인하고 필요한 학생을 빠르게 평가하세요.</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-slate-600">
            <Badge variant="outline">미평가 {summary.incompleteStudents}명</Badge>
            <Badge variant={summary.overdueAssignments > 0 ? 'destructive' : 'outline'}>
              지연 {summary.overdueAssignments}건
            </Badge>
            <Badge variant={summary.pendingPrintRequests > 0 ? 'secondary' : 'outline'}>
              인쇄 대기 {summary.pendingPrintRequests}건
            </Badge>
            {summary.nextDueAtLabel && <Badge variant="outline">다음 마감 {summary.nextDueAtLabel}</Badge>}
          </div>
        </div>
      </header>

      <Card id="print-requests" className="border-slate-200">
        <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <CardTitle className="text-base text-slate-900">인쇄 요청 현황</CardTitle>
          <p className="text-xs text-slate-500">대기 중인 요청은 관리자에게 인쇄를 의뢰해주세요.</p>
        </CardHeader>
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
      </Card>

      {!hasAssignments ? (
        <Card className="border-dashed border-slate-200">
          <CardContent className="py-16 text-center text-sm text-slate-500">
            아직 이 반에 배정된 과제가 없습니다.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(240px,320px)_1fr]">
          <Card className="h-fit border-slate-200">
            <CardHeader>
              <CardTitle className="text-base text-slate-900">과제 목록</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {assignments.map((assignment) => {
                const dueLabel = assignment.dueAt
                  ? DateUtil.formatForDisplay(assignment.dueAt, {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : '마감 없음'

                const isActive = assignment.id === activeAssignmentId
                const outstandingLabel = assignment.outstandingStudents > 0 ? `${assignment.outstandingStudents}명 미평가` : '모두 완료'

                return (
                  <button
                    key={assignment.id}
                    type="button"
                    onClick={() => setActiveAssignmentId(assignment.id)}
                    className={`w-full rounded-md border px-3 py-3 text-left transition ${
                      isActive ? 'border-primary bg-primary/10' : 'border-slate-200 bg-white hover:border-primary/40'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-slate-900">{assignment.title}</p>
                        <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                          <Badge variant="outline">{assignment.subject}</Badge>
                          <Badge variant="secondary">{TYPE_LABELS[assignment.type] ?? assignment.type.toUpperCase()}</Badge>
                          {assignment.weekLabel && <Badge variant="outline">{assignment.weekLabel}</Badge>}
                        </div>
                      </div>
                      {assignment.hasPendingPrint && (
                        <Badge variant="destructive" className="inline-flex items-center gap-1">
                          <Printer className="h-3 w-3" /> 인쇄 대기
                        </Badge>
                      )}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <Calendar className="h-3 w-3" /> {dueLabel}
                      <Users className="h-3 w-3" /> {assignment.completedStudents}/{assignment.totalStudents}명 완료
                      <Badge variant="outline" className="ml-auto">
                        {assignment.completionRate}%
                      </Badge>
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-500">
                      <CircleDot className="h-3 w-3" /> {outstandingLabel}
                    </div>
                  </button>
                )
              })}
            </CardContent>
          </Card>

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
                  <CardHeader className="space-y-3">
                    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                      <div className="space-y-1">
                        <CardTitle className="text-lg text-slate-900">{activeAssignment.title}</CardTitle>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          <Badge variant="outline">{activeAssignment.subject}</Badge>
                          <Badge variant="secondary">{TYPE_LABELS[activeAssignment.type] ?? activeAssignment.type.toUpperCase()}</Badge>
                          {activeAssignment.weekLabel && <Badge variant="outline">{activeAssignment.weekLabel}</Badge>}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={handleDeleteClassAssignment}
                        disabled={isDeletingClass}
                      >
                        이 반에서 삭제
                      </Button>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1">
                        <CalendarClock className="h-3 w-3" />
                        {activeAssignment.dueAt
                          ? DateUtil.formatForDisplay(activeAssignment.dueAt, {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : '마감 없음'}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" /> 완료 {activeAssignment.completedStudents}/{activeAssignment.totalStudents}명
                      </span>
                      <Badge variant="outline">미평가 {activeAssignment.outstandingStudents}명</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-2 sm:grid-cols-3">
                      <SummaryTile
                        label="마감일"
                        value={
                          activeAssignment.dueAt
                            ? DateUtil.formatForDisplay(activeAssignment.dueAt, {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : '마감 없음'
                        }
                      />
                      <SummaryTile label="완료율" value={`${activeAssignment.completionRate}%`} />
                      <SummaryTile label="미평가" value={`${activeAssignment.outstandingStudents}명`} />
                    </div>

                    <div>
                      <p className="text-sm font-semibold text-slate-700">상태 요약</p>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                        {statusSummary &&
                          Object.entries(statusSummary)
                            .filter(([, count]) => count > 0)
                            .map(([status, count]) => (
                              <Badge key={status} variant={STATUS_BADGE_VARIANT[status] ?? 'outline'}>
                                {STATUS_LABELS[status] ?? status} {count}명
                              </Badge>
                            ))}
                        {statusSummary && Object.values(statusSummary).every((count) => count === 0) && (
                          <span className="text-xs text-slate-500">학생 데이터가 없습니다.</span>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-slate-700">미평가 학생</p>
                      </div>
                      {pendingTasks.length === 0 ? (
                        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-4 text-xs text-slate-500">
                          모든 학생 평가가 완료되었습니다.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {pendingTasks.slice(0, 5).map((task) => (
                            <div
                              key={task.id}
                              className="flex flex-col gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 md:flex-row md:items-center md:justify-between"
                            >
                              <div className="space-y-1">
                                <p className="font-medium text-slate-900">{task.student.name}</p>
                                <p className="text-[11px] text-slate-500">
                                  {task.className} · {task.completedCount}/{task.totalItems}문항 완료
                                  {task.student.email ? ` · ${task.student.email}` : ''}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge variant={STATUS_BADGE_VARIANT[task.status] ?? 'outline'}>
                                  {STATUS_LABELS[task.status] ?? task.status}
                                </Badge>
                                <Button size="sm" variant="ghost" onClick={() => handleFocusStudentTask(task.id)}>
                                  평가
                                </Button>
                              </div>
                            </div>
                          ))}
                          {pendingTasks.length > 5 && (
                            <p className="text-[11px] text-slate-500">나머지 {pendingTasks.length - 5}명은 아래 평가 패널에서 계속 확인할 수 있습니다.</p>
                          )}
                        </div>
                      )}
                    </div>

                    <p className="text-xs text-slate-500">
                      하단의 평가 패널에서 학생별 제출물 검토, Pass/Non-pass 저장, 인쇄 요청을 바로 처리할 수 있습니다.
                    </p>
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
        </div>
      )}

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

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-sm font-semibold text-slate-900">{value}</p>
    </div>
  )
}
