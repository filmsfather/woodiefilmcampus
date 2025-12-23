'use client'

import { Fragment, useEffect, useMemo, useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

import { bulkApproveWorkLogEntries, reviewWorkLogEntry } from '@/app/dashboard/principal/work-logs/actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import {
  WORK_LOG_REVIEW_STATUS_LABEL,
  WORK_LOG_STATUS_OPTIONS,
  requiresWorkHours,
  type TeacherProfileSummary,
  type WorkLogEntryWithTeacher,
} from '@/lib/work-logs'

interface WorkLogReviewClientProps {
  entries: WorkLogEntryWithTeacher[]
  monthToken: string
  monthLabel: string
  statusFilter: 'pending' | 'approved' | 'rejected' | 'all'
  teacherDirectory: Record<string, TeacherProfileSummary>
}

type FeedbackState = {
  type: 'success' | 'error'
  message: string
} | null

type NoteDrafts = Record<string, string>

type ReviewDecision = 'approve' | 'reject'

type StatusKey = 'pending' | 'approved' | 'rejected'

const STATUS_FILTER_LABEL: Record<'all' | StatusKey, string> = {
  all: '전체',
  pending: '승인 대기',
  approved: '승인 완료',
  rejected: '반려',
}

function formatDateLabel(iso: string): string {
  const date = new Date(iso)
  return new Intl.DateTimeFormat('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).format(date)
}

function formatHours(value: number | null | undefined): string {
  if (!value && value !== 0) {
    return '-'
  }
  const fixed = Number(value.toFixed(1))
  return Number.isInteger(fixed) ? `${fixed}시간` : `${fixed.toFixed(1)}시간`
}

function shiftMonth(token: string, offset: number): string {
  const [yearToken, monthToken] = token.split('-')
  const year = Number.parseInt(yearToken, 10)
  const month = Number.parseInt(monthToken, 10) - 1
  const target = new Date(year, month + offset, 1)
  const nextYear = target.getFullYear()
  const nextMonth = `${target.getMonth() + 1}`.padStart(2, '0')
  return `${nextYear}-${nextMonth}`
}

function getStatusCounts(entries: WorkLogEntryWithTeacher[]): Record<StatusKey, number> {
  return entries.reduce<Record<StatusKey, number>>(
    (acc, entry) => {
      acc[entry.reviewStatus] += 1
      return acc
    },
    { pending: 0, approved: 0, rejected: 0 }
  )
}

function getSubstituteSummary(
  entry: WorkLogEntryWithTeacher,
  teacherDirectory: Record<string, TeacherProfileSummary>
): string {
  if (entry.status !== 'substitute') {
    return '-'
  }
  if (entry.substituteType === 'internal') {
    if (!entry.substituteTeacherId) {
      return '학원 구성원 지정 (미확인)'
    }
    const teacher = teacherDirectory[entry.substituteTeacherId]
    return `학원 구성원 · ${teacher?.name ?? teacher?.email ?? entry.substituteTeacherId}`
  }
  if (entry.substituteType === 'external') {
    const name = entry.externalTeacherName ?? '외부 선생님'
    const phone = entry.externalTeacherPhone ? ` (${entry.externalTeacherPhone})` : ''
    const hoursLabel =
      typeof entry.externalTeacherHours === 'number' ? ` · ${formatHours(entry.externalTeacherHours ?? 0)}` : ''
    return `외부 선생님 · ${name}${phone}${hoursLabel}`
  }
  return '대타 정보 미입력'
}

export function WorkLogReviewClient({
  entries,
  monthToken,
  monthLabel,
  statusFilter,
  teacherDirectory,
}: WorkLogReviewClientProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [entriesState, setEntriesState] = useState<WorkLogEntryWithTeacher[]>(entries)
  const [noteDrafts, setNoteDrafts] = useState<NoteDrafts>({})
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<FeedbackState>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    setEntriesState(entries)
    setNoteDrafts({})
    setExpandedId(null)
    setFeedback(null)
  }, [entries, monthToken])

  const statusCounts = useMemo(() => getStatusCounts(entriesState), [entriesState])
  const filteredEntries = useMemo(() => {
    if (statusFilter === 'all') {
      return entriesState
    }
    return entriesState.filter((entry) => entry.reviewStatus === statusFilter)
  }, [entriesState, statusFilter])

  const monthlyTotalHours = useMemo(() => {
    return entriesState
      .filter((entry) => requiresWorkHours(entry.status) && typeof entry.workHours === 'number')
      .reduce((sum, entry) => sum + (entry.workHours ?? 0), 0)
  }, [entriesState])

  const navigateToMonth = (token: string) => {
    const params = new URLSearchParams(searchParams?.toString())
    params.set('month', token)
    router.push(`${pathname}?${params.toString()}`)
  }

  const updateStatusFilter = (value: 'all' | StatusKey) => {
    const params = new URLSearchParams(searchParams?.toString())
    params.set('status', value)
    router.push(`${pathname}?${params.toString()}`)
  }

  const updateEntry = (updated: WorkLogEntryWithTeacher) => {
    setEntriesState((prev) =>
      prev.map((entry) => (entry.id === updated.id ? { ...entry, ...updated } : entry))
    )
  }

  const getNoteDraft = (entry: WorkLogEntryWithTeacher) => {
    if (noteDrafts[entry.id] !== undefined) {
      return noteDrafts[entry.id]
    }
    return entry.reviewNote ?? ''
  }

  const pendingEntries = useMemo(() => {
    return entriesState.filter((entry) => entry.reviewStatus === 'pending')
  }, [entriesState])

  const handleBulkApprove = () => {
    if (pendingEntries.length === 0) {
      setFeedback({ type: 'error', message: '승인 대기 중인 항목이 없습니다.' })
      return
    }

    const entryIds = pendingEntries.map((entry) => entry.id)

    startTransition(async () => {
      const result = await bulkApproveWorkLogEntries(entryIds)
      if (!result.success) {
        setFeedback({ type: 'error', message: result.error ?? '일괄 승인 처리 중 오류가 발생했습니다.' })
        return
      }

      setEntriesState((prev) =>
        prev.map((entry) =>
          entry.reviewStatus === 'pending'
            ? { ...entry, reviewStatus: 'approved' as const }
            : entry
        )
      )

      setFeedback({
        type: 'success',
        message: `${result.approvedCount}건의 근무일지를 일괄 승인했습니다.`,
      })
    })
  }

  const handleDecision = (entry: WorkLogEntryWithTeacher, decision: ReviewDecision) => {
    const note = getNoteDraft(entry).trim()
    const formData = new FormData()
    formData.append('entryId', entry.id)
    formData.append('decision', decision)
    if (note) {
      formData.append('reviewNote', note)
    }

    startTransition(async () => {
      const result = await reviewWorkLogEntry(formData)
      if (!result?.success || !result.entry) {
        setFeedback({ type: 'error', message: result?.error ?? '승인 처리 중 오류가 발생했습니다.' })
        return
      }

      const updatedEntry = result.entry

      const merged: WorkLogEntryWithTeacher = {
        ...entry,
        ...updatedEntry,
      }

      updateEntry(merged)
      setNoteDrafts((prev) => ({
        ...prev,
        [entry.id]: updatedEntry.reviewNote ?? '',
      }))

      const shouldCollapse =
        statusFilter !== 'all' && statusFilter !== merged.reviewStatus && expandedId === entry.id

      if (shouldCollapse) {
        setExpandedId(null)
      }

      setFeedback({
        type: 'success',
        message: decision === 'approve' ? '근무일지를 승인했습니다.' : '근무일지를 반려했습니다.',
      })
    })
  }

  return (
    <div className="space-y-4">
      <Card className="border-slate-200">
        <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle className="text-xl text-slate-900">{monthLabel} 근무일지 목록</CardTitle>
            <CardDescription>필터를 활용해 승인 상태를 빠르게 확인할 수 있습니다.</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => navigateToMonth(shiftMonth(monthToken, -1))} disabled={isPending}>
                이전 달
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => navigateToMonth(shiftMonth(monthToken, 1))} disabled={isPending}>
                다음 달
              </Button>
            </div>
            <Select value={statusFilter} onValueChange={(value) => updateStatusFilter(value as 'all' | StatusKey)}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="승인 상태" />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(STATUS_FILTER_LABEL) as Array<'all' | StatusKey>).map((key) => (
                  <SelectItem key={key} value={key}>
                    {STATUS_FILTER_LABEL[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            {(Object.keys(statusCounts) as StatusKey[]).map((key) => (
              <Badge key={key} variant={key === 'pending' ? 'secondary' : 'outline'} className={cn(key === 'pending' && 'bg-amber-100 text-amber-900')}>
                {STATUS_FILTER_LABEL[key]} {statusCounts[key]}건
              </Badge>
            ))}
            <Badge variant="outline">월간 근무 시간 합계 {formatHours(monthlyTotalHours)}</Badge>
          </div>

          {feedback ? (
            <div
              className={cn(
                'rounded-md border p-3 text-sm',
                feedback.type === 'success'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-red-200 bg-red-50 text-red-700'
              )}
            >
              {feedback.message}
            </div>
          ) : null}

          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead className="w-24">근무일</TableHead>
                <TableHead className="w-32">구성원</TableHead>
                <TableHead className="w-28">근무 유형</TableHead>
                <TableHead className="w-24">근무 시간</TableHead>
                <TableHead className="w-40">대타 정보</TableHead>
                <TableHead className="w-40">승인 상태</TableHead>
                <TableHead className="w-40">
                  <div className="flex items-center gap-2">
                    <span>조치</span>
                    {pendingEntries.length > 0 && (
                      <Button
                        type="button"
                        variant="default"
                        size="sm"
                        onClick={handleBulkApprove}
                        disabled={isPending}
                        className="h-6 px-2 text-xs"
                      >
                        일괄 승인 ({pendingEntries.length})
                      </Button>
                    )}
                  </div>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredEntries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-6 text-center text-sm text-slate-500">
                    표시할 근무일지가 없습니다.
                  </TableCell>
                </TableRow>
              ) : (
                filteredEntries.map((entry) => {
                  const statusMeta = WORK_LOG_STATUS_OPTIONS.find((option) => option.value === entry.status)
                  const canApprove = entry.reviewStatus !== 'approved'
                  const canReject = entry.reviewStatus !== 'rejected'
                  const noteValue = getNoteDraft(entry)

                  return (
                    <Fragment key={entry.id}>
                      <TableRow className={cn(expandedId === entry.id && 'bg-slate-50')}>
                        <TableCell>{formatDateLabel(entry.workDate)}</TableCell>
                        <TableCell>{entry.teacher?.name ?? entry.teacher?.email ?? '이름 미기재'}</TableCell>
                        <TableCell>{statusMeta?.label ?? entry.status}</TableCell>
                        <TableCell>{formatHours(entry.workHours ?? null)}</TableCell>
                        <TableCell>{getSubstituteSummary(entry, teacherDirectory)}</TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1 text-xs">
                            <span className="font-semibold text-slate-700">{WORK_LOG_REVIEW_STATUS_LABEL[entry.reviewStatus]}</span>
                            {entry.reviewNote ? <span className="text-slate-500">메모: {entry.reviewNote}</span> : null}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setExpandedId((prev) => (prev === entry.id ? null : entry.id))}
                            >
                              {expandedId === entry.id ? '닫기' : '상세 보기'}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                      {expandedId === entry.id ? (
                        <TableRow className="bg-white">
                          <TableCell colSpan={7} className="bg-slate-50">
                            <div className="grid gap-4 p-4 text-sm text-slate-600 md:grid-cols-2">
                              <div className="space-y-2">
                                {entry.status === 'substitute' ? (
                                  <div className="rounded-md border border-slate-200 bg-white p-3 text-xs">
                                    <p className="font-semibold text-slate-800">대타 정보</p>
                                    <p className="text-slate-600">
                                      유형: {entry.substituteType === 'internal' ? '학원 구성원' : '외부 선생님'}
                                    </p>
                                    {entry.substituteType === 'internal' ? (
                                      <p className="text-slate-600">
                                        담당: {teacherDirectory[entry.substituteTeacherId ?? '']?.name ?? teacherDirectory[entry.substituteTeacherId ?? '']?.email ?? '선택됨'}
                                      </p>
                                    ) : (
                                      <div className="space-y-1">
                                        <p className="text-slate-600">성함: {entry.externalTeacherName ?? '-'}</p>
                                        <p className="text-slate-600">연락처: {entry.externalTeacherPhone ?? '-'}</p>
                                        <p className="text-slate-600">은행/계좌: {entry.externalTeacherBank ?? '-'} / {entry.externalTeacherAccount ?? '-'}</p>
                                        <p className="text-slate-600">
                                          근무 시간: {typeof entry.externalTeacherHours === 'number' ? formatHours(entry.externalTeacherHours) : '-'}
                                        </p>
                                      </div>
                                    )}
                                  </div>
                                ) : null}
                                <p className="font-semibold text-slate-800">근무 메모</p>
                                <p className="rounded-md border border-slate-200 bg-white p-3 min-h-[60px]">
                                  {entry.notes?.length ? entry.notes : '메모가 없습니다.'}
                                </p>
                              </div>
                              <div className="space-y-2">
                                <p className="font-semibold text-slate-800">원장 메모</p>
                                <Textarea
                                  rows={3}
                                  value={noteValue}
                                  onChange={(event) =>
                                    setNoteDrafts((prev) => ({
                                      ...prev,
                                      [entry.id]: event.target.value,
                                    }))
                                  }
                                  placeholder="승인 또는 반려 사유를 메모로 남길 수 있습니다."
                                  disabled={isPending}
                                />
                                <div className="flex gap-2">
                                  <Button
                                    type="button"
                                    onClick={() => handleDecision(entry, 'approve')}
                                    disabled={isPending || !canApprove}
                                  >
                                    {isPending ? '처리 중...' : '승인'}
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="destructive"
                                    onClick={() => handleDecision(entry, 'reject')}
                                    disabled={isPending || !canReject}
                                  >
                                    반려
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </Fragment>
                  )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
