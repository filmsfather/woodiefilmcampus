'use client'

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Download,
  Printer,
  RefreshCw,
  RotateCcw,
  XCircle,
} from 'lucide-react'

import DateUtil from '@/lib/date-util'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import {
  evaluateSubmission,
  toggleStudentTaskStatus,
  createPrintRequest,
  deleteStudentTask,
  cancelPrintRequest,
} from '@/app/dashboard/teacher/actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import {
  FILM_NOTE_FIELDS,
  FILM_NOTE_TEXT_AREAS,
  coerceFilmEntry,
  createEmptyFilmEntry,
  hasFilmEntryValue,
  isFilmEntryComplete,
  sanitizeFilmEntry,
  type FilmNoteEntry,
} from '@/lib/film-notes'

interface WorkbookItemSummary {
  id: string
  position: number
  prompt: string
  answerType: string
  explanation: string | null
  shortFields: Array<{ id: string; label: string | null; answer: string; position: number }>
  choices: Array<{ id: string; label: string | null; content: string; isCorrect: boolean }>
}

interface StudentTaskItemSummary {
  id: string
  itemId: string | null
  streak: number | null
  nextReviewAt: string | null
  completedAt: string | null
  lastResult: string | null
  workbookItem: WorkbookItemSummary | null
}

interface SubmissionSummary {
  id: string
  itemId: string | null
  submissionType: string
  content: string | null
  mediaAssetId: string | null
  score: string | null
  feedback: string | null
  createdAt: string
  updatedAt: string
  asset: { url: string; filename: string; mimeType: string | null } | null
}

interface StudentTaskSummary {
  id: string
  status: string
  completionAt: string | null
  updatedAt: string
  studentId: string
  student: {
    id: string
    name: string
    email: string | null
    classId: string | null
  }
  items: StudentTaskItemSummary[]
  submissions: SubmissionSummary[]
}

interface PrintRequestSummary {
  id: string
  status: string
  bundleMode: 'merged' | 'separate'
  bundleStatus: string
  compiledAssetId: string | null
  bundleReadyAt: string | null
  bundleError: string | null
  studentTaskId: string | null
  studentTaskIds: string[]
  desiredDate: string | null
  desiredPeriod: string | null
  copies: number
  colorMode: string
  notes: string | null
  createdAt: string
  updatedAt: string | null
  items: Array<{
    id: string
    studentTaskId: string
    submissionId: string | null
    mediaAssetId: string | null
    assetFilename: string | null
    assetMetadata: Record<string, unknown> | null
  }>
}

export interface AssignmentEvaluationPanelProps {
  teacherName: string | null
  assignment: {
    id: string
    dueAt: string | null
    createdAt: string
    targetScope: string | null
    title: string
    subject: string
    type: string
    weekLabel: string | null
    config: Record<string, unknown> | null
    classes: Array<{ id: string; name: string }>
    studentTasks: StudentTaskSummary[]
    printRequests: PrintRequestSummary[]
  }
  generatedAt: string
  focusStudentTaskId: string | null
  classContext: { id: string; name: string } | null
  showBackButton?: boolean
  backHref?: string | null
  onBack?: () => void
  onFocusStudentTask?: (studentTaskId: string | null) => void
  variant?: 'full' | 'embedded'
}

const TYPE_LABELS: Record<string, string> = {
  srs: 'SRS 반복',
  pdf: 'PDF 제출',
  writing: '서술형',
  film: '영화 감상',
  lecture: '인터넷 강의',
}

const STATUS_BADGE_VARIANT: Record<string, 'outline' | 'secondary' | 'default' | 'destructive'> = {
  pending: 'outline',
  not_started: 'outline',
  in_progress: 'default',
  completed: 'secondary',
  canceled: 'destructive',
}

const PRINT_BUNDLE_STATUS_LABELS: Record<string, string> = {
  pending: '대기',
  processing: '준비 중',
  ready: '준비 완료',
  failed: '실패',
}

const PRINT_BUNDLE_STATUS_BADGE: Record<string, 'outline' | 'secondary' | 'default' | 'destructive'> = {
  pending: 'outline',
  processing: 'outline',
  ready: 'secondary',
  failed: 'destructive',
}

const PRINT_PERIOD_OPTIONS = ['1교시', '2교시', '3교시', '4교시'] as const

const STATUS_LABELS: Record<string, string> = {
  pending: '대기',
  not_started: '미시작',
  in_progress: '진행 중',
  completed: '완료',
  canceled: '취소',
}

