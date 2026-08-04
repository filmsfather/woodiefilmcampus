'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { Textarea } from '@/components/ui/textarea'
import {
  approveSpecialLectureRequestAction,
  rejectSpecialLectureRequestAction,
} from '@/app/dashboard/manager/special-lectures/actions'
import {
  SPECIAL_LECTURE_DEFAULT_GRANT_HOURS,
  SPECIAL_LECTURE_GRANT_PRESETS,
  SPECIAL_LECTURE_MAX_GRANT_HOURS,
  SPECIAL_LECTURE_REQUEST_STATUS_LABELS,
  parseLocalDatetimeInputValue,
  toLocalDatetimeInputValue,
  type SpecialLectureRequest,
} from '@/lib/special-lectures'

interface SpecialLectureRequestListProps {
  requests: SpecialLectureRequest[]
}

const dateFormatter = new Intl.DateTimeFormat('ko', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

function formatWindow(startsAt: string, expiresAt: string) {
  return `${dateFormatter.format(new Date(startsAt))} ~ ${dateFormatter.format(new Date(expiresAt))}`
}

function studentDisplayName(request: SpecialLectureRequest) {
  return request.studentName ?? request.studentEmail ?? '이름 없음'
}

function statusBadgeVariant(status: SpecialLectureRequest['status']) {
  if (status === 'requested') return 'default' as const
  if (status === 'approved') return 'secondary' as const
  return 'outline' as const
}

function describeGrant(request: SpecialLectureRequest) {
  if (!request.grantStartsAt || !request.grantExpiresAt) return null

  const windowLabel = formatWindow(request.grantStartsAt, request.grantExpiresAt)

  if (request.grantRevokedAt) {
    return `공개 해지됨 · ${windowLabel}`
  }

  const startsAt = new Date(request.grantStartsAt)
  const expiresAt = new Date(request.grantExpiresAt)

  if (expiresAt.getTime() <= Date.now()) {
    return `공개 종료됨 · ${windowLabel}`
  }
  if (startsAt.getTime() > Date.now()) {
    return `공개 예정 · ${windowLabel}`
  }
  return `공개 중 · ${windowLabel}`
}

export function SpecialLectureRequestList({ requests }: SpecialLectureRequestListProps) {
  if (requests.length === 0) {
    return <p className="text-sm text-slate-500">표시할 신청이 없습니다.</p>
  }

  return (
    <div className="space-y-2">
      {requests.map((request) => (
        <RequestRow key={request.id} request={request} />
      ))}
    </div>
  )
}

function RequestRow({ request }: { request: SpecialLectureRequest }) {
  const [approveOpen, setApproveOpen] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)

  const grantLabel = describeGrant(request)
  const isPendingRequest = request.status === 'requested'

  return (
    <div className="flex flex-col gap-3 rounded-md border border-slate-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-slate-900">{studentDisplayName(request)}</span>
          <Badge variant={statusBadgeVariant(request.status)}>
            {SPECIAL_LECTURE_REQUEST_STATUS_LABELS[request.status]}
          </Badge>
          {request.classNames.map((name) => (
            <Badge key={name} variant="outline" className="border-slate-300 text-xs text-slate-600">
              {name}
            </Badge>
          ))}
        </div>
        <p className="text-xs text-slate-500">
          신청 {dateFormatter.format(new Date(request.createdAt))}
          {request.decidedAt
            ? ` · 처리 ${dateFormatter.format(new Date(request.decidedAt))}`
            : ''}
          {request.decidedByName ? ` · ${request.decidedByName}` : ''}
        </p>
        {grantLabel ? <p className="text-xs text-slate-600">{grantLabel}</p> : null}
        {request.rejectReason ? (
          <p className="text-xs text-rose-600">반려 사유: {request.rejectReason}</p>
        ) : null}
      </div>

      {isPendingRequest ? (
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button type="button" size="sm" onClick={() => setApproveOpen(true)}>
            열어주기
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setRejectOpen(true)}
          >
            반려
          </Button>
        </div>
      ) : null}

      <ApproveDialog open={approveOpen} onOpenChange={setApproveOpen} request={request} />
      <RejectDialog open={rejectOpen} onOpenChange={setRejectOpen} request={request} />
    </div>
  )
}

interface DialogProps {
  open: boolean
  onOpenChange: (next: boolean) => void
  request: SpecialLectureRequest
}

function defaultWindow() {
  const now = new Date()
  return {
    startsAt: toLocalDatetimeInputValue(now),
    expiresAt: toLocalDatetimeInputValue(
      new Date(now.getTime() + SPECIAL_LECTURE_DEFAULT_GRANT_HOURS * 60 * 60 * 1000)
    ),
  }
}

