'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FileDown, FileSpreadsheet, Loader2, Plus, X } from 'lucide-react'

import {
  assignPracticeBookingAction,
  cancelPracticeBookingAction,
} from '@/app/dashboard/practice-feedback/booking-actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { exportPracticeBoardToPdf, exportPracticeBoardToXlsx } from '@/lib/practice/board-export'
import { formatSlotDateLabel, getPracticeTimeline } from '@/lib/practice/shared'
import {
  PRACTICE_ATTEMPT_STATUS_LABELS,
  PRACTICE_TYPE_LABELS,
  type PracticeDayBoard,
  type PracticeSlotView,
  type PracticeStudentOption,
  type PracticeType,
  type PracticeUniversityOption,
} from '@/types/practice'

interface PracticeBoardGridProps {
  board: PracticeDayBoard
  students: PracticeStudentOption[]
  universities: PracticeUniversityOption[]
  /** 피드백 진행 화면 링크 베이스. 비우면 링크를 걸지 않는다. */
  sessionHrefBase?: string
  canAssign: boolean
}

export function PracticeBoardGrid({
  board,
  students,
  universities,
  sessionHrefBase,
  canAssign,
}: PracticeBoardGridProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [targetSlot, setTargetSlot] = useState<PracticeSlotView | null>(null)
  const [exporting, setExporting] = useState<'pdf' | 'xlsx' | null>(null)

  const [studentQuery, setStudentQuery] = useState('')
  const [studentId, setStudentId] = useState('')
  const [universityId, setUniversityId] = useState('')
  const [practiceType, setPracticeType] = useState<PracticeType>('writing')

  const slotMap = useMemo(() => {
    const map = new Map<string, PracticeSlotView>()
    for (const slot of board.slots) {
      map.set(`${slot.teacherId}|${slot.startTime}`, slot)
    }
    return map
  }, [board.slots])

  const filteredStudents = useMemo(() => {
    const query = studentQuery.trim().toLowerCase()
    const sorted = [...students].sort((a, b) => {
      if (a.isHomeroomStudent !== b.isHomeroomStudent) {
        return a.isHomeroomStudent ? -1 : 1
      }
      return a.name.localeCompare(b.name, 'ko')
    })
    if (!query) {
      return sorted.slice(0, 60)
    }
    return sorted
      .filter(
        (student) =>
          student.name.toLowerCase().includes(query) || (student.className ?? '').toLowerCase().includes(query)
      )
      .slice(0, 60)
  }, [students, studentQuery])

  const availableProblemCount = useMemo(() => {
    const university = universities.find((entry) => entry.id === universityId)
    if (!university) return null
    return practiceType === 'writing' ? university.writingProblemCount : university.interviewProblemCount
  }, [universities, universityId, practiceType])

  const openAssignDialog = (slot: PracticeSlotView) => {
    setTargetSlot(slot)
    setStudentId('')
    setStudentQuery('')
    setFeedback(null)
  }

  const handleAssign = () => {
    if (!targetSlot) return

    if (!studentId) {
      setFeedback({ type: 'error', message: '학생을 선택해주세요.' })
      return
    }
    if (!universityId) {
      setFeedback({ type: 'error', message: '대학을 선택해주세요.' })
      return
    }

    startTransition(async () => {
      const result = await assignPracticeBookingAction({
        slotId: targetSlot.id,
        studentId,
        universityId,
        practiceType,
      })

      if (result.error) {
        setFeedback({ type: 'error', message: result.error })
        return
      }

      setTargetSlot(null)
      setFeedback({ type: 'success', message: '예약을 배정했습니다.' })
      router.refresh()
    })
  }

  const handleCancel = (bookingId: string) => {
    if (!window.confirm('이 예약을 취소할까요? 배정된 문제도 함께 회수됩니다.')) {
      return
    }

    setFeedback(null)
    startTransition(async () => {
      const result = await cancelPracticeBookingAction({ bookingId })
      if (result.error) {
        setFeedback({ type: 'error', message: result.error })
        return
      }
      setFeedback({ type: 'success', message: '예약을 취소했습니다.' })
      router.refresh()
    })
  }

  const handleExport = async (format: 'pdf' | 'xlsx') => {
    setExporting(format)
    setFeedback(null)
    try {
      if (format === 'pdf') {
        await exportPracticeBoardToPdf(board)
      } else {
        await exportPracticeBoardToXlsx(board)
      }
    } catch (error) {
      console.error('[practice] board export failed', error)
      setFeedback({ type: 'error', message: '파일을 만드는 중 문제가 발생했습니다. 다시 시도해주세요.' })
    } finally {
      setExporting(null)
    }
  }

  if (board.teachers.length === 0) {
    return (
      <Card className="border-dashed border-slate-300">
        <CardContent className="py-12 text-center text-sm text-slate-500">
          {formatSlotDateLabel(board.slotDate)}에 개설된 슬롯이 없습니다.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {feedback ? (
        <div
          className={[
            'rounded-md border px-3 py-2 text-sm',
            feedback.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-red-200 bg-red-50 text-red-600',
          ].join(' ')}
        >
          {feedback.message}
        </div>
      ) : null}

      <Card className="border-slate-200">
        <CardHeader className="pb-3">
          <CardTitle className="self-center text-base text-slate-900">
            {formatSlotDateLabel(board.slotDate)} · 슬롯 {board.slots.length}개 · 예약{' '}
            {board.slots.filter((slot) => slot.booking).length}건
          </CardTitle>
          <CardAction className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={exporting !== null}
              onClick={() => handleExport('pdf')}
            >
              {exporting === 'pdf' ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <FileDown className="mr-1 h-4 w-4" />
              )}
              PDF 저장
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={exporting !== null}
              onClick={() => handleExport('xlsx')}
            >
              {exporting === 'xlsx' ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <FileSpreadsheet className="mr-1 h-4 w-4" />
              )}
              엑셀 저장
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="sticky left-0 z-10 w-20 bg-slate-50 px-3 py-2 text-left text-xs font-medium text-slate-500">
                  시간
                </th>
                {board.teachers.map((teacher) => (
                  <th
                    key={teacher.id}
                    className="min-w-[160px] px-2 py-2 text-left text-xs font-medium text-slate-700"
                  >
                    {teacher.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {board.timeLabels.map((label) => (
                <tr key={label} className="border-b border-slate-100 last:border-b-0">
                  <td className="sticky left-0 z-10 bg-white px-3 py-1.5 align-top font-mono text-xs text-slate-500">
                    {label}
                  </td>
                  {board.teachers.map((teacher) => {
                    const slot = slotMap.get(`${teacher.id}|${label}`)

                    if (!slot) {
                      return <td key={teacher.id} className="px-2 py-1.5 align-top" />
                    }

                    if (slot.status === 'closed') {
                      return (
                        <td key={teacher.id} className="px-2 py-1.5 align-top">
                          <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-400">
                            닫힘
                          </div>
                        </td>
                      )
                    }

                    if (slot.status === 'break') {
                      return (
                        <td key={teacher.id} className="px-2 py-1.5 align-top">
                          <div className="rounded-md border border-dashed border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-600">
                            쉬는 시간
                          </div>
                        </td>
                      )
                    }

                    const booking = slot.booking
                    const timeline = booking ? getPracticeTimeline(booking.opensAt, booking.deadlineAt) : null

                    if (!booking) {
                      return (
                        <td key={teacher.id} className="px-2 py-1.5 align-top">
                          <button
                            type="button"
                            disabled={!canAssign || isPending}
                            onClick={() => openAssignDialog(slot)}
                            className="flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-slate-300 px-2 py-2 text-xs text-slate-400 transition hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-700 disabled:cursor-not-allowed disabled:hover:border-slate-300 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                          >
                            <Plus className="h-3 w-3" /> 배정
                            {slot.audience === 'online' ? (
                              <span className="text-[10px] text-sky-600">온라인</span>
                            ) : null}
                          </button>
                        </td>
                      )
                    }

                    const content = (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-1">
                          <span className="truncate font-medium text-slate-900">{booking.studentName}</span>
                          <span className="flex shrink-0 items-center gap-1">
                            {slot.audience === 'online' ? (
                              <Badge variant="outline" className="border-sky-300 text-[10px] text-sky-700">
                                온라인
                              </Badge>
                            ) : null}
                            <Badge
                              variant={booking.practiceType === 'writing' ? 'secondary' : 'outline'}
                              className="text-[10px]"
                            >
                              {PRACTICE_TYPE_LABELS[booking.practiceType]}
                            </Badge>
                          </span>
                        </div>
                        <p className="truncate text-[11px] text-slate-500">{booking.universityName}</p>
                        {timeline ? (
                          <p className="text-[11px] text-slate-600">
                            실기 <span className="font-medium text-slate-800">{timeline.limitMinutes}분</span> · 등원{' '}
                            <span className="font-medium text-slate-800">{timeline.arrivalLabel}</span>
                          </p>
                        ) : null}
                        {booking.attemptStatus ? (
                          <p className="text-[11px] text-slate-400">
                            {PRACTICE_ATTEMPT_STATUS_LABELS[booking.attemptStatus]}
                            {booking.hasFeedback ? ' · 피드백 작성됨' : ''}
                          </p>
                        ) : null}
                      </div>
                    )

                    return (
                      <td key={teacher.id} className="px-2 py-1.5 align-top">
                        <div className="group relative rounded-md border border-emerald-200 bg-emerald-50/60 px-2 py-1.5">
                          {sessionHrefBase && booking.attemptId ? (
                            <Link href={`${sessionHrefBase}/${booking.attemptId}`} className="block">
                              {content}
                            </Link>
                          ) : (
                            content
                          )}
                          {canAssign ? (
                            <button
                              type="button"
                              disabled={isPending}
                              onClick={() => handleCancel(booking.id)}
                              className="absolute right-1 top-1 hidden rounded-full bg-white/90 p-1 text-slate-500 shadow hover:text-red-600 group-hover:block"
                              title="예약 취소"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          ) : null}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={targetSlot !== null} onOpenChange={(open) => !open && setTargetSlot(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>학생 배정</DialogTitle>
            <DialogDescription>
              {targetSlot
                ? `${formatSlotDateLabel(targetSlot.slotDate)} ${targetSlot.startTime} · ${targetSlot.teacherName} 선생님${
                    targetSlot.audience === 'online' ? ' · 온라인반 전용 슬롯' : ''
                  }`
                : ''}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>대학</Label>
              <Select value={universityId} onValueChange={setUniversityId} disabled={isPending}>
                <SelectTrigger>
                  <SelectValue placeholder="대학을 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  {universities.map((university) => (
                    <SelectItem key={university.id} value={university.id}>
                      {university.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>유형</Label>
              <Select
                value={practiceType}
                onValueChange={(value) => setPracticeType(value as PracticeType)}
                disabled={isPending}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="writing">작법형</SelectItem>
                  <SelectItem value="interview">면접형</SelectItem>
                </SelectContent>
              </Select>
              {availableProblemCount !== null ? (
                <p className={availableProblemCount === 0 ? 'text-xs text-red-600' : 'text-xs text-slate-500'}>
                  {availableProblemCount === 0
                    ? '이 대학/유형에 등록된 활성 문제가 없습니다. 문제 은행에서 먼저 추가해주세요.'
                    : `등록된 활성 문제 ${availableProblemCount}개. 학생이 아직 안 푼 문제가 자동 배정됩니다.`}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="practice-student-search">학생</Label>
              <Input
                id="practice-student-search"
                value={studentQuery}
                onChange={(event) => setStudentQuery(event.target.value)}
                placeholder="이름 또는 반으로 검색"
                disabled={isPending}
              />
              <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border border-slate-200 p-2">
                {filteredStudents.length === 0 ? (
                  <p className="px-2 py-3 text-xs text-slate-400">검색 결과가 없습니다.</p>
                ) : (
                  filteredStudents.map((student) => (
                    <button
                      key={student.id}
                      type="button"
                      disabled={isPending}
                      onClick={() => setStudentId(student.id)}
                      className={[
                        'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm transition',
                        studentId === student.id ? 'bg-emerald-100 text-emerald-900' : 'hover:bg-slate-100',
                      ].join(' ')}
                    >
                      <span className="flex items-center gap-2">
                        {student.name}
                        {student.isHomeroomStudent ? (
                          <Badge variant="secondary" className="text-[10px]">
                            담임 반
                          </Badge>
                        ) : null}
                      </span>
                      <span className="text-xs text-slate-500">{student.className ?? '반 없음'}</span>
                    </button>
                  ))
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" disabled={isPending} onClick={() => setTargetSlot(null)}>
                취소
              </Button>
              <Button type="button" disabled={isPending} onClick={handleAssign}>
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                배정하기
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
