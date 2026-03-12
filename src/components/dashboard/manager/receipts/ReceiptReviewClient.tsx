'use client'

import { Fragment, useEffect, useMemo, useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

import { reviewReceipt, bulkApproveReceipts, bulkMarkAsPaid } from '@/app/dashboard/manager/receipts/actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import {
  RECEIPT_REVIEW_STATUS_LABEL,
  type ReceiptReviewStatus,
  type ReceiptWithTeacher,
} from '@/lib/receipts'
import type { TeacherProfileSummary } from '@/lib/work-logs'

interface ReceiptReviewClientProps {
  receipts: ReceiptWithTeacher[]
  monthToken: string
  monthLabel: string
  statusFilter: 'pending' | 'approved' | 'rejected' | 'paid' | 'all'
  teacherDirectory: Record<string, TeacherProfileSummary>
  userRole: string
}

type FeedbackState = {
  type: 'success' | 'error'
  message: string
} | null

type StatusKey = 'pending' | 'approved' | 'rejected' | 'paid'

const STATUS_FILTER_LABEL: Record<'all' | StatusKey, string> = {
  all: '전체',
  pending: '승인 대기',
  approved: '승인 완료',
  rejected: '반려',
  paid: '지급완료',
}

type ReviewDecision = 'approve' | 'reject'

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('ko-KR').format(amount)
}

