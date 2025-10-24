'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import DateUtil from '@/lib/date-util'
import {
  ABSENCE_REASON_OPTIONS,
  ABSENCE_REASON_LABEL_MAP,
  type AbsenceReasonType,
  type AbsenceReport,
} from '@/lib/absences'
import type {
  CreateAbsenceInput,
  DeleteAbsenceInput,
  UpdateAbsenceInput,
} from '@/app/dashboard/absences/actions'

interface StudentOption {
  id: string
  name: string | null
  email: string | null
}

export interface ClassWithStudents {
  id: string
  name: string | null
  students: StudentOption[]
}

type ActionResult = {
  success?: true
  error?: string
}

interface AbsenceManagerClientProps {
  role: 'teacher' | 'manager' | 'principal'
  classes: ClassWithStudents[]
  reports: AbsenceReport[]
  onCreate: (input: CreateAbsenceInput) => Promise<ActionResult>
  onUpdate: (input: UpdateAbsenceInput) => Promise<ActionResult>
  onDelete: (input: DeleteAbsenceInput) => Promise<ActionResult>
}

const REASON_DEFAULT = ABSENCE_REASON_OPTIONS[0]?.value ?? 'unexcused'

export function AbsenceManagerClient({
  role,
  classes,
  reports,
  onCreate,
  onUpdate,
  onDelete,
}: AbsenceManagerClientProps) {
  const router = useRouter()
  const isTeacher = role === 'teacher'
  const isAdmin = role === 'manager' || role === 'principal'

  const classMap = useMemo(() => new Map(classes.map((cls) => [cls.id, cls])), [classes])
  const initialClassId = classes[0]?.id ?? ''
  const [selectedClassId, setSelectedClassId] = useState(initialClassId)
  const students = classMap.get(selectedClassId)?.students ?? []
  const initialStudentId = students[0]?.id ?? ''
  const [selectedStudentId, setSelectedStudentId] = useState(initialStudentId)
  const [absenceDate, setAbsenceDate] = useState(() => DateUtil.formatISODate(DateUtil.nowUTC()))
  const [reasonType, setReasonType] = useState<AbsenceReasonType>(REASON_DEFAULT)
  const [detailReason, setDetailReason] = useState('')
  const [teacherAction, setTeacherAction] = useState('')
  const [managerAction, setManagerAction] = useState('')
  const [formMessage, setFormMessage] = useState<ActionResult | null>(null)
  const [isSubmitting, startSubmitTransition] = useTransition()
  const [editingReport, setEditingReport] = useState<AbsenceReport | null>(null)
  const [editMessage, setEditMessage] = useState<ActionResult | null>(null)
  const [isEditing, startEditTransition] = useTransition()
  const [isDeleting, startDeleteTransition] = useTransition()

  useEffect(() => {
    if (!classMap.has(selectedClassId)) {
      setSelectedClassId(initialClassId)
    }
  }, [classMap, initialClassId, selectedClassId])

  useEffect(() => {
    const currentStudents = classMap.get(selectedClassId)?.students ?? []
    if (currentStudents.length === 0) {
      setSelectedStudentId('')
      return
    }
    if (!currentStudents.some((student) => student.id === selectedStudentId)) {
      setSelectedStudentId(currentStudents[0]?.id ?? '')
    }
  }, [classMap, selectedClassId, selectedStudentId])

  useEffect(() => {
    if (!editingReport) {
      return
    }
    setEditMessage(null)
  }, [editingReport])

  const handleSubmit: React.FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault()

    if (!selectedClassId || !selectedStudentId) {
      setFormMessage({ error: '반과 학생을 선택해주세요.' })
      return
    }

    setFormMessage(null)

    const payload: CreateAbsenceInput = {
      classId: selectedClassId,
      studentId: selectedStudentId,
      absenceDate,
      reasonType,
      detailReason,
      teacherAction: isTeacher ? teacherAction : undefined,
      managerAction: isAdmin ? managerAction : undefined,
    }

    startSubmitTransition(async () => {
      const result = await onCreate(payload)

      if (result?.error) {
        setFormMessage({ error: result.error })
        return
      }

      setFormMessage({ success: true })
      setDetailReason('')
      setTeacherAction('')
      setManagerAction('')
      router.refresh()
    })
  }

  const openEdit = (report: AbsenceReport) => {
    setEditingReport(report)
  }

  const closeEdit = () => {
    setEditingReport(null)
  }

  const handleEditSave: React.FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault()

    if (!editingReport) {
      return
    }

    const formData = new FormData(event.currentTarget)
    const nextDetail = formData.get('detailReason')
    const nextTeacherAction = formData.get('teacherAction')
    const nextManagerAction = formData.get('managerAction')

    const payload: UpdateAbsenceInput = {
      id: editingReport.id,
    }

    if (nextDetail !== null) {
      payload.detailReason = String(nextDetail)
    }
    if (isTeacher && nextTeacherAction !== null) {
      payload.teacherAction = String(nextTeacherAction)
    }
    if (isAdmin && nextManagerAction !== null) {
      payload.managerAction = String(nextManagerAction)
    }

    setEditMessage(null)

    startEditTransition(async () => {
      const result = await onUpdate(payload)

      if (result?.error) {
        setEditMessage({ error: result.error })
        return
      }

      setEditMessage({ success: true })
      router.refresh()
      closeEdit()
    })
  }

  const handleDelete = (report: AbsenceReport) => {
    const confirmed = window.confirm('해당 결석계를 삭제하시겠습니까?')
    if (!confirmed) {
      return
    }

    startDeleteTransition(async () => {
      const result = await onDelete({ id: report.id })

      if (result?.error) {
        setFormMessage({ error: result.error })
        return
      }

      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg text-slate-900">결석계 작성</CardTitle>
        </CardHeader>
        <CardContent>
          {classes.length === 0 ? (
            <Alert>
              <AlertDescription>담당 중인 반이 없어 결석계를 작성할 수 없습니다.</AlertDescription>
            </Alert>
          ) : (
            <form className="space-y-4" onSubmit={handleSubmit}>
              {formMessage?.error ? (
                <Alert variant="destructive">
                  <AlertDescription>{formMessage.error}</AlertDescription>
                </Alert>
              ) : null}
              {formMessage?.success ? (
                <Alert>
                  <AlertDescription>결석계가 저장되었습니다.</AlertDescription>
                </Alert>
              ) : null}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="classId">반</Label>
                  <Select value={selectedClassId} onValueChange={setSelectedClassId}>
                    <SelectTrigger id="classId" className="w-full">
                      <SelectValue placeholder="반을 선택하세요" />
                    </SelectTrigger>
                    <SelectContent>
                      {classes.map((cls) => (
                        <SelectItem key={cls.id} value={cls.id}>
                          {cls.name ?? '이름 미정'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="studentId">학생</Label>
                  <Select
                    value={selectedStudentId}
                    onValueChange={setSelectedStudentId}
                    disabled={students.length === 0}
                  >
                    <SelectTrigger id="studentId" className="w-full">
                      <SelectValue placeholder={students.length === 0 ? '학생 없음' : '학생을 선택하세요'} />
                    </SelectTrigger>
                    <SelectContent>
                      {students.map((student) => (
                        <SelectItem key={student.id} value={student.id}>
                          {student.name ?? student.email ?? '이름 미정'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="absenceDate">결석 날짜</Label>
                  <Input
                    id="absenceDate"
                    type="date"
                    value={absenceDate}
                    onChange={(event) => setAbsenceDate(event.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reasonType">결석 사유</Label>
                  <Select value={reasonType} onValueChange={(value) => setReasonType(value as AbsenceReasonType)}>
                    <SelectTrigger id="reasonType" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ABSENCE_REASON_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="detailReason">상세 사유</Label>
                <Textarea
                  id="detailReason"
                  value={detailReason}
                  onChange={(event) => setDetailReason(event.target.value)}
                  placeholder="상세 사유를 입력하세요."
                  rows={3}
                />
              </div>
              {isTeacher ? (
                <div className="space-y-2">
                  <Label htmlFor="teacherAction">교사 조치사항</Label>
                  <Textarea
                    id="teacherAction"
                    value={teacherAction}
                    onChange={(event) => setTeacherAction(event.target.value)}
                    placeholder="교사 조치사항을 입력하세요."
                    rows={3}
                  />
                </div>
              ) : null}
              {isAdmin ? (
                <div className="space-y-2">
                  <Label htmlFor="managerAction">실장 조치사항</Label>
                  <Textarea
                    id="managerAction"
                    value={managerAction}
                    onChange={(event) => setManagerAction(event.target.value)}
                    placeholder="실장 조치사항을 입력하세요."
                    rows={3}
                  />
                </div>
              ) : null}
              <div className="flex justify-end">
                <Button type="submit" disabled={isSubmitting || classes.length === 0 || students.length === 0}>
                  {isSubmitting ? '저장 중...' : '결석계 저장'}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg text-slate-900">이번 주 결석 현황</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {reports.length === 0 ? (
            <p className="text-sm text-slate-500">등록된 결석계가 없습니다.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[110px]">결석 날짜</TableHead>
                    <TableHead className="min-w-[120px]">반</TableHead>
                    <TableHead className="min-w-[140px]">학생</TableHead>
                    <TableHead className="min-w-[90px]">사유</TableHead>
                    <TableHead className="min-w-[200px]">상세 사유</TableHead>
                    <TableHead className="min-w-[200px]">교사 조치사항</TableHead>
                    <TableHead className="min-w-[200px]">실장 조치사항</TableHead>
                    <TableHead className="min-w-[120px]">작성자</TableHead>
                    <TableHead className="min-w-[120px]">관리</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reports.map((report) => {
                    const studentLabel = report.studentName ?? report.studentEmail ?? '이름 미정'
                    const classLabel = report.className ?? '이름 미정'
                    const createdBy = report.createdByName ?? report.createdByEmail ?? '작성자 정보 없음'
                    const canEdit = isTeacher || isAdmin
                    const canDelete = canEdit

                    return (
                      <TableRow key={report.id} className={isDeleting ? 'opacity-80' : undefined}>
                        <TableCell>{DateUtil.formatForDisplay(report.absenceDate, { month: '2-digit', day: '2-digit', weekday: 'short' })}</TableCell>
                        <TableCell>{classLabel}</TableCell>
                        <TableCell>{studentLabel}</TableCell>
                        <TableCell>{ABSENCE_REASON_LABEL_MAP[report.reasonType] ?? report.reasonType}</TableCell>
                        <TableCell>
                          <p className="whitespace-pre-line text-sm text-slate-700">
                            {report.detailReason ?? '-'}
                          </p>
                        </TableCell>
                        <TableCell>
                          <p className="whitespace-pre-line text-sm text-slate-700">
                            {report.teacherAction ?? '-'}
                          </p>
                        </TableCell>
                        <TableCell>
                          <p className="whitespace-pre-line text-sm text-slate-700">
                            {report.managerAction ?? '-'}
                          </p>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col text-xs text-slate-500">
                            <span>{createdBy}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            {canEdit ? (
                              <Button variant="outline" size="sm" onClick={() => openEdit(report)}>
                                수정
                              </Button>
                            ) : null}
                            {canDelete ? (
                              <Button variant="ghost" size="sm" onClick={() => handleDelete(report)}>
                                삭제
                              </Button>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Sheet open={editingReport !== null} onOpenChange={(open) => (!open ? closeEdit() : undefined)}>
        <SheetContent className="sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>결석계 수정</SheetTitle>
            <SheetDescription>
              상세 사유와 {isTeacher ? '교사 ' : ''}
              {isAdmin ? '실장 ' : ''}
              조치사항을 수정할 수 있습니다.
            </SheetDescription>
          </SheetHeader>
          {editingReport ? (
            <form className="mt-4 space-y-4" onSubmit={handleEditSave}>
              {editMessage?.error ? (
                <Alert variant="destructive">
                  <AlertDescription>{editMessage.error}</AlertDescription>
                </Alert>
              ) : null}
              <div className="space-y-2">
                <Label htmlFor="edit-detail-reason">상세 사유</Label>
                <Textarea
                  id="edit-detail-reason"
                  name="detailReason"
                  defaultValue={editingReport.detailReason ?? ''}
                  rows={4}
                  placeholder="상세 사유를 입력하세요."
                />
              </div>
              {isTeacher ? (
                <div className="space-y-2">
                  <Label htmlFor="edit-teacher-action">교사 조치사항</Label>
                  <Textarea
                    id="edit-teacher-action"
                    name="teacherAction"
                    defaultValue={editingReport.teacherAction ?? ''}
                    rows={4}
                    placeholder="교사 조치사항을 입력하세요."
                  />
                </div>
              ) : (
                <input type="hidden" name="teacherAction" value={editingReport.teacherAction ?? ''} />
              )}
              {isAdmin ? (
                <div className="space-y-2">
                  <Label htmlFor="edit-manager-action">실장 조치사항</Label>
                  <Textarea
                    id="edit-manager-action"
                    name="managerAction"
                    defaultValue={editingReport.managerAction ?? ''}
                    rows={4}
                    placeholder="실장 조치사항을 입력하세요."
                  />
                </div>
              ) : (
                <input type="hidden" name="managerAction" value={editingReport.managerAction ?? ''} />
              )}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={closeEdit}>
                  취소
                </Button>
                <Button type="submit" disabled={isEditing}>
                  {isEditing ? '저장 중...' : '저장'}
                </Button>
              </div>
            </form>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  )
}
