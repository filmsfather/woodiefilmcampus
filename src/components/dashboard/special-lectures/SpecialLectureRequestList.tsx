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
  SPECIAL_LECTURE_MAX_GRANT_HOURS,
  SPECIAL_LECTURE_REQUEST_STATUS_LABELS,
  type SpecialLectureRequest,
} from '@/lib/special-lectures'

interface SpecialLectureRequestListProps {
  requests: SpecialLectureRequest[]
}

const QUICK_PRESETS: Array<{ label: string; hours: number }> = [
  { label: '1시간', hours: 1 },
  { label: '6시간', hours: 6 },
  { label: '하루', hours: 24 },
  { label: '3일', hours: 24 * 3 },
  { label: '7일', hours: 24 * 7 },
]

const dateFormatter = new Intl.DateTimeFormat('ko', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

function studentDisplayName(request: SpecialLectureRequest) {
  return request.studentName ?? request.studentEmail ?? '이름 없음'
}

function statusBadgeVariant(status: SpecialLectureRequest['status']) {
  if (status === 'requested') return 'default' as const
  if (status === 'approved') return 'secondary' as const
  return 'outline' as const
}

function describeGrant(request: SpecialLectureRequest) {
  if (!request.grantExpiresAt) return null
  if (request.grantRevokedAt) {
    return `공개 해지됨 (${dateFormatter.format(new Date(request.grantRevokedAt))})`
  }
  const expiresAt = new Date(request.grantExpiresAt)
  if (expiresAt.getTime() <= Date.now()) {
    return `공개 만료됨 (${dateFormatter.format(expiresAt)})`
  }
  return `${dateFormatter.format(expiresAt)}까지 공개`
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

function ApproveDialog({ open, onOpenChange, request }: DialogProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [hours, setHours] = useState<number>(SPECIAL_LECTURE_DEFAULT_GRANT_HOURS)

  const expiresPreviewLabel = (() => {
    if (!Number.isFinite(hours) || hours <= 0) return null
    return dateFormatter.format(new Date(Date.now() + hours * 60 * 60 * 1000))
  })()

  const handleSubmit = () => {
    setError(null)
    startTransition(async () => {
      const result = await approveSpecialLectureRequestAction(request.id, hours)
      if (result?.error) {
        setError(result.error)
        return
      }
      onOpenChange(false)
      setHours(SPECIAL_LECTURE_DEFAULT_GRANT_HOURS)
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
            <span className="font-medium text-slate-800">{request.lectureTitle}</span> 영상을
            공개합니다. 공개 기간이 지나면 자동으로 비공개로 전환됩니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor={`approve-hours-${request.id}`}>공개 기간 (시간)</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                id={`approve-hours-${request.id}`}
                type="number"
                min={1}
                max={SPECIAL_LECTURE_MAX_GRANT_HOURS}
                step={1}
                value={Number.isFinite(hours) && hours > 0 ? hours : ''}
                onChange={(event) => {
                  const next = Number(event.target.value)
                  if (Number.isFinite(next) && next > 0) {
                    setHours(Math.min(next, SPECIAL_LECTURE_MAX_GRANT_HOURS))
                  } else {
                    setHours(0)
                  }
                }}
                disabled={isPending}
                className="w-32"
              />
              <span className="text-xs text-slate-500">기본 24시간, 최대 30일</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {QUICK_PRESETS.map((preset) => (
                <Button
                  key={preset.hours}
                  type="button"
                  variant={hours === preset.hours ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setHours(preset.hours)}
                  disabled={isPending}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
            {expiresPreviewLabel ? (
              <p className="text-xs text-slate-600">
                만료 예정: <span className="font-medium text-slate-800">{expiresPreviewLabel}</span>
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
          <Button type="button" onClick={handleSubmit} disabled={isPending || hours <= 0}>
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
