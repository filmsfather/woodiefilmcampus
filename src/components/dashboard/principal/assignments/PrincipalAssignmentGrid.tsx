'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, BookOpen, CheckCircle2, Clock, AlertCircle, FileText } from 'lucide-react'
import Link from 'next/link'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { ClassTemplateMaterialDialog } from '@/components/dashboard/teacher/learning-journal/ClassTemplateMaterialDialog'
import { QuickAssignmentDialog } from '@/components/dashboard/principal/assignments/QuickAssignmentDialog'
import { upsertClassTemplateWeekAction } from '@/app/dashboard/teacher/learning-journal/actions'
import type { ClassAssignmentCell, PrincipalAssignmentData } from '@/app/dashboard/principal/assignments/page'

interface PrincipalAssignmentGridProps {
  data: PrincipalAssignmentData
}

interface MaterialDialogState {
  open: boolean
  cell: ClassAssignmentCell | null
}

interface AssignmentDialogState {
  open: boolean
  classId: string
  className: string
}

function formatWeekRange(startDate: string, endDate: string) {
  return `${startDate.slice(5)} ~ ${endDate.slice(5)}`
}

const STATUS_CONFIG = {
  completed: {
    icon: CheckCircle2,
    className: 'text-emerald-600 bg-emerald-50',
    label: '완료',
  },
  in_progress: {
    icon: Clock,
    className: 'text-amber-600 bg-amber-50',
    label: '진행중',
  },
  overdue: {
    icon: AlertCircle,
    className: 'text-red-600 bg-red-50',
    label: '마감초과',
  },
  upcoming: {
    icon: Clock,
    className: 'text-slate-600 bg-slate-50',
    label: '예정',
  },
} as const