function ApproveDialog({ open, onOpenChange, request }: DialogProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [startsAt, setStartsAt] = useState<string>(() => defaultWindow().startsAt)
  const [expiresAt, setExpiresAt] = useState<string>(() => defaultWindow().expiresAt)

  const resetWindow = () => {
    const next = defaultWindow()
    setStartsAt(next.startsAt)
    setExpiresAt(next.expiresAt)
  }

  const applyPreset = (hours: number) => {
    const base = parseLocalDatetimeInputValue(startsAt) ?? new Date()
    setExpiresAt(toLocalDatetimeInputValue(new Date(base.getTime() + hours * 60 * 60 * 1000)))
  }

  const startsDate = parseLocalDatetimeInputValue(startsAt)
  const expiresDate = parseLocalDatetimeInputValue(expiresAt)
  const durationLabel = (() => {
    if (!startsDate || !expiresDate) return null
    const diffMs = expiresDate.getTime() - startsDate.getTime()
    if (diffMs <= 0) return null
    const totalMinutes = Math.floor(diffMs / (60 * 1000))
    const days = Math.floor(totalMinutes / (60 * 24))
    const hours = Math.floor((totalMinutes - days * 60 * 24) / 60)
    const minutes = totalMinutes - days * 60 * 24 - hours * 60
    const parts: string[] = []
    if (days > 0) parts.push(`${days}일`)
    if (hours > 0) parts.push(`${hours}시간`)
    if (minutes > 0 && days === 0) parts.push(`${minutes}분`)
    return parts.length > 0 ? parts.join(' ') : null
  })()

  const handleSubmit = () => {
    setError(null)

    if (!startsDate) {
      setError('공개 시작 시각을 입력해주세요.')
      return
    }
    if (!expiresDate) {
      setError('공개 종료 시각을 입력해주세요.')
      return
    }
    if (expiresDate.getTime() <= startsDate.getTime()) {
      setError('공개 종료 시각은 시작 시각보다 이후여야 합니다.')
      return
    }
    if (expiresDate.getTime() <= Date.now()) {
      setError('공개 종료 시각은 현재 시각보다 이후여야 합니다.')
      return
    }
    if (
      expiresDate.getTime() - startsDate.getTime() >
      SPECIAL_LECTURE_MAX_GRANT_HOURS * 60 * 60 * 1000
    ) {
      setError('공개 기간은 최대 30일까지 설정할 수 있습니다.')
      return
    }

    startTransition(async () => {
      const result = await approveSpecialLectureRequestAction(
        request.id,
        startsDate.toISOString(),
        expiresDate.toISOString()
      )
      if (result?.error) {
        setError(result.error)
        return
      }
      onOpenChange(false)
      resetWindow()
      router.refresh()
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (isPending) return
        onOpenChange(next)
        if (!next) setError(null)
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>영상 열어주기</DialogTitle>
          <DialogDescription className="text-sm text-slate-600">
            <span className="font-medium text-slate-800">{studentDisplayName(request)}</span> 학생에게{' '}
            <span className="font-medium text-slate-800">{request.lectureTitle}</span> 영상을 공개할
            기간을 지정하세요. 시작 전에는 보이지 않고, 종료 시각이 지나면 자동으로 비공개로
            전환됩니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`approve-starts-${request.id}`}>공개 시작</Label>
              <Input
                id={`approve-starts-${request.id}`}
                type="datetime-local"
                value={startsAt}
                onChange={(event) => setStartsAt(event.target.value)}
                disabled={isPending}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`approve-expires-${request.id}`}>공개 종료</Label>
              <Input
                id={`approve-expires-${request.id}`}
                type="datetime-local"
                value={expiresAt}
                onChange={(event) => setExpiresAt(event.target.value)}
                disabled={isPending}
              />
            </div>
          </div>

          <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs text-slate-500">
              시작 시각 기준으로 종료 시각을 빠르게 채웁니다.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setStartsAt(toLocalDatetimeInputValue(new Date()))}
                disabled={isPending}
              >
                지금 시작
              </Button>
              {SPECIAL_LECTURE_GRANT_PRESETS.map((preset) => (
                <Button
                  key={preset.hours}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => applyPreset(preset.hours)}
                  disabled={isPending}
                >
                  +{preset.label}
                </Button>
              ))}
            </div>
            {durationLabel ? (
              <p className="text-xs text-slate-600">
                공개 기간: <span className="font-medium text-slate-800">{durationLabel}</span>
                {startsDate && startsDate.getTime() > Date.now() ? ' · 예약 공개' : ''}
              </p>
            ) : null}
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            취소
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={isPending}>
            {isPending ? (
              <span className="flex items-center justify-center gap-2">
                <LoadingSpinner />
                처리 중...
              </span>
            ) : (
              '공개하기'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RejectDialog({ open, onOpenChange, request }: DialogProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [reason, setReason] = useState('')

  const handleSubmit = () => {
    setError(null)
    startTransition(async () => {
      const result = await rejectSpecialLectureRequestAction(request.id, reason)
      if (result?.error) {
        setError(result.error)
        return
      }
      onOpenChange(false)
      setReason('')
      router.refresh()
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (isPending) return
        onOpenChange(next)
        if (!next) setError(null)
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>신청 반려</DialogTitle>
          <DialogDescription className="text-sm text-slate-600">
            반려 사유는 학생 화면에 그대로 표시됩니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor={`reject-reason-${request.id}`}>반려 사유 (선택)</Label>
            <Textarea
              id={`reject-reason-${request.id}`}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="예: 특강비 납부가 확인되지 않았습니다."
              rows={3}
              disabled={isPending}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            취소
          </Button>
          <Button type="button" variant="destructive" onClick={handleSubmit} disabled={isPending}>
            {isPending ? (
              <span className="flex items-center justify-center gap-2">
                <LoadingSpinner />
                처리 중...
              </span>
            ) : (
              '반려하기'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
