'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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
import {
  extendSpecialLectureGrantAction,
  revokeSpecialLectureGrantAction,
} from '@/app/dashboard/manager/special-lectures/actions'
import {
  SPECIAL_LECTURE_AUDIENCE_LABELS,
  SPECIAL_LECTURE_DEFAULT_GRANT_HOURS,
  SPECIAL_LECTURE_MAX_GRANT_HOURS,
  type SpecialLectureGrant,
} from '@/lib/special-lectures'

interface SpecialLectureGrantListProps {
  grants: SpecialLectureGrant[]
  classNameById: Record<string, string>
  studentNameById: Record<string, string>
}

type GrantStatus = 'active' | 'revoked' | 'expired'

const dateFormatter = new Intl.DateTimeFormat('ko', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

function deriveStatus(grant: SpecialLectureGrant): GrantStatus {
  if (grant.revokedAt) return 'revoked'
  if (new Date(grant.expiresAt).getTime() <= Date.now()) return 'expired'
  return 'active'
}

function statusLabel(status: GrantStatus) {
  switch (status) {
    case 'active':
      return '공개 중'
    case 'expired':
      return '만료됨'
    case 'revoked':
      return '해지됨'
  }
}

function formatRemaining(expiresAt: string) {
  const diffMs = new Date(expiresAt).getTime() - Date.now()
  if (diffMs <= 0) return '만료됨'
  const totalMinutes = Math.floor(diffMs / (60 * 1000))
  const days = Math.floor(totalMinutes / (60 * 24))
  const hours = Math.floor((totalMinutes - days * 60 * 24) / 60)
  const minutes = totalMinutes - days * 60 * 24 - hours * 60
  if (days > 0) return `${days}일 ${hours}시간 남음`
  if (hours > 0) return `${hours}시간 ${minutes}분 남음`
  return `${minutes}분 남음`
}

function toLocalDatetimeInputValue(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function SpecialLectureGrantList({
  grants,
  classNameById,
  studentNameById,
}: SpecialLectureGrantListProps) {
  const sortedGrants = useMemo(() => {
    const score = (grant: SpecialLectureGrant) => {
      const status = deriveStatus(grant)
      if (status === 'active') return 0
      if (status === 'expired') return 1
      return 2
    }
    return [...grants].sort((a, b) => {
      const diff = score(a) - score(b)
      if (diff !== 0) return diff
      return b.createdAt.localeCompare(a.createdAt)
    })
  }, [grants])

  if (sortedGrants.length === 0) {
    return (
      <Card className="border-slate-200 bg-slate-50">
        <CardHeader>
          <CardTitle className="text-base text-slate-800">아직 공개된 적이 없습니다.</CardTitle>
          <CardDescription className="text-sm text-slate-600">
            상단의 <span className="font-medium">영상 공개</span> 버튼으로 학생에게 공개를
            시작하세요.
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      {sortedGrants.map((grant) => (
        <GrantCard
          key={grant.id}
          grant={grant}
          classNameById={classNameById}
          studentNameById={studentNameById}
        />
      ))}
    </div>
  )
}

interface GrantCardProps {
  grant: SpecialLectureGrant
  classNameById: Record<string, string>
  studentNameById: Record<string, string>
}

function GrantCard({ grant, classNameById, studentNameById }: GrantCardProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [extendOpen, setExtendOpen] = useState(false)

  const status = deriveStatus(grant)

  const handleRevoke = () => {
    if (!window.confirm('이 공개를 지금 종료할까요? 해당 대상 학생들은 즉시 시청할 수 없게 됩니다.')) {
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await revokeSpecialLectureGrantAction(grant.id)
      if (result?.error) {
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  const statusBadgeVariant: 'default' | 'secondary' | 'outline' =
    status === 'active' ? 'default' : status === 'expired' ? 'secondary' : 'outline'

  return (
    <Card className="border-slate-200">
      <CardHeader className="space-y-2 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={statusBadgeVariant}>{statusLabel(status)}</Badge>
          <Badge variant="outline" className="border-slate-300 text-slate-600">
            {SPECIAL_LECTURE_AUDIENCE_LABELS[grant.audienceMode]}
          </Badge>
          <span className="text-xs text-slate-500">
            {status === 'active'
              ? formatRemaining(grant.expiresAt)
              : `만료 ${dateFormatter.format(new Date(grant.expiresAt))}`}
          </span>
        </div>
        <CardDescription className="text-xs text-slate-500">
          공개 일시 {dateFormatter.format(new Date(grant.createdAt))}
          {grant.revokedAt
            ? ` · 해지 ${dateFormatter.format(new Date(grant.revokedAt))}`
            : ''}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {grant.audienceMode === 'all_students' ? (
          <p className="text-sm text-slate-700">전체 학생에게 공개됩니다.</p>
        ) : (
          <div className="space-y-2">
            {grant.classIds.length > 0 ? (
              <div>
                <p className="mb-1 text-xs text-slate-500">반</p>
                <div className="flex flex-wrap gap-1">
                  {grant.classIds.map((id) => (
                    <Badge key={id} variant="secondary" className="text-xs">
                      {classNameById[id] ?? '알 수 없는 반'}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}
            {grant.studentIds.length > 0 ? (
              <div>
                <p className="mb-1 text-xs text-slate-500">학생</p>
                <div className="flex flex-wrap gap-1">
                  {grant.studentIds.map((id) => (
                    <Badge key={id} variant="outline" className="border-slate-300 text-xs text-slate-700">
                      {studentNameById[id] ?? '알 수 없는 학생'}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}
            {grant.classIds.length === 0 && grant.studentIds.length === 0 ? (
              <p className="text-xs text-slate-500">대상이 비어 있는 공개 기록입니다.</p>
            ) : null}
          </div>
        )}

        {status === 'active' ? (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setExtendOpen(true)}
              disabled={isPending}
            >
              만료 시각 변경
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleRevoke}
              disabled={isPending}
            >
              {isPending ? (
                <span className="flex items-center justify-center gap-2">
                  <LoadingSpinner />
                  종료 중...
                </span>
              ) : (
                '공개 종료'
              )}
            </Button>
          </div>
        ) : null}

        {status !== 'active' ? (
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setExtendOpen(true)}
              disabled={isPending}
            >
              다시 공개 (만료 시각 설정)
            </Button>
          </div>
        ) : null}
      </CardContent>

      <ExtendGrantDialog
        open={extendOpen}
        onOpenChange={setExtendOpen}
        grant={grant}
      />
    </Card>
  )
}

interface ExtendGrantDialogProps {
  open: boolean
  onOpenChange: (next: boolean) => void
  grant: SpecialLectureGrant
}

function ExtendGrantDialog({ open, onOpenChange, grant }: ExtendGrantDialogProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [value, setValue] = useState<string>(() => {
    const base = new Date(grant.expiresAt)
    const next = base.getTime() > Date.now()
      ? base
      : new Date(Date.now() + SPECIAL_LECTURE_DEFAULT_GRANT_HOURS * 60 * 60 * 1000)
    return toLocalDatetimeInputValue(next)
  })

  const handleQuickAdd = (hours: number) => {
    const next = new Date(Date.now() + hours * 60 * 60 * 1000)
    setValue(toLocalDatetimeInputValue(next))
  }

  const handleSubmit = () => {
    setError(null)
    if (!value) {
      setError('만료 시각을 입력해주세요.')
      return
    }
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) {
      setError('만료 시각이 올바르지 않습니다.')
      return
    }
    if (parsed.getTime() <= Date.now()) {
      setError('만료 시각은 현재 시각보다 이후여야 합니다.')
      return
    }
    const maxAllowed = Date.now() + SPECIAL_LECTURE_MAX_GRANT_HOURS * 60 * 60 * 1000
    if (parsed.getTime() > maxAllowed) {
      setError('만료 시각은 최대 30일 이내로 설정해주세요.')
      return
    }

    startTransition(async () => {
      const result = await extendSpecialLectureGrantAction(grant.id, parsed.toISOString())
      if (result?.error) {
        setError(result.error)
        return
      }
      onOpenChange(false)
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
          <DialogTitle>만료 시각 변경</DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            저장하면 해지 상태도 함께 해제되어 다시 공개됩니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor={`expires-input-${grant.id}`}>만료 시각</Label>
            <Input
              id={`expires-input-${grant.id}`}
              type="datetime-local"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              disabled={isPending}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {[1, 6, 24, 24 * 3, 24 * 7].map((preset) => (
              <Button
                key={preset}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleQuickAdd(preset)}
                disabled={isPending}
              >
                지금 + {preset >= 24 ? `${preset / 24}일` : `${preset}시간`}
              </Button>
            ))}
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
                저장 중...
              </span>
            ) : (
              '저장'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