function formatDateLabel(iso: string): string {
  const date = new Date(iso)
  return new Intl.DateTimeFormat('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).format(date)
}

function shiftMonth(token: string, offset: number): string {
  const [yearToken, monthTokenPart] = token.split('-')
  const year = Number.parseInt(yearToken, 10)
  const month = Number.parseInt(monthTokenPart, 10) - 1
  const target = new Date(year, month + offset, 1)
  const nextYear = target.getFullYear()
  const nextMonth = `${target.getMonth() + 1}`.padStart(2, '0')
  return `${nextYear}-${nextMonth}`
}

function getStatusCounts(items: ReceiptWithTeacher[]): Record<StatusKey, number> {
  return items.reduce<Record<StatusKey, number>>(
    (acc, r) => {
      acc[r.reviewStatus] += 1
      return acc
    },
    { pending: 0, approved: 0, rejected: 0, paid: 0 }
  )
}

export function ReceiptReviewClient({
  receipts,
  monthToken,
  monthLabel,
  statusFilter,
  teacherDirectory,
  userRole,
}: ReceiptReviewClientProps) {
  const isPrincipal = userRole === 'principal'
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [receiptsState, setReceiptsState] = useState<ReceiptWithTeacher[]>(receipts)
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({})
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [feedback, setFeedback] = useState<FeedbackState>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    setReceiptsState(receipts)
    setNoteDrafts({})
    setExpandedId(null)
    setSelectedIds(new Set())
    setFeedback(null)
  }, [receipts, monthToken])

  const statusCounts = useMemo(() => getStatusCounts(receiptsState), [receiptsState])

  const filteredReceipts = useMemo(() => {
    if (statusFilter === 'all') return receiptsState
    return receiptsState.filter((r) => r.reviewStatus === statusFilter)
  }, [receiptsState, statusFilter])

  const filteredTotal = useMemo(
    () => filteredReceipts.reduce((sum, r) => sum + r.amount, 0),
    [filteredReceipts]
  )

  const pendingReceipts = useMemo(
    () => receiptsState.filter((r) => r.reviewStatus === 'pending'),
    [receiptsState]
  )

  const approvedReceipts = useMemo(
    () => receiptsState.filter((r) => r.reviewStatus === 'approved'),
    [receiptsState]
  )

  const [paidSelectedIds, setPaidSelectedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    setPaidSelectedIds(new Set())
  }, [receipts, monthToken])

  const togglePaidSelectAll = () => {
    const approvedInView = filteredReceipts.filter((r) => r.reviewStatus === 'approved')
    const allSelected = approvedInView.every((r) => paidSelectedIds.has(r.id))
    if (allSelected) {
      setPaidSelectedIds(new Set())
    } else {
      setPaidSelectedIds(new Set(approvedInView.map((r) => r.id)))
    }
  }

  const togglePaidSelect = (id: string) => {
    setPaidSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const handleBulkMarkAsPaid = () => {
    const ids = Array.from(paidSelectedIds)
    if (ids.length === 0) {
      setFeedback({ type: 'error', message: '지급완료 처리할 항목을 선택해주세요.' })
      return
    }

    startTransition(async () => {
      const result = await bulkMarkAsPaid(ids)
      if (!result.success) {
        setFeedback({ type: 'error', message: result.error ?? '지급완료 처리 중 오류가 발생했습니다.' })
        return
      }

      setReceiptsState((prev) =>
        prev.map((r) =>
          paidSelectedIds.has(r.id) && r.reviewStatus === 'approved'
            ? { ...r, reviewStatus: 'paid' as ReceiptReviewStatus }
            : r
        )
      )
      setPaidSelectedIds(new Set())
      setFeedback({
        type: 'success',
        message: `${result.paidCount}건의 영수증을 지급완료 처리했습니다.`,
      })
    })
  }

  const handleBulkMarkAllApprovedAsPaid = () => {
    if (approvedReceipts.length === 0) {
      setFeedback({ type: 'error', message: '승인 완료된 항목이 없습니다.' })
      return
    }

    const ids = approvedReceipts.map((r) => r.id)

    startTransition(async () => {
      const result = await bulkMarkAsPaid(ids)
      if (!result.success) {
        setFeedback({ type: 'error', message: result.error ?? '지급완료 처리 중 오류가 발생했습니다.' })
        return
      }

      setReceiptsState((prev) =>
        prev.map((r) =>
          r.reviewStatus === 'approved'
            ? { ...r, reviewStatus: 'paid' as ReceiptReviewStatus }
            : r
        )
      )
      setPaidSelectedIds(new Set())
      setFeedback({
        type: 'success',
        message: `${result.paidCount}건의 영수증을 지급완료 처리했습니다.`,
      })
    })
  }

  const navigateToMonth = (token: string) => {
    const params = new URLSearchParams(searchParams?.toString())
    params.set('month', token)
    router.push(`${pathname}?${params.toString()}`)
  }

  const updateStatusFilter = (value: string) => {
    const params = new URLSearchParams(searchParams?.toString())
    params.set('status', value)
    router.push(`${pathname}?${params.toString()}`)
  }

  const updateTeacherFilter = (value: string) => {
    const params = new URLSearchParams(searchParams?.toString())
    if (value === '__all__') {
      params.delete('teacher')
    } else {
      params.set('teacher', value)
    }
    router.push(`${pathname}?${params.toString()}`)
  }

  const getNoteDraft = (receipt: ReceiptWithTeacher) => {
    if (noteDrafts[receipt.id] !== undefined) return noteDrafts[receipt.id]
    return receipt.reviewNote ?? ''
  }

  const toggleSelectAll = () => {
    const pendingInView = filteredReceipts.filter((r) => r.reviewStatus === 'pending')
    const allSelected = pendingInView.every((r) => selectedIds.has(r.id))
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(pendingInView.map((r) => r.id)))
    }
  }

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const handleDecision = (receipt: ReceiptWithTeacher, decision: ReviewDecision) => {
    const note = getNoteDraft(receipt).trim()
    const formData = new FormData()
    formData.append('receiptId', receipt.id)
    formData.append('decision', decision)
    if (note) formData.append('reviewNote', note)

    startTransition(async () => {
      const result = await reviewReceipt(formData)
      if (!result?.success || !result.receipt) {
        setFeedback({ type: 'error', message: result?.error ?? '처리 중 오류가 발생했습니다.' })
        return
      }

      const updated = result.receipt
      setReceiptsState((prev) =>
        prev.map((r) => (r.id === updated.id ? { ...r, ...updated } : r))
      )
      setNoteDrafts((prev) => ({ ...prev, [receipt.id]: updated.reviewNote ?? '' }))

      const shouldCollapse =
        statusFilter !== 'all' && statusFilter !== updated.reviewStatus && expandedId === receipt.id
      if (shouldCollapse) setExpandedId(null)

      setFeedback({
        type: 'success',
        message: decision === 'approve' ? '영수증을 승인했습니다.' : '영수증을 반려했습니다.',
      })
    })
  }

  const handleBulkApprove = () => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) {
      setFeedback({ type: 'error', message: '승인할 항목을 선택해주세요.' })
      return
    }

    startTransition(async () => {
      const result = await bulkApproveReceipts(ids)
      if (!result.success) {
        setFeedback({ type: 'error', message: result.error ?? '일괄 승인 중 오류가 발생했습니다.' })
        return
      }

      setReceiptsState((prev) =>
        prev.map((r) =>
          selectedIds.has(r.id) && r.reviewStatus === 'pending'
            ? { ...r, reviewStatus: 'approved' as ReceiptReviewStatus }
            : r
        )
      )
      setSelectedIds(new Set())
      setFeedback({
        type: 'success',
        message: `${result.approvedCount}건의 영수증을 일괄 승인했습니다.`,
      })
    })
  }

  const handleBulkApprovePending = () => {
    if (pendingReceipts.length === 0) {
      setFeedback({ type: 'error', message: '승인 대기 중인 항목이 없습니다.' })
      return
    }

    const ids = pendingReceipts.map((r) => r.id)

    startTransition(async () => {
      const result = await bulkApproveReceipts(ids)
      if (!result.success) {
        setFeedback({ type: 'error', message: result.error ?? '일괄 승인 중 오류가 발생했습니다.' })
        return
      }

      setReceiptsState((prev) =>
        prev.map((r) =>
          r.reviewStatus === 'pending'
            ? { ...r, reviewStatus: 'approved' as ReceiptReviewStatus }
            : r
        )
      )
      setFeedback({
        type: 'success',
        message: `${result.approvedCount}건의 영수증을 일괄 승인했습니다.`,
      })
    })
  }

  const currentTeacherFilter = searchParams?.get('teacher') ?? '__all__'

  const teacherList = useMemo(() => {
    return Object.values(teacherDirectory).sort((a, b) => {
      const nameA = a.name ?? a.email ?? ''
      const nameB = b.name ?? b.email ?? ''
      return nameA.localeCompare(nameB, 'ko')
    })
  }, [teacherDirectory])

  return (
    <div className="space-y-4">
      <Card className="border-slate-200">
        <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <CardTitle className="text-xl text-slate-900">{monthLabel} 지출증빙 목록</CardTitle>
            <CardDescription>교사별, 승인 상태별로 영수증을 검토하세요.</CardDescription>
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
            <Select value={currentTeacherFilter} onValueChange={updateTeacherFilter}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="교사 선택" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">전체 교사</SelectItem>
                {teacherList.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name ?? t.email ?? '이름 미기재'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={updateStatusFilter}>
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
              <Badge
                key={key}
                variant={key === 'pending' ? 'secondary' : key === 'paid' ? 'default' : 'outline'}
                className={cn(
                  key === 'pending' && 'bg-amber-100 text-amber-900',
                  key === 'paid' && 'bg-blue-100 text-blue-900',
                )}
              >
                {STATUS_FILTER_LABEL[key]} {statusCounts[key]}건
              </Badge>
            ))}
            <Badge variant="outline">합계 {formatCurrency(filteredTotal)}원</Badge>
          </div>

          {feedback && (
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
          )}

          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead className="w-10">
                  {(() => {
                    const hasPending = filteredReceipts.some((r) => r.reviewStatus === 'pending')
                    const hasApproved = isPrincipal && filteredReceipts.some((r) => r.reviewStatus === 'approved')
                    if (!hasPending && !hasApproved) return null
                    const pendingAllChecked = hasPending && filteredReceipts
                      .filter((r) => r.reviewStatus === 'pending')
                      .every((r) => selectedIds.has(r.id))
                    const approvedAllChecked = hasApproved && filteredReceipts
                      .filter((r) => r.reviewStatus === 'approved')
                      .every((r) => paidSelectedIds.has(r.id))
                    const allChecked = (!hasPending || pendingAllChecked) && (!hasApproved || approvedAllChecked)
                    return (
                      <Checkbox
                        checked={allChecked}
                        onChange={() => {
                          toggleSelectAll()
                          if (isPrincipal) togglePaidSelectAll()
                        }}
                        aria-label="전체 선택"
                      />
                    )
                  })()}
                </TableHead>
                <TableHead className="w-28">사용일자</TableHead>
                <TableHead className="w-28">교사</TableHead>
                <TableHead>사용내역</TableHead>
                <TableHead className="w-28 text-right">금액</TableHead>
                <TableHead className="w-32">승인 상태</TableHead>
                <TableHead className="w-auto min-w-[7rem]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span>조치</span>
                    {selectedIds.size > 0 && (
                      <Button
                        type="button"
                        variant="default"
                        size="sm"
                        onClick={handleBulkApprove}
                        disabled={isPending}
                        className="h-6 px-2 text-xs"
                      >
                        선택 승인 ({selectedIds.size})
                      </Button>
                    )}
                    {selectedIds.size === 0 && pendingReceipts.length > 0 && (
                      <Button
                        type="button"
                        variant="default"
                        size="sm"
                        onClick={handleBulkApprovePending}
                        disabled={isPending}
                        className="h-6 px-2 text-xs"
                      >
                        일괄 승인 ({pendingReceipts.length})
                      </Button>
                    )}
                    {isPrincipal && paidSelectedIds.size > 0 && (
                      <Button
                        type="button"
                        variant="default"
                        size="sm"
                        onClick={handleBulkMarkAsPaid}
                        disabled={isPending}
                        className="h-6 px-2 text-xs bg-blue-600 hover:bg-blue-700"
                      >
                        선택 지급완료 ({paidSelectedIds.size})
                      </Button>
                    )}
                    {isPrincipal && paidSelectedIds.size === 0 && approvedReceipts.length > 0 && (
                      <Button
                        type="button"
                        variant="default"
                        size="sm"
                        onClick={handleBulkMarkAllApprovedAsPaid}
                        disabled={isPending}
                        className="h-6 px-2 text-xs bg-blue-600 hover:bg-blue-700"
                      >
                        일괄 지급완료 ({approvedReceipts.length})
                      </Button>
                    )}
                  </div>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredReceipts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-6 text-center text-sm text-slate-500">
                    표시할 영수증이 없습니다.
                  </TableCell>
                </TableRow>
              ) : (
                filteredReceipts.map((receipt) => {
                  const canApprove = receipt.reviewStatus !== 'approved' && receipt.reviewStatus !== 'paid'
                  const canReject = receipt.reviewStatus !== 'rejected' && receipt.reviewStatus !== 'paid'
                  const noteValue = getNoteDraft(receipt)
                  const teacherName = receipt.teacher?.name ?? receipt.teacher?.email ?? '이름 미기재'

                  return (
                    <Fragment key={receipt.id}>
                      <TableRow className={cn(expandedId === receipt.id && 'bg-slate-50')}>
                        <TableCell>
                          {receipt.reviewStatus === 'pending' && (
                            <Checkbox
                              checked={selectedIds.has(receipt.id)}
                              onChange={() => toggleSelect(receipt.id)}
                              aria-label={`${receipt.description} 선택`}
                            />
                          )}
                          {isPrincipal && receipt.reviewStatus === 'approved' && (
                            <Checkbox
                              checked={paidSelectedIds.has(receipt.id)}
                              onChange={() => togglePaidSelect(receipt.id)}
                              aria-label={`${receipt.description} 지급완료 선택`}
                            />
                          )}
                        </TableCell>
                        <TableCell>{formatDateLabel(receipt.usedDate)}</TableCell>
                        <TableCell>{teacherName}</TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-0.5">
                            <span>{receipt.description}</span>
                            {receipt.approvalNumber && (
                              <span className="text-xs text-slate-500">승인번호: {receipt.approvalNumber}</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(receipt.amount)}원
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1 text-xs">
                            <Badge
                              variant={
                                receipt.reviewStatus === 'approved' ? 'default'
                                : receipt.reviewStatus === 'rejected' ? 'destructive'
                                : receipt.reviewStatus === 'paid' ? 'default'
                                : 'secondary'
                              }
                              className={cn(
                                receipt.reviewStatus === 'pending' && 'bg-amber-100 text-amber-900',
                                receipt.reviewStatus === 'paid' && 'bg-blue-100 text-blue-900',
                              )}
                            >
                              {RECEIPT_REVIEW_STATUS_LABEL[receipt.reviewStatus]}
                            </Badge>
                            {receipt.reviewNote && (
                              <span className="text-slate-500">메모: {receipt.reviewNote}</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setExpandedId((prev) => (prev === receipt.id ? null : receipt.id))}
                          >
                            {expandedId === receipt.id ? '닫기' : '상세'}
                          </Button>
                        </TableCell>
                      </TableRow>
                      {expandedId === receipt.id && (
                        <TableRow className="bg-white">
                          <TableCell colSpan={7} className="bg-slate-50">
                            <div className="grid gap-4 p-4 text-sm text-slate-600 md:grid-cols-2">
                              <div className="space-y-3">
                                <div className="rounded-md border border-slate-200 bg-white p-3 text-xs">
                                  <p className="font-semibold text-slate-800">영수증 상세</p>
                                  <p>교사: {teacherName}</p>
                                  <p>사용일자: {receipt.usedDate}</p>
                                  <p>사용내역: {receipt.description}</p>
                                  <p>금액: {formatCurrency(receipt.amount)}원</p>
                                  {receipt.approvalNumber && (
                                    <p>승인번호: {receipt.approvalNumber}</p>
                                  )}
                                </div>
                                {receipt.receiptImagePath && (
                                  <div className="space-y-2">
                                    <p className="font-semibold text-slate-800 text-xs">영수증 이미지</p>
                                    <a
                                      href={`/api/storage/teacher-receipts/${receipt.receiptImagePath}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                    >
                                      <img
                                        src={`/api/storage/teacher-receipts/${receipt.receiptImagePath}`}
                                        alt="영수증 이미지"
                                        className="max-h-48 rounded-md border border-slate-200 object-contain"
                                      />
                                    </a>
                                  </div>
                                )}
                                {!receipt.receiptImagePath && (
                                  <p className="text-xs text-slate-500">첨부된 영수증 이미지가 없습니다.</p>
                                )}
                              </div>
                              <div className="space-y-2">
                                {receipt.reviewStatus === 'paid' ? (
                                  <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
                                    <p className="font-semibold">지급완료</p>
                                    {receipt.paidAt && (
                                      <p>지급일시: {new Date(receipt.paidAt).toLocaleString('ko-KR')}</p>
                                    )}
                                    {receipt.reviewNote && (
                                      <p>메모: {receipt.reviewNote}</p>
                                    )}
                                  </div>
                                ) : (
                                  <>
                                    <p className="font-semibold text-slate-800 text-xs">실장 메모</p>
                                    <Textarea
                                      rows={3}
                                      value={noteValue}
                                      onChange={(e) =>
                                        setNoteDrafts((prev) => ({
                                          ...prev,
                                          [receipt.id]: e.target.value,
                                        }))
                                      }
                                      placeholder="승인 또는 반려 사유를 메모로 남길 수 있습니다."
                                      disabled={isPending}
                                    />
                                    <div className="flex gap-2">
                                      <Button
                                        type="button"
                                        onClick={() => handleDecision(receipt, 'approve')}
                                        disabled={isPending || !canApprove}
                                      >
                                        {isPending ? '처리 중...' : '승인'}
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="destructive"
                                        onClick={() => handleDecision(receipt, 'reject')}
                                        disabled={isPending || !canReject}
                                      >
                                        반려
                                      </Button>
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
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