export function AssignmentEvaluationPanel({
  teacherName,
  assignment,
  generatedAt,
  focusStudentTaskId,
  classContext,
  showBackButton = false,
  backHref = null,
  onBack,
  onFocusStudentTask,
  variant = 'full',
}: AssignmentEvaluationPanelProps) {
  const router = useRouter()
  const classLookup = useMemo(() => new Map(assignment.classes.map((cls) => [cls.id, cls.name])), [assignment.classes])
  const studentLookup = useMemo(() => new Map(
    assignment.studentTasks.map((task) => [
      task.id,
      {
        name: task.student.name,
        className: task.student.classId
          ? classLookup.get(task.student.classId) ?? '반 정보 없음'
          : assignment.classes[0]?.name ?? '반 정보 없음',
      },
    ])
  ), [assignment.studentTasks, classLookup, assignment.classes])

  const pendingTasks = useMemo(
    () =>
      assignment.studentTasks
        .filter((task) => task.status !== 'completed' && task.status !== 'canceled')
        .sort((a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt)),
    [assignment.studentTasks]
  )

  const nextPendingTaskId = useMemo(() => {
    if (pendingTasks.length === 0) {
      return null
    }

    if (!focusStudentTaskId) {
      return pendingTasks[0].id
    }

    const currentIndex = pendingTasks.findIndex((task) => task.id === focusStudentTaskId)
    if (currentIndex === -1) {
      return pendingTasks[0].id
    }

    if (currentIndex + 1 < pendingTasks.length) {
      return pendingTasks[currentIndex + 1].id
    }

    return pendingTasks.length > 1 ? pendingTasks[0].id : null
  }, [focusStudentTaskId, pendingTasks])

  const handleNextPending = useCallback(() => {
    if (!nextPendingTaskId) {
      return
    }
    onFocusStudentTask?.(nextPendingTaskId)
  }, [nextPendingTaskId, onFocusStudentTask])

  const resolvedBackHref = backHref ?? (classContext ? `/dashboard/teacher/review/${classContext.id}` : '/dashboard/teacher')
  const backLabel = classContext ? `${classContext.name} 반으로 돌아가기` : '대시보드로 돌아가기'

  const totalStudents = assignment.studentTasks.length
  const completedStudents = assignment.studentTasks.filter((task) => task.status === 'completed').length
  const canceledStudents = assignment.studentTasks.filter((task) => task.status === 'canceled').length
  const completionRate = totalStudents === 0 ? 0 : Math.round((completedStudents / totalStudents) * 100)

  const isEmbedded = variant === 'embedded'

  const [deleteAlert, setDeleteAlert] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [deletePendingId, setDeletePendingId] = useState<string | null>(null)
  const [isDeleting, startDeleteTransition] = useTransition()

  useEffect(() => {
    if (!focusStudentTaskId) {
      return
    }
    const exists = assignment.studentTasks.some((task) => task.id === focusStudentTaskId)
    if (!exists) {
      onFocusStudentTask?.(nextPendingTaskId)
    }
  }, [assignment.studentTasks, focusStudentTaskId, onFocusStudentTask, nextPendingTaskId])

  const handleDeleteStudentTask = useCallback(
    (studentTaskId: string, studentName: string) => {
      if (!window.confirm(`${studentName} 학생의 과제를 삭제할까요?`)) {
        return
      }
      setDeleteAlert(null)
      setDeletePendingId(studentTaskId)
      startDeleteTransition(async () => {
        const result = await deleteStudentTask({ assignmentId: assignment.id, studentTaskId })
        if (result?.error) {
          setDeleteAlert({ type: 'error', text: `삭제 실패: ${JSON.stringify(result)}` })
        } else {
          setDeleteAlert({ type: 'success', text: `${studentName} 학생 과제를 삭제했습니다.` })
          if (focusStudentTaskId === studentTaskId) {
            onFocusStudentTask?.(null)
          }
          router.refresh()
        }
        setDeletePendingId(null)
      })
    },
    [assignment.id, focusStudentTaskId, onFocusStudentTask, router]
  )

  const deleteState = useMemo(
    () => ({ pendingId: deletePendingId, isPending: isDeleting }),
    [deletePendingId, isDeleting]
  )

  const deleteAlertElement = deleteAlert ? (
    <div
      className={`rounded-md border px-3 py-2 text-xs ${
        deleteAlert.type === 'error'
          ? 'border-destructive/40 bg-destructive/10 text-destructive'
          : 'border-emerald-300 bg-emerald-50 text-emerald-700'
      }`}
    >
      {deleteAlert.text}
    </div>
  ) : null

  const evaluationSections = (
    <>
      {deleteAlertElement}
      {assignment.printRequests.length > 0 && (
        <PrintRequestList requests={assignment.printRequests} studentLookup={studentLookup} />
      )}

      {assignment.type === 'pdf' && (
        <PdfReviewPanel
          key={assignment.id}
          assignment={assignment}
          classLookup={classLookup}
          focusStudentTaskId={focusStudentTaskId}
          onDeleteStudentTask={handleDeleteStudentTask}
          deleteState={deleteState}
        />
      )}

      {assignment.type === 'writing' && (
        <WritingReviewPanel
          assignment={assignment}
          classLookup={classLookup}
          focusStudentTaskId={focusStudentTaskId}
          onDeleteStudentTask={handleDeleteStudentTask}
          deleteState={deleteState}
        />
      )}

      {assignment.type === 'film' && (
        <FilmReviewPanel
          assignment={assignment}
          classLookup={classLookup}
          focusStudentTaskId={focusStudentTaskId}
          onDeleteStudentTask={handleDeleteStudentTask}
          deleteState={deleteState}
        />
      )}

      {assignment.type === 'srs' && (
        <SrsReviewPanel
          assignment={assignment}
          classLookup={classLookup}
          focusStudentTaskId={focusStudentTaskId}
          onDeleteStudentTask={handleDeleteStudentTask}
          deleteState={deleteState}
        />
      )}

      {assignment.type === 'lecture' && (
        <LectureReviewPanel
          assignment={assignment}
          classLookup={classLookup}
          onDeleteStudentTask={handleDeleteStudentTask}
          deleteState={deleteState}
        />
      )}
    </>
  )

  if (isEmbedded) {
    return <div className="space-y-4">{evaluationSections}</div>
  }

  return (
    <section className="space-y-6">
      <header>
        {showBackButton && (
          onBack ? (
            <Button variant="ghost" className="mb-2 text-xs text-slate-500" onClick={onBack}>
              <ArrowLeft className="mr-1 h-3 w-3" /> {backLabel}
            </Button>
          ) : (
            <Button asChild variant="ghost" className="mb-2 text-xs text-slate-500">
              <Link href={resolvedBackHref}>
                <ArrowLeft className="mr-1 h-3 w-3" /> {backLabel}
              </Link>
            </Button>
          )
        )}
        <Card className="border-slate-200">
          <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <CardTitle className="text-xl text-slate-900">{assignment.title}</CardTitle>
              <p className="text-xs text-slate-500">{teacherName ?? '선생님'} 님, 학생 제출을 검토하고 평가하세요.</p>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <Badge variant="outline">{assignment.subject}</Badge>
                <Badge variant="secondary">{TYPE_LABELS[assignment.type] ?? assignment.type.toUpperCase()}</Badge>
                {assignment.weekLabel && <Badge variant="outline">{assignment.weekLabel}</Badge>}
                {assignment.classes.length > 0 && (
                  <span>배정 반: {assignment.classes.map((cls) => cls.name).join(', ')}</span>
                )}
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="flex flex-wrap gap-3 text-xs text-slate-500">
                <div className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {assignment.dueAt
                    ? DateUtil.formatForDisplay(assignment.dueAt, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : '마감 없음'}
                </div>
                <div className="flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" /> 완료 {completedStudents}/{totalStudents}명
                </div>
                {canceledStudents > 0 && (
                  <div className="flex items-center gap-1 text-destructive">
                    <XCircle className="h-3 w-3" /> 취소 {canceledStudents}명
                  </div>
                )}
                <div className="flex items-center gap-1">
                  <Printer className="h-3 w-3" /> 인쇄 요청 {assignment.printRequests.length}건
                </div>
                <div className="flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" /> 미평가 {pendingTasks.length}명
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={handleNextPending} disabled={!nextPendingTaskId}>
                다음 미평가 학생 이동 <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            <SummaryTile label="완료율" value={`${completionRate}%`} />
            <SummaryTile label="학생 수" value={`${totalStudents}명`} />
            <SummaryTile
              label="생성 시간"
              value={DateUtil.formatForDisplay(generatedAt, {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            />
          </CardContent>
        </Card>
      </header>
      {evaluationSections}
    </section>
  )
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-lg font-semibold text-slate-900">{value}</p>
    </div>
  )
}

function PrintRequestList({
  requests,
  studentLookup,
}: {
  requests: PrintRequestSummary[]
  studentLookup: Map<string, { name: string; className: string }>
}) {
  const activeRequests = useMemo(
    () => requests.filter((request) => request.status !== 'canceled'),
    [requests]
  )

  const [cancelMessage, setCancelMessage] = useState<string | null>(null)
  const [cancelPendingId, setCancelPendingId] = useState<string | null>(null)
  const [isCancelPending, startCancelTransition] = useTransition()

  const handleCancel = useCallback((requestId: string) => {
    setCancelMessage(null)
    setCancelPendingId(requestId)
    startCancelTransition(async () => {
      const result = await cancelPrintRequest({ requestId })
      if (result?.error) {
        setCancelMessage(result.error)
      } else {
        setCancelMessage('인쇄 요청을 취소했습니다.')
      }
      setCancelPendingId(null)
    })
  }, [])

  if (activeRequests.length === 0) {
    return null
  }

  return (
    <Card className="border-primary/50 bg-primary/5">
      <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <CardTitle className="text-sm text-slate-900">인쇄 요청 현황</CardTitle>
        <span className="text-xs text-slate-500">총 {activeRequests.length}건</span>
      </CardHeader>
      <CardContent className="space-y-2 text-sm text-slate-600">
        {cancelMessage && (
          <div className={`rounded-md border px-3 py-2 text-xs ${
            cancelMessage.includes('실패') || cancelMessage.includes('없') || cancelMessage.includes('오류')
              ? 'border-destructive/40 bg-destructive/10 text-destructive'
              : 'border-emerald-300 bg-emerald-50 text-emerald-700'
          }`}
          >
            {cancelMessage}
          </div>
        )}
        {activeRequests.map((request) => {
          const targetTaskIds = request.studentTaskIds.length > 0
            ? request.studentTaskIds
            : request.studentTaskId
              ? [request.studentTaskId]
              : []
          const targetLabels = targetTaskIds.map((taskId) => {
            const info = studentLookup.get(taskId)
            if (!info) {
              return '학생 정보 없음'
            }
            return `${info.name} (${info.className})`
          })

          const targetSummary = (() => {
            if (targetLabels.length === 0) {
              return '전체 학생'
            }
            if (targetLabels.length <= 2) {
              return targetLabels.join(', ')
            }
            return `${targetLabels.slice(0, 2).join(', ')} 외 ${targetLabels.length - 2}명`
          })()

          const bundleStatusLabel = PRINT_BUNDLE_STATUS_LABELS[request.bundleStatus] ?? request.bundleStatus
          const bundleBadgeVariant = PRINT_BUNDLE_STATUS_BADGE[request.bundleStatus] ?? 'outline'

          return (
            <div
              key={request.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-3 py-2"
            >
              <div className="space-y-1">
                <p className="font-medium text-slate-900">
                  {request.desiredDate
                    ? DateUtil.formatForDisplay(request.desiredDate, { month: 'short', day: 'numeric' })
                    : '희망일 미정'}
                  {request.desiredPeriod ? ` · ${request.desiredPeriod}` : ''}
                </p>
                <p className="text-xs text-slate-500">
                  {request.copies}부 · {request.colorMode === 'color' ? '컬러' : '흑백'} · {targetSummary}
                  {request.items.length > 0 ? ` · 제출 ${request.items.length}건` : ''}
                  {request.notes ? ` · ${request.notes}` : ''}
                </p>
                <p className="text-[11px] text-slate-500">
                  상태 {bundleStatusLabel}
                  {request.bundleError ? ` · 오류 ${request.bundleError}` : ''}
                </p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <div className="flex items-center gap-2">
                  <Badge variant={request.status === 'requested' ? 'destructive' : 'secondary'}>
                    {request.status === 'requested' ? '대기' : request.status === 'done' ? '완료' : '취소'}
                  </Badge>
                  <Badge variant={bundleBadgeVariant}>{bundleStatusLabel}</Badge>
                </div>
                {request.status === 'requested' && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={isCancelPending && cancelPendingId === request.id}
                    onClick={() => handleCancel(request.id)}
                  >
                    {isCancelPending && cancelPendingId === request.id ? (
                      <span className="flex items-center justify-center gap-2">
                        <LoadingSpinner />
                        취소 중...
                      </span>
                    ) : (
                      '취소'
                    )}
                  </Button>
                )}
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

interface ReviewPanelProps {
  assignment: AssignmentEvaluationPanelProps['assignment']
  classLookup: Map<string | null, string>
  focusStudentTaskId: string | null
  onDeleteStudentTask: (studentTaskId: string, studentName: string) => void
  deleteState: { pendingId: string | null; isPending: boolean }
}

function SrsReviewPanel({
  assignment,
  classLookup,
  focusStudentTaskId,
  onDeleteStudentTask,
  deleteState,
}: ReviewPanelProps) {
  const [pendingTaskId, setPendingTaskId] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const handleToggle = (studentTaskId: string, cancel: boolean) => {
    setPendingTaskId(studentTaskId)
    setErrorMessage(null)
    startTransition(async () => {
      const result = await toggleStudentTaskStatus({
        assignmentId: assignment.id,
        studentTaskId,
        cancel,
      })
      if (result?.error) {
        setErrorMessage(result.error)
      }
      setPendingTaskId(null)
    })
  }

  return (
    <Card className="border-slate-200">
      <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <CardTitle className="text-lg text-slate-900">SRS 진행 현황</CardTitle>
        <p className="text-xs text-slate-500">streak 3회 달성 시 자동 완료됩니다. 필요 시 과제를 취소하거나 재시작할 수 있습니다.</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {errorMessage && (
          <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <AlertCircle className="h-3 w-3" /> {errorMessage}
          </div>
        )}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>학생</TableHead>
              <TableHead>반</TableHead>
              <TableHead>상태</TableHead>
              <TableHead>최근 결과</TableHead>
              <TableHead>다음 복습</TableHead>
              <TableHead className="text-right">관리</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {assignment.studentTasks.map((task) => {
              const item = task.items[0]
              const className = task.student.classId
                ? classLookup.get(task.student.classId) ?? '반 정보 없음'
                : assignment.classes[0]?.name ?? '반 정보 없음'
              const isFocused = task.id === focusStudentTaskId

              return (
                <TableRow key={task.id} className={isFocused ? 'bg-primary/5' : undefined}>
                  <TableCell className="max-w-[180px] truncate" title={task.student.name}>
                    <div className="font-medium text-slate-900">{task.student.name}</div>
                    {task.student.email && <div className="text-xs text-slate-500">{task.student.email}</div>}
                  </TableCell>
                  <TableCell>{className}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_BADGE_VARIANT[task.status] ?? 'outline'}>
                      {STATUS_LABELS[task.status] ?? task.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {item?.lastResult ? (
                      <Badge variant={item.lastResult === 'pass' ? 'secondary' : 'destructive'}>
                        {item.lastResult === 'pass' ? 'Pass' : 'Fail'}
                      </Badge>
                    ) : (
                      <span className="text-xs text-slate-400">기록 없음</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {item?.nextReviewAt
                      ? DateUtil.formatForDisplay(item.nextReviewAt, {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : '복습 없음'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      {task.status === 'canceled' ? (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isPending && pendingTaskId === task.id}
                          onClick={() => handleToggle(task.id, false)}
                        >
                          <RefreshCw className="mr-1 h-3 w-3" /> 재시작
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={isPending && pendingTaskId === task.id}
                          onClick={() => handleToggle(task.id, true)}
                        >
                          <RotateCcw className="mr-1 h-3 w-3" /> 취소
                        </Button>
                      )}
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={deleteState.isPending && deleteState.pendingId === task.id}
                        onClick={() => onDeleteStudentTask(task.id, task.student.name)}
                      >
                        삭제
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

function PdfReviewPanel({ assignment, classLookup, focusStudentTaskId, onDeleteStudentTask, deleteState }: ReviewPanelProps) {
  const printableStudents = useMemo(
    () =>
      assignment.studentTasks.map((task) => ({
        task,
        hasSubmission: task.submissions.some((submission) => Boolean(submission.mediaAssetId)),
      })),
    [assignment.studentTasks]
  )
  const selectableStudents = useMemo(
    () => printableStudents.filter((item) => item.hasSubmission),
    [printableStudents]
  )
  const missingStudents = useMemo(
    () => printableStudents.filter((item) => !item.hasSubmission),
    [printableStudents]
  )
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>(() => selectableStudents.map((item) => item.task.id))
  const [hasCustomSelection, setHasCustomSelection] = useState(false)
  const [printState, setPrintState] = useState(() => ({
    desiredDate: '',
    desiredPeriod: '',
    copies: 1,
    colorMode: 'bw' as 'bw' | 'color',
    notes: '',
  }))
  const [printMessage, setPrintMessage] = useState<string | null>(null)
  const [isRequestPending, startPrintTransition] = useTransition()

  const handleToggleStudent = useCallback((taskId: string, checked: boolean) => {
    setSelectedTaskIds((prev) => {
      if (checked) {
        if (prev.includes(taskId)) {
          return prev
        }
        return [...prev, taskId]
      }
      return prev.filter((id) => id !== taskId)
    })
    setHasCustomSelection(true)
  }, [])

  const handleSelectAll = useCallback(() => {
    const allIds = assignment.studentTasks
      .filter((task) => task.submissions.some((submission) => submission.mediaAssetId))
      .map((task) => task.id)
    setSelectedTaskIds(allIds)
    setHasCustomSelection(false)
  }, [assignment.studentTasks])

  const handleClearSelection = useCallback(() => {
    setSelectedTaskIds([])
    setHasCustomSelection(true)
  }, [])

  useEffect(() => {
    if (hasCustomSelection) {
      return
    }
    const autoSelectedIds = assignment.studentTasks
      .filter((task) => task.submissions.some((submission) => submission.mediaAssetId))
      .map((task) => task.id)
    setSelectedTaskIds((prev) => {
      const isSame = prev.length === autoSelectedIds.length && prev.every((id) => autoSelectedIds.includes(id))
      return isSame ? prev : autoSelectedIds
    })
  }, [assignment.studentTasks, hasCustomSelection])

  const handlePrintSubmit = () => {
    setPrintMessage(null)
    if (selectedTaskIds.length === 0) {
      setPrintMessage('인쇄할 학생을 선택해주세요.')
      return
    }
    if (!printState.desiredDate) {
      setPrintMessage('희망일을 입력해주세요.')
      return
    }
    startPrintTransition(async () => {
      const result = await createPrintRequest({
        assignmentId: assignment.id,
        studentTaskIds: selectedTaskIds,
        desiredDate: printState.desiredDate,
        desiredPeriod: printState.desiredPeriod,
        copies: printState.copies,
        colorMode: printState.colorMode,
        notes: printState.notes,
      })

      if ('error' in result) {
        setPrintMessage(result.error)
      } else {
        const skippedText = result.skippedStudents?.length
          ? ` (${result.skippedStudents.join(', ')} 제출본 제외)`
          : ''
        setPrintMessage(`인쇄 요청을 등록했습니다.${skippedText}`)
        setPrintState((prev) => ({ ...prev, notes: '' }))
        if (result.skippedStudents?.length) {
          setHasCustomSelection(true)
        }
      }
    })
  }

  return (
    <Card className="border-slate-200">
      <CardHeader className="space-y-2">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <CardTitle className="text-lg text-slate-900">PDF 제출 평가</CardTitle>
          <p className="text-xs text-slate-500">제출 파일을 확인한 뒤 Pass / Non-pass 상태를 저장하세요. 인쇄 요청도 이곳에서 생성할 수 있습니다.</p>
        </div>
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
          <div className="grid gap-2 md:grid-cols-[repeat(5,minmax(0,1fr))]">
            <Input
              type="date"
              value={printState.desiredDate}
              onChange={(event) => setPrintState((prev) => ({ ...prev, desiredDate: event.target.value }))}
              required
            />
            <Select
              value={printState.desiredPeriod || undefined}
              onValueChange={(value) => setPrintState((prev) => ({ ...prev, desiredPeriod: value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="교시 선택" />
              </SelectTrigger>
              <SelectContent>
                {PRINT_PERIOD_OPTIONS.map((period) => (
                  <SelectItem key={period} value={period}>
                    {period}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="number"
              min={1}
              max={50}
              value={printState.copies}
              placeholder="부수입력"
              onChange={(event) => setPrintState((prev) => ({ ...prev, copies: Number(event.target.value || 1) }))}
            />
            <Select
              value={printState.colorMode}
              onValueChange={(value) => setPrintState((prev) => ({ ...prev, colorMode: value as 'bw' | 'color' }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="인쇄 모드" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bw">흑백</SelectItem>
                <SelectItem value="color">컬러</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="mt-3 space-y-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-slate-500">
                선택 {selectedTaskIds.length}명 / PDF 제출 {selectableStudents.length}명
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 px-3 text-xs"
                  disabled={selectableStudents.length === 0}
                  onClick={handleSelectAll}
                >
                  전체 선택
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 px-3 text-xs"
                  disabled={selectedTaskIds.length === 0}
                  onClick={handleClearSelection}
                >
                  선택 해제
                </Button>
              </div>
            </div>
            <div className="max-h-44 space-y-1 overflow-y-auto rounded-md border border-slate-200 bg-white p-2">
              {selectableStudents.length === 0 ? (
                <p className="text-xs text-slate-500">PDF 제출이 있는 학생이 없습니다.</p>
              ) : (
                selectableStudents.map(({ task }) => (
                  <label key={task.id} className="flex items-center gap-3 text-xs text-slate-600">
                    <Checkbox
                      checked={selectedTaskIds.includes(task.id)}
                      onChange={(event) => handleToggleStudent(task.id, event.target.checked)}
                    />
                    <span className="flex-1 truncate">{task.student.name}</span>
                  </label>
                ))
              )}
            </div>
            {missingStudents.length > 0 && (
              <p className="text-[11px] text-slate-500">
                제출본 미확인 학생: {missingStudents.map((item) => item.task.student.name ?? '이름 미정').join(', ')}
              </p>
            )}
          </div>
          <div className="mt-2 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <Textarea
              placeholder="요청 메모 (선택)"
              value={printState.notes}
              onChange={(event) => setPrintState((prev) => ({ ...prev, notes: event.target.value }))}
            />
            <div className="flex items-center gap-2 md:self-end">
              {printMessage && (
                <span className={`text-xs ${printMessage.includes('오류') ? 'text-destructive' : 'text-emerald-600'}`}>
                  {printMessage}
                </span>
              )}
              <Button disabled={isRequestPending} onClick={handlePrintSubmit}>
                {isRequestPending ? (
                  <span className="flex items-center justify-center gap-2">
                    <LoadingSpinner />
                    요청 중...
                  </span>
                ) : (
                  '인쇄 요청'
                )}
              </Button>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>학생</TableHead>
              <TableHead>반</TableHead>
              <TableHead>제출</TableHead>
              <TableHead>평가</TableHead>
              <TableHead>상태</TableHead>
              <TableHead className="text-right">관리</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {assignment.studentTasks.map((task) => (
          <PdfEvaluationRow
            key={task.id}
            assignmentId={assignment.id}
            task={task}
            className={task.student.classId ? classLookup.get(task.student.classId) ?? '반 정보 없음' : assignment.classes[0]?.name ?? '반 정보 없음'}
              isFocused={task.id === focusStudentTaskId}
            onDeleteStudentTask={onDeleteStudentTask}
            deleteState={deleteState}
          />
        ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

function PdfEvaluationRow({
  assignmentId,
  task,
  className,
  isFocused,
  onDeleteStudentTask,
  deleteState,
}: {
  assignmentId: string
  task: StudentTaskSummary
  className: string
  isFocused: boolean
  onDeleteStudentTask: (studentTaskId: string, studentName: string) => void
  deleteState: { pendingId: string | null; isPending: boolean }
}) {
  const submission = task.submissions.find((sub) => sub.mediaAssetId) ?? null
  const taskItem = submission && submission.itemId
    ? task.items.find((item) => item.itemId === submission.itemId) ?? task.items[0] ?? null
    : task.items[0] ?? null
  const initialScore = submission?.score ?? ''
  const [score, setScore] = useState<string>(initialScore)
  const [message, setMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const handleSave = () => {
    if (!submission || !taskItem) {
      setMessage('학생 제출물을 찾을 수 없습니다.')
      return
    }

    const normalizedScore = score === 'pass' || score === 'nonpass' ? score : 'nonpass'
    setMessage(null)
    startTransition(async () => {
      const result = await evaluateSubmission({
        assignmentId,
        studentTaskId: task.id,
        studentTaskItemId: taskItem.id,
        submissionId: submission.id,
        score: normalizedScore,
        feedback: undefined,
      })

      if (result?.error) {
        setMessage(result.error)
      } else {
        setMessage('평가 결과가 저장되었습니다.')
      }
    })
  }

  return (
    <TableRow className={isFocused ? 'bg-primary/5' : undefined}>
      <TableCell className="max-w-[200px] truncate" title={task.student.name}>
        <div className="font-medium text-slate-900">{task.student.name}</div>
        {task.student.email && <div className="text-xs text-slate-500">{task.student.email}</div>}
      </TableCell>
      <TableCell>{className}</TableCell>
      <TableCell>
        {submission ? (
          submission.asset ? (
            <Button asChild variant="outline" size="sm">
              <a href={submission.asset.url} target="_blank" rel="noreferrer">
                <Download className="mr-1 h-3 w-3" /> {submission.asset.filename}
              </a>
            </Button>
          ) : (
            <Badge variant="secondary">제출됨</Badge>
          )
        ) : (
          <Badge variant="outline">미제출</Badge>
        )}
      </TableCell>
      <TableCell>
        <Select value={score} onValueChange={setScore}>
          <SelectTrigger className="w-28">
            <SelectValue placeholder="평가" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pass">Pass</SelectItem>
            <SelectItem value="nonpass">Non-pass</SelectItem>
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Badge variant={STATUS_BADGE_VARIANT[task.status] ?? 'outline'}>
          {STATUS_LABELS[task.status] ?? task.status}
        </Badge>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex flex-col items-end gap-2">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button size="sm" disabled={!submission || isPending || !score} onClick={handleSave}>
              {isPending ? (
                <span className="flex items-center justify-center gap-2">
                  <LoadingSpinner />
                  저장 중...
                </span>
              ) : (
                '저장'
              )}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={deleteState.isPending && deleteState.pendingId === task.id}
              onClick={() => onDeleteStudentTask(task.id, task.student.name)}
            >
              {deleteState.isPending && deleteState.pendingId === task.id ? (
                <span className="flex items-center justify-center gap-2">
                  <LoadingSpinner />
                  삭제 중...
                </span>
              ) : (
                '삭제'
              )}
            </Button>
          </div>
          {message && (
            <p className={`text-xs ${message.includes('오류') ? 'text-destructive' : 'text-emerald-600'}`}>
              {message}
            </p>
          )}
        </div>
      </TableCell>
    </TableRow>
  )
}

function WritingReviewPanel({ assignment, classLookup, focusStudentTaskId, onDeleteStudentTask, deleteState }: ReviewPanelProps) {
  return (
    <Card className="border-slate-200">
      <CardHeader className="space-y-1">
        <CardTitle className="text-lg text-slate-900">서술형 평가</CardTitle>
        <p className="text-xs text-slate-500">답안을 확인한 뒤 Pass / Non-pass와 피드백을 저장하세요.</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {assignment.studentTasks.map((task) => (
          <WritingEvaluationCard
            key={task.id}
            assignmentId={assignment.id}
            task={task}
            className={task.student.classId ? classLookup.get(task.student.classId) ?? '반 정보 없음' : assignment.classes[0]?.name ?? '반 정보 없음'}
            isFocused={task.id === focusStudentTaskId}
            onDeleteStudentTask={onDeleteStudentTask}
            deleteState={deleteState}
          />
        ))}
      </CardContent>
    </Card>
  )
}

function WritingEvaluationCard({
  assignmentId,
  task,
  className,
  isFocused,
  onDeleteStudentTask,
  deleteState,
}: {
  assignmentId: string
  task: StudentTaskSummary
  className: string
  isFocused: boolean
  onDeleteStudentTask: (studentTaskId: string, studentName: string) => void
  deleteState: { pendingId: string | null; isPending: boolean }
}) {
  const submission = task.submissions[0] ?? null
  const taskItem = submission && submission.itemId
    ? task.items.find((item) => item.itemId === submission.itemId) ?? task.items[0] ?? null
    : task.items[0] ?? null
  const [score, setScore] = useState<string>(submission?.score ?? '')
  const [feedback, setFeedback] = useState<string>(submission?.feedback ?? '')
  const [message, setMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const handleSave = () => {
    if (!submission || !taskItem) {
      setMessage('학생 답안을 찾을 수 없습니다.')
      return
    }

    const normalizedScore = score === 'pass' || score === 'nonpass' ? score : 'nonpass'
    startTransition(async () => {
      const result = await evaluateSubmission({
        assignmentId,
        studentTaskId: task.id,
        studentTaskItemId: taskItem.id,
        submissionId: submission.id,
        score: normalizedScore,
        feedback,
      })

      if (result?.error) {
        setMessage(result.error)
      } else {
        setMessage('평가 결과가 저장되었습니다.')
      }
    })
  }

  return (
    <Card className={isFocused ? 'border-primary/40 bg-primary/5' : 'border-slate-200'}>
      <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-base font-semibold text-slate-900">{task.student.name}</p>
          <p className="text-xs text-slate-500">{className}</p>
        </div>
        <div className="flex flex-col items-end gap-2 md:flex-row md:items-center">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Badge variant={STATUS_BADGE_VARIANT[task.status] ?? 'outline'}>
              {STATUS_LABELS[task.status] ?? task.status}
            </Badge>
            {submission?.updatedAt && (
              <span>
                최근 평가 {DateUtil.formatForDisplay(submission.updatedAt, { month: 'short', day: 'numeric' })}
              </span>
            )}
          </div>
          <Button
            size="sm"
            variant="destructive"
            disabled={deleteState.isPending && deleteState.pendingId === task.id}
            onClick={() => onDeleteStudentTask(task.id, task.student.name)}
          >
            {deleteState.isPending && deleteState.pendingId === task.id ? (
              <span className="flex items-center justify-center gap-2">
                <LoadingSpinner />
                삭제 중...
              </span>
            ) : (
              '삭제'
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-slate-700">
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
          {submission?.content ? (
            <p className="whitespace-pre-line leading-relaxed">{submission.content}</p>
          ) : (
            <p className="text-xs text-slate-400">제출된 답안이 없습니다.</p>
          )}
        </div>
        <div className="grid gap-3 md:grid-cols-[minmax(0,160px)_1fr_minmax(0,120px)]">
          <Select value={score} onValueChange={setScore}>
            <SelectTrigger>
              <SelectValue placeholder="평가" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pass">Pass</SelectItem>
              <SelectItem value="nonpass">Non-pass</SelectItem>
            </SelectContent>
          </Select>
          <Textarea
            placeholder="피드백 (선택)"
            value={feedback}
            onChange={(event) => setFeedback(event.target.value)}
            rows={3}
          />
          <div className="flex flex-col items-end gap-2">
            <Button size="sm" disabled={isPending || !submission} onClick={handleSave} className="w-full">
              {isPending ? (
                <span className="flex items-center justify-center gap-2">
                  <LoadingSpinner />
                  저장 중...
                </span>
              ) : (
                '저장'
              )}
            </Button>
            {message && (
              <p className={`text-xs ${message.includes('오류') ? 'text-destructive' : 'text-emerald-600'}`}>
                {message}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function FilmReviewPanel({ assignment, classLookup, focusStudentTaskId, onDeleteStudentTask, deleteState }: ReviewPanelProps) {
  return (
    <Card className="border-slate-200">
      <CardHeader className="space-y-1">
        <CardTitle className="text-lg text-slate-900">영화 감상 평가</CardTitle>
        <p className="text-xs text-slate-500">감상지를 확인하고 Pass / Non-pass를 저장하세요.</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {assignment.studentTasks.map((task) => (
          <FilmEvaluationCard
            key={task.id}
            assignmentId={assignment.id}
            task={task}
            className={task.student.classId ? classLookup.get(task.student.classId) ?? '반 정보 없음' : assignment.classes[0]?.name ?? '반 정보 없음'}
            isFocused={task.id === focusStudentTaskId}
            onDeleteStudentTask={onDeleteStudentTask}
            deleteState={deleteState}
          />
        ))}
      </CardContent>
    </Card>
  )
}

function FilmEvaluationCard({
  assignmentId,
  task,
  className,
  isFocused,
  onDeleteStudentTask,
  deleteState,
}: {
  assignmentId: string
  task: StudentTaskSummary
  className: string
  isFocused: boolean
  onDeleteStudentTask: (studentTaskId: string, studentName: string) => void
  deleteState: { pendingId: string | null; isPending: boolean }
}) {
  const submission = task.submissions[0] ?? null
  const taskItem = task.items[0] ?? null
  const filmSubmission = useMemo(() => parseFilmSubmission(submission?.content), [submission?.content])
  const [score, setScore] = useState<string>(submission?.score ?? '')
  const [message, setMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [isDetailOpen, setIsDetailOpen] = useState(false)

  const titlePreview = useMemo(() => {
    if (!filmSubmission) {
      return null
    }
    const titles = filmSubmission.entries
      .filter((entry) => entry.hasValue && entry.content.title.trim().length > 0)
      .map((entry) => entry.content.title)

    if (titles.length === 0) {
      return '제목 정보 없음'
    }
    if (titles.length === 1) {
      return titles[0]
    }
    return `${titles[0]} 외 ${titles.length - 1}편`
  }, [filmSubmission])

  const handleSave = () => {
    if (!submission || !taskItem) {
      setMessage('감상지를 찾을 수 없습니다.')
      return
    }

    const normalizedScore = score === 'pass' || score === 'nonpass' ? score : 'nonpass'
    startTransition(async () => {
      const result = await evaluateSubmission({
        assignmentId,
        studentTaskId: task.id,
        studentTaskItemId: taskItem.id,
        submissionId: submission.id,
        score: normalizedScore,
        feedback: undefined,
      })

      if (result?.error) {
        setMessage(result.error)
      } else {
        setMessage('평가 결과가 저장되었습니다.')
      }
    })
  }

  return (
    <Card className={isFocused ? 'border-primary/40 bg-primary/5' : 'border-slate-200'}>
      <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-base font-semibold text-slate-900">{task.student.name}</p>
          <p className="text-xs text-slate-500">{className}</p>
        </div>
        <div className="flex flex-col items-end gap-2 md:flex-row md:items-center">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Badge variant={STATUS_BADGE_VARIANT[task.status] ?? 'outline'}>
              {STATUS_LABELS[task.status] ?? task.status}
            </Badge>
            {submission?.updatedAt && (
              <span>
                최근 평가 {DateUtil.formatForDisplay(submission.updatedAt, { month: 'short', day: 'numeric' })}
              </span>
            )}
          </div>
          <Button
            size="sm"
            variant="destructive"
            disabled={deleteState.isPending && deleteState.pendingId === task.id}
            onClick={() => onDeleteStudentTask(task.id, task.student.name)}
          >
            {deleteState.isPending && deleteState.pendingId === task.id ? (
              <span className="flex items-center justify-center gap-2">
                <LoadingSpinner />
                삭제 중...
              </span>
            ) : (
              '삭제'
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 text-sm text-slate-700">
        {filmSubmission ? (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <Badge variant="outline">필요 {filmSubmission.noteCount}개</Badge>
              <Badge variant={filmSubmission.completedCount === filmSubmission.noteCount ? 'secondary' : 'outline'}>
                완료 {filmSubmission.completedCount}/{filmSubmission.noteCount}
              </Badge>
              {filmSubmission.valueCount > 0 && (
                <Badge variant="outline">작성 {filmSubmission.valueCount}개</Badge>
              )}
              {submission?.updatedAt && (
                <span>
                  최근 저장 {DateUtil.formatForDisplay(submission.updatedAt, { month: 'short', day: 'numeric' })}
                </span>
              )}
            </div>
            {filmSubmission.valueCount > 0 && titlePreview && (
              <p className="text-sm text-slate-600">주요 제목: {titlePreview}</p>
            )}
          </div>
        ) : (
          <p className="text-xs text-slate-400">제출된 감상지가 없습니다.</p>
        )}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <Select value={score} onValueChange={setScore}>
            <SelectTrigger className="w-28">
              <SelectValue placeholder="평가" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pass">Pass</SelectItem>
              <SelectItem value="nonpass">Non-pass</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" disabled={isPending || !submission} onClick={handleSave}>
              {isPending ? (
                <span className="flex items-center justify-center gap-2">
                  <LoadingSpinner />
                  저장 중...
                </span>
              ) : (
                '저장'
              )}
            </Button>
            {filmSubmission && (
              <Sheet open={isDetailOpen} onOpenChange={setIsDetailOpen}>
                <SheetTrigger asChild>
                  <Button size="sm" variant="outline">
                    감상지 상세 보기
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="sm:max-w-xl">
                  <SheetHeader>
                    <SheetTitle>{task.student.name} 감상지</SheetTitle>
                    <SheetDescription>
                      필요 {filmSubmission.noteCount}개 · 완료 {filmSubmission.completedCount}개
                    </SheetDescription>
                  </SheetHeader>
                  <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-6">
                    {filmSubmission.entries.map((entry) => (
                      <div key={entry.noteIndex} className="space-y-3 rounded-lg border border-slate-200 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-slate-900">감상지 {entry.noteIndex + 1}</p>
                          <Badge
                            variant={entry.isComplete ? 'secondary' : entry.hasValue ? 'outline' : 'outline'}
                            className={entry.hasValue ? undefined : 'text-slate-400'}
                          >
                            {entry.isComplete ? '완료' : entry.hasValue ? '작성 중' : '미작성'}
                          </Badge>
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                          {FILM_NOTE_FIELDS.map((field) => (
                            <FilmField key={field.key} label={field.label} value={entry.content[field.key]} />
                          ))}
                        </div>
                        <div className="space-y-4">
                          {FILM_NOTE_TEXT_AREAS.map((field) => (
                            <FilmField key={field.key} label={field.label} value={entry.content[field.key]} full />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </SheetContent>
              </Sheet>
            )}
          </div>
        </div>
        {message && (
          <p className={`text-xs ${message.includes('오류') ? 'text-destructive' : 'text-emerald-600'}`}>{message}</p>
        )}
      </CardContent>
    </Card>
  )
}

function FilmField({ label, value, full }: { label: string; value: string; full?: boolean }) {
  const displayValue = value?.trim().length ? value : '미입력'

  return (
    <div className={full ? 'md:col-span-2' : undefined}>
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="whitespace-pre-line leading-relaxed text-slate-700">{displayValue}</p>
    </div>
  )
}

interface ParsedFilmSubmissionEntry {
  noteIndex: number
  content: FilmNoteEntry
  hasValue: boolean
  isComplete: boolean
}

interface ParsedFilmSubmission {
  entries: ParsedFilmSubmissionEntry[]
  noteCount: number
  completedCount: number
  valueCount: number
}

function parseFilmSubmission(content: string | null | undefined): ParsedFilmSubmission | null {
  if (!content) {
    return null
  }

  try {
    const parsed = JSON.parse(content) as unknown

    let noteCount = 1
    let rawEntries: unknown[] = []

    if (Array.isArray(parsed)) {
      rawEntries = parsed
      noteCount = parsed.length > 0 ? parsed.length : 1
    } else if (parsed && typeof parsed === 'object') {
      const maybeEntries = (parsed as { entries?: unknown }).entries
      const maybeNoteCount = Number((parsed as { noteCount?: unknown }).noteCount)

      if (Array.isArray(maybeEntries)) {
        rawEntries = maybeEntries
        if (Number.isFinite(maybeNoteCount) && maybeNoteCount > 0) {
          noteCount = maybeNoteCount
        } else {
          noteCount = maybeEntries.length > 0 ? maybeEntries.length : 1
        }
      } else {
        rawEntries = [parsed]
        noteCount = 1
      }
    } else {
      return null
    }

    noteCount = Math.max(1, noteCount)

    const entries: ParsedFilmSubmissionEntry[] = Array.from({ length: noteCount }, (_, index) => {
      const source = rawEntries[index] ?? null
      const content = source ? sanitizeFilmEntry(coerceFilmEntry(source)) : createEmptyFilmEntry()
      const hasValue = hasFilmEntryValue(content)
      const isComplete = isFilmEntryComplete(content)
      return {
        noteIndex: index,
        content,
        hasValue,
        isComplete,
      }
    })

    const completedCount = entries.filter((entry) => entry.isComplete).length
    const valueCount = entries.filter((entry) => entry.hasValue).length

    return {
      entries,
      noteCount,
      completedCount,
      valueCount,
    }
  } catch (error) {
    console.error('[teacher] film submission parse error', error)
    return null
  }
}

function LectureReviewPanel({
  assignment,
  classLookup,
  onDeleteStudentTask,
  deleteState,
}: {
  assignment: AssignmentEvaluationPanelProps['assignment']
  classLookup: Map<string | null, string>
  onDeleteStudentTask: (studentTaskId: string, studentName: string) => void
  deleteState: { pendingId: string | null; isPending: boolean }
}) {
  return (
    <Card className="border-slate-200">
      <CardHeader>
        <CardTitle className="text-lg text-slate-900">인터넷 강의 제출 현황</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>학생</TableHead>
              <TableHead>반</TableHead>
              <TableHead>제출 요약</TableHead>
              <TableHead>상태</TableHead>
              <TableHead className="text-right">관리</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {assignment.studentTasks.map((task) => {
              const submission = task.submissions[0] ?? null
              const className = task.student.classId
                ? classLookup.get(task.student.classId) ?? '반 정보 없음'
                : assignment.classes[0]?.name ?? '반 정보 없음'

              return (
                <TableRow key={task.id}>
                  <TableCell className="max-w-[200px] truncate" title={task.student.name}>
                    <div className="font-medium text-slate-900">{task.student.name}</div>
                    {task.student.email && <div className="text-xs text-slate-500">{task.student.email}</div>}
                  </TableCell>
                  <TableCell>{className}</TableCell>
                  <TableCell>
                    {submission?.content ? (
                      <p className="max-w-[320px] truncate text-sm text-slate-600" title={submission.content}>
                        {submission.content}
                      </p>
                    ) : (
                      <Badge variant="outline">미제출</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_BADGE_VARIANT[task.status] ?? 'outline'}>
                      {STATUS_LABELS[task.status] ?? task.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={deleteState.isPending && deleteState.pendingId === task.id}
                      onClick={() => onDeleteStudentTask(task.id, task.student.name)}
                    >
                      삭제
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
