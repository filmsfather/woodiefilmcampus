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
import { Label } from '@/components/ui/label'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { Textarea } from '@/components/ui/textarea'
import { GrantWindowFields } from '@/components/dashboard/special-lectures/GrantWindowFields'
import {
  approveSpecialLectureRequestAction,
  extendSpecialLectureGrantAction,
  rejectSpecialLectureRequestAction,
  reopenSpecialLectureRequestAction,
  revertSpecialLectureRequestToRejectedAction,
} from '@/app/dashboard/manager/special-lectures/actions'
import {
  SPECIAL_LECTURE_DEFAULT_GRANT_HOURS,
  SPECIAL_LECTURE_REQUEST_STATUS_LABELS,
  defaultSpecialLectureGrantWindow,
  parseLocalDatetimeInputValue,
  toLocalDatetimeInputValue,
  validateSpecialLectureGrantWindow,
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
  const [grantWindowMode, setGrantWindowMode] = useState<GrantWindowMode | null>(null)
  const [rejectMode, setRejectMode] = useState<RejectMode | null>(null)

  const grantLabel = describeGrant(request)

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

      <div className="flex shrink-0 flex-wrap gap-2">
        {request.status === 'requested' ? (
          <>
            <Button type="button" size="sm" onClick={() => setGrantWindowMode('approve')}>
              열어주기
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setRejectMode('reject')}
            >
              반려
            </Button>
          </>
        ) : null}

        {request.status === 'approved' ? (
          <>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setGrantWindowMode('edit')}
            >
              기간 수정
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setRejectMode('revert')}
            >
              반려로 변경
            </Button>
          </>
        ) : null}

        {request.status === 'rejected' || request.status === 'cancelled' ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setGrantWindowMode('reopen')}
          >
            다시 열어주기
          </Button>
        ) : null}
      </div>

      {grantWindowMode ? (
        <GrantWindowDialog
          mode={grantWindowMode}
          request={request}
          onClose={() => setGrantWindowMode(null)}
        />
      ) : null}
      {rejectMode ? (
        <RejectDialog mode={rejectMode} request={request} onClose={() => setRejectMode(null)} />
      ) : null}
    </div>
  )
}

type GrantWindowMode = 'approve' | 'reopen' | 'edit'
type RejectMode = 'reject' | 'revert'

const GRANT_WINDOW_COPY: Record<GrantWindowMode, { title: string; submitLabel: string }> = {
  approve: { title: '영상 열어주기', submitLabel: '공개하기' },
  reopen: { title: '영상 다시 열어주기', submitLabel: '다시 공개하기' },
  edit: { title: '공개 기간 수정', submitLabel: '기간 저장' },
}

/** 기간 수정은 기존 공개 기간을 그대로 보여주되, 이미 지난 종료 시각은 기본값으로 되돌린다. */
function initialWindow(mode: GrantWindowMode, request: SpecialLectureRequest) {
  const fallback = defaultSpecialLectureGrantWindow()
  if (mode !== 'edit' || !request.grantStartsAt) {
    return fallback
  }

  const startsDate = new Date(request.grantStartsAt)
  const expiresDate = request.grantExpiresAt ? new Date(request.grantExpiresAt) : null

  if (Number.isNaN(startsDate.getTime())) {
    return fallback
  }

  if (expiresDate && !Number.isNaN(expiresDate.getTime()) && expiresDate.getTime() > Date.now()) {
    return {
      startsAt: toLocalDatetimeInputValue(startsDate),
      expiresAt: toLocalDatetimeInputValue(expiresDate),
    }
  }

  const base = startsDate.getTime() > Date.now() ? startsDate : new Date()
  return {
    startsAt: toLocalDatetimeInputValue(startsDate),
    expiresAt: toLocalDatetimeInputValue(
      new Date(base.getTime() + SPECIAL_LECTURE_DEFAULT_GRANT_HOURS * 60 * 60 * 1000)
    ),
  }
}