export function PrincipalAssignmentGrid({ data }: PrincipalAssignmentGridProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [selectedCell, setSelectedCell] = useState<ClassAssignmentCell | null>(null)
  const [materialDialog, setMaterialDialog] = useState<MaterialDialogState>({
    open: false,
    cell: null,
  })
  const [assignmentDialog, setAssignmentDialog] = useState<AssignmentDialogState>({
    open: false,
    classId: '',
    className: '',
  })

  const getCellsForClass = (classId: string) =>
    data.cells.filter((cell) => cell.classId === classId)

  const handleCellClick = (cell: ClassAssignmentCell) => {
    setSelectedCell(cell)
  }

  const handleCloseSheet = () => {
    setSelectedCell(null)
  }

  const handleOpenMaterialDialog = (cell: ClassAssignmentCell) => {
    setMaterialDialog({ open: true, cell })
  }

  const handleCloseMaterialDialog = () => {
    setMaterialDialog({ open: false, cell: null })
  }

  const handleOpenAssignmentDialog = (classId: string, className: string) => {
    setAssignmentDialog({ open: true, classId, className })
  }

  const handleCloseAssignmentDialog = () => {
    setAssignmentDialog({ open: false, classId: '', className: '' })
  }

  const handleMaterialSubmit = (selection: {
    materialIds: string[]
    materialTitles: string[]
    materialNotes: string | null
  }) => {
    const cell = materialDialog.cell
    if (!cell || !cell.integratedTheory.periodId) return

    const formData = new FormData()
    formData.set('classId', cell.classId)
    formData.set('periodId', cell.integratedTheory.periodId)
    formData.set('weekIndex', String(cell.weekIndex))
    formData.set('subject', 'integrated_theory')
    selection.materialIds.forEach((id) => formData.append('materialIds', id))
    selection.materialTitles.forEach((title) => formData.append('materialTitles', title))
    if (selection.materialNotes) {
      formData.set('materialNotes', selection.materialNotes)
    }

    startTransition(async () => {
      const result = await upsertClassTemplateWeekAction(formData)
      if (result?.error) {
        console.error('수업 자료 저장 실패:', result.error)
      } else {
        router.refresh()
      }
    })
  }

  return (
    <>
      <div className="overflow-x-auto">
        <div className="min-w-[800px]">
          {/* 헤더 */}
          <div className="grid grid-cols-[180px_repeat(4,minmax(0,1fr))] gap-1 rounded-t-lg bg-slate-100 p-2">
            <div className="px-3 py-2 text-sm font-semibold text-slate-700">반</div>
            {data.weekRanges.map((week) => (
              <div
                key={week.weekIndex}
                className="px-3 py-2 text-center text-sm font-semibold text-slate-700"
              >
                <div>{week.weekIndex}주차</div>
                <div className="text-xs font-normal text-slate-500">
                  {week.startDate.slice(5)} ~ {week.endDate.slice(5)}
                </div>
              </div>
            ))}
          </div>

          {/* 반별 행 */}
          <div className="divide-y divide-slate-200 rounded-b-lg border border-t-0 border-slate-200 bg-white">
            {data.classes.map((cls) => {
              const classCells = getCellsForClass(cls.id)
              return (
                <div
                  key={cls.id}
                  className="grid grid-cols-[180px_repeat(4,minmax(0,1fr))] gap-1 p-2"
                >
                  <div className="flex items-center px-3 py-2">
                    <span className="font-medium text-slate-900">{cls.name}</span>
                  </div>

                  {data.weekRanges.map((week) => {
                    const cell = classCells.find((c) => c.weekIndex === week.weekIndex)
                    if (!cell) return <div key={week.weekIndex} className="p-2" />

                    // 셀에는 통합이론 과제만 표시 (workbooks.subject는 '통합'으로 저장됨)
                    const integratedTheoryAssignments = cell.assignments.filter(
                      (a) => a.subject === '통합' || a.subject === 'integrated_theory'
                    )
                    const hasIntegratedAssignments = integratedTheoryAssignments.length > 0
                    const hasLesson = cell.integratedTheory.hasMaterials
                    const isEmpty = !hasIntegratedAssignments && !hasLesson

                    return (
                      <button
                        key={week.weekIndex}
                        type="button"
                        onClick={() => handleCellClick(cell)}
                        className="group min-h-[100px] overflow-hidden rounded-lg border border-slate-200 p-3 text-left transition-all hover:border-slate-400 hover:shadow-sm"
                      >
                        {isEmpty ? (
                          <div className="flex h-full flex-col items-center justify-center gap-2 text-slate-400">
                            <Plus className="h-5 w-5 opacity-0 transition-opacity group-hover:opacity-100" />
                            <span className="text-xs">추가하기</span>
                          </div>
                        ) : (
                          <div className="w-full space-y-1.5 overflow-hidden">
                            {/* 통합이론 과제 현황 */}
                            {hasIntegratedAssignments && (
                              <div className="space-y-1">
                                {integratedTheoryAssignments.slice(0, 2).map((assignment) => {
                                  const config = STATUS_CONFIG[assignment.status]
                                  const StatusIcon = config.icon
                                  return (
                                    <div
                                      key={assignment.id}
                                      className={`flex min-w-0 items-center gap-1.5 rounded px-2 py-1 ${config.className}`}
                                    >
                                      <StatusIcon className="h-3 w-3 shrink-0" />
                                      <span className="min-w-0 flex-1 truncate text-xs font-medium">
                                        {assignment.title}
                                      </span>
                                      <span className="shrink-0 text-[10px]">
                                        {assignment.completedCount}/{assignment.totalCount}
                                      </span>
                                    </div>
                                  )
                                })}
                                {integratedTheoryAssignments.length > 2 && (
                                  <p className="text-center text-[10px] text-slate-500">
                                    +{integratedTheoryAssignments.length - 2}건 더보기
                                  </p>
                                )}
                              </div>
                            )}

                            {/* 통합이론 수업 */}
                            {hasLesson && (
                              <div className="flex min-w-0 items-center gap-1.5 rounded bg-indigo-50 px-2 py-1 text-indigo-700">
                                <BookOpen className="h-3 w-3 shrink-0" />
                                <span className="min-w-0 flex-1 truncate text-xs font-medium">
                                  {cell.integratedTheory.materialTitles[0] || '통합이론'}
                                </span>
                              </div>
                            )}

                            {!hasLesson && hasIntegratedAssignments && (
                              <div className="flex items-center gap-1.5 rounded border border-dashed border-slate-300 px-2 py-1 text-slate-400">
                                <BookOpen className="h-3 w-3 shrink-0" />
                                <span className="text-xs">수업 미등록</span>
                              </div>
                            )}
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* 범례 */}
      <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-slate-600">
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded bg-emerald-500" />
          <span>완료</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded bg-amber-500" />
          <span>진행중</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded bg-red-500" />
          <span>마감초과</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded bg-indigo-500" />
          <span>통합이론 수업</span>
        </div>
      </div>

      {/* 상세 패널 (Sheet) */}
      <Sheet open={Boolean(selectedCell)} onOpenChange={handleCloseSheet}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          {selectedCell && (
            <>
              <SheetHeader>
                <SheetTitle>
                  {selectedCell.className} · {selectedCell.weekIndex}주차
                </SheetTitle>
                <SheetDescription>
                  과제 현황과 수업 내용을 확인하고 관리하세요.
                </SheetDescription>
              </SheetHeader>

              <div className="mt-6 space-y-6">
                {/* 과제 현황 */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <FileText className="h-4 w-4" />
                      과제 현황
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {selectedCell.assignments.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
                        <p className="text-sm text-slate-500">출제된 과제가 없습니다.</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {selectedCell.assignments.map((assignment) => {
                          const config = STATUS_CONFIG[assignment.status]
                          const StatusIcon = config.icon
                          const progressPercent =
                            assignment.totalCount > 0
                              ? Math.round(
                                  (assignment.completedCount / assignment.totalCount) * 100
                                )
                              : 0

                          return (
                            <div
                              key={assignment.id}
                              className="rounded-lg border border-slate-200 p-3"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="space-y-1">
                                  <p className="font-medium text-slate-900">
                                    {assignment.title}
                                  </p>
                                  <div className="flex flex-wrap items-center gap-2">
                                    {assignment.subject && (
                                      <Badge variant="outline" className="text-xs">
                                        {assignment.subject}
                                      </Badge>
                                    )}
                                    {assignment.dueAt && (
                                      <span className="text-xs text-slate-500">
                                        마감:{' '}
                                        {new Date(assignment.dueAt).toLocaleDateString('ko-KR', {
                                          month: 'short',
                                          day: 'numeric',
                                        })}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <Badge className={config.className}>
                                  <StatusIcon className="mr-1 h-3 w-3" />
                                  {config.label}
                                </Badge>
                              </div>

                              <div className="mt-3">
                                <div className="flex items-center justify-between text-xs text-slate-600">
                                  <span>제출 현황</span>
                                  <span>
                                    {assignment.completedCount}/{assignment.totalCount}명 (
                                    {progressPercent}%)
                                  </span>
                                </div>
                                <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                                  <div
                                    className="h-full bg-emerald-500 transition-all"
                                    style={{ width: `${progressPercent}%` }}
                                  />
                                </div>
                              </div>

                              <div className="mt-3 flex justify-end">
                                <Button asChild variant="outline" size="sm">
                                  <Link
                                    href={`/dashboard/teacher/assignments/${assignment.id}?classId=${selectedCell.classId}`}
                                  >
                                    상세보기
                                  </Link>
                                </Button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* 통합이론 수업 */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <BookOpen className="h-4 w-4" />
                      통합이론 수업
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {selectedCell.integratedTheory.hasMaterials ? (
                      <div className="space-y-3">
                        <div className="space-y-1">
                          {selectedCell.integratedTheory.materialTitles.map((title, idx) => (
                            <p key={idx} className="text-sm text-slate-700">
                              • {title || '제목 없음'}
                            </p>
                          ))}
                        </div>
                        {selectedCell.integratedTheory.periodId && (
                          <div className="flex justify-end">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenMaterialDialog(selectedCell)}
                              disabled={isPending}
                            >
                              수업 내용 편집
                            </Button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
                        <p className="mb-3 text-sm text-slate-500">
                          아직 수업 내용이 등록되지 않았습니다.
                        </p>
                        {selectedCell.integratedTheory.periodId && (
                          <Button
                            size="sm"
                            onClick={() => handleOpenMaterialDialog(selectedCell)}
                            disabled={isPending}
                          >
                            수업 내용 등록하기
                          </Button>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* 액션 버튼 */}
                <div className="flex gap-2">
                  <Button
                    className="flex-1"
                    onClick={() =>
                      handleOpenAssignmentDialog(
                        selectedCell.classId,
                        selectedCell.className
                      )
                    }
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    과제 출제
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* 수업 자료 선택 다이얼로그 */}
      <ClassTemplateMaterialDialog
        open={materialDialog.open}
        onClose={handleCloseMaterialDialog}
        subject="integrated_theory"
        subjectLabel="통합이론"
        options={data.integratedTheoryMaterials.map((m) => ({
          ...m,
          subject: 'integrated_theory',
        }))}
        selected={
          materialDialog.cell
            ? materialDialog.cell.integratedTheory.materialIds.map((id, idx) => ({
                id,
                title: materialDialog.cell?.integratedTheory.materialTitles[idx] ?? '',
              }))
            : []
        }
        notes={materialDialog.cell?.integratedTheory.materialNotes ?? null}
        onSubmit={handleMaterialSubmit}
      />

      {/* 과제 출제 다이얼로그 */}
      <QuickAssignmentDialog
        open={assignmentDialog.open}
        onClose={handleCloseAssignmentDialog}
        initialClassId={assignmentDialog.classId}
        initialClassName={assignmentDialog.className}
        classes={data.classes}
        workbooks={data.integratedTheoryWorkbooks}
      />
    </>
  )
}