function GrantWindowDialog({
  mode,
  request,
  onClose,
}: {
  mode: GrantWindowMode
  request: SpecialLectureRequest
  onClose: () => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [initial] = useState(() => initialWindow(mode, request))
  const [startsAt, setStartsAt] = useState<string>(initial.startsAt)
  const [expiresAt, setExpiresAt] = useState<string>(initial.expiresAt)

  const copy = GRANT_WINDOW_COPY[mode]

  const handleSubmit = () => {
    setError(null)

    const grantWindow = validateSpecialLectureGrantWindow(
      parseLocalDatetimeInputValue(startsAt),
      parseLocalDatetimeInputValue(expiresAt)
    )
    if (!grantWindow.ok) {
      setError(grantWindow.error)
      return
    }

    const startsAtIso = grantWindow.startsAt.toISOString()
    const expiresAtIso = grantWindow.expiresAt.toISOString()
    const grantId = request.grantId

    if (mode === 'edit' && !grantId) {
      setError('공개 정보를 찾을 수 없어 기간을 수정할 수 없습니다.')
      return
    }

    const runAction = () => {
      if (mode === 'edit' && grantId) {
        return extendSpecialLectureGrantAction(grantId, expiresAtIso, startsAtIso)
      }
      if (mode === 'reopen') {
        return reopenSpecialLectureRequestAction(request.id, startsAtIso, expiresAtIso)
      }
      return approveSpecialLectureRequestAction(request.id, startsAtIso, expiresAtIso)
    }

    startTransition(async () => {
      const result = await runAction()

      if (result?.error) {
        setError(result.error)
        return
      }
      onClose()
      router.refresh()
    })
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (isPending || next) return
        onClose()
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription className="text-sm text-slate-600">
            <span className="font-medium text-slate-800">{studentDisplayName(request)}</span> 학생에게{' '}
            <span className="font-medium text-slate-800">{request.lectureTitle}</span> 영상을 공개할
            기간을 지정하세요. 시작 전에는 보이지 않고, 종료 시각이 지나면 자동으로 비공개로
            전환됩니다.
            {mode === 'reopen'
              ? ' 반려 사유는 지워지고 승인 상태로 바뀝니다.'
              : ''}
            {mode === 'edit'
              ? ' 이미 해지되었거나 기간이 지난 공개도 다시 살아납니다.'
              : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <GrantWindowFields
            idPrefix={`grant-${request.id}`}
            startsAt={startsAt}
            expiresAt={expiresAt}
            onStartsAtChange={setStartsAt}
            onExpiresAtChange={setExpiresAt}
            disabled={isPending}
          />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
            취소
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={isPending}>
            {isPending ? (
              <span className="flex items-center justify-center gap-2">
                <LoadingSpinner />
                처리 중...
              </span>
            ) : (
              copy.submitLabel
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RejectDialog({
  mode,
  request,
  onClose,
}: {
  mode: RejectMode
  request: SpecialLectureRequest
  onClose: () => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [reason, setReason] = useState('')

  const isRevert = mode === 'revert'

  const handleSubmit = () => {
    setError(null)
    startTransition(async () => {
      const result = isRevert
        ? await revertSpecialLectureRequestToRejectedAction(request.id, reason)
        : await rejectSpecialLectureRequestAction(request.id, reason)
      if (result?.error) {
        setError(result.error)
        return
      }
      onClose()
      router.refresh()
    })
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (isPending || next) return
        onClose()
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isRevert ? '승인 취소 후 반려' : '신청 반려'}</DialogTitle>
          <DialogDescription className="text-sm text-slate-600">
            {isRevert
              ? '이미 공개된 영상이 즉시 비공개로 전환됩니다. 반려 사유는 학생 화면에 그대로 표시됩니다.'
              : '반려 사유는 학생 화면에 그대로 표시됩니다.'}
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
          <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
            취소
          </Button>
          <Button type="button" variant="destructive" onClick={handleSubmit} disabled={isPending}>
            {isPending ? (
              <span className="flex items-center justify-center gap-2">
                <LoadingSpinner />
                처리 중...
              </span>
            ) : isRevert ? (
              '공개 해지하고 반려'
            ) : (
              '반려하기'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
