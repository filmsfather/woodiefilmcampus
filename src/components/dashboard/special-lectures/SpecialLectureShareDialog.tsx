'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import {
  AudienceSelector,
  type AudienceClassOption,
  type AudienceStudentOption,
} from '@/components/dashboard/special-lectures/AudienceSelector'
import { GrantWindowFields } from '@/components/dashboard/special-lectures/GrantWindowFields'
import { createSpecialLectureGrantAction } from '@/app/dashboard/manager/special-lectures/actions'
import {
  defaultSpecialLectureGrantWindow,
  parseLocalDatetimeInputValue,
  validateSpecialLectureGrantWindow,
} from '@/lib/special-lectures'

interface SpecialLectureShareDialogProps {
  lectureId: string
  lectureTitle: string
  classes: AudienceClassOption[]
  students: AudienceStudentOption[]
  triggerLabel?: string
  triggerDisabled?: boolean
}

export function SpecialLectureShareDialog({
  lectureId,
  lectureTitle,
  classes,
  students,
  triggerLabel = '영상 공개',
  triggerDisabled = false,
}: SpecialLectureShareDialogProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [initial] = useState(() => defaultSpecialLectureGrantWindow())
  const [startsAt, setStartsAt] = useState<string>(initial.startsAt)
  const [expiresAt, setExpiresAt] = useState<string>(initial.expiresAt)

  const resetWindow = () => {
    const next = defaultSpecialLectureGrantWindow()
    setStartsAt(next.startsAt)
    setExpiresAt(next.expiresAt)
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    const grantWindow = validateSpecialLectureGrantWindow(
      parseLocalDatetimeInputValue(startsAt),
      parseLocalDatetimeInputValue(expiresAt)
    )
    if (!grantWindow.ok) {
      setError(grantWindow.error)
      return
    }

    const form = event.currentTarget
    const formData = new FormData(form)
    formData.set('starts_at', grantWindow.startsAt.toISOString())
    formData.set('expires_at', grantWindow.expiresAt.toISOString())

    startTransition(async () => {
      const result = await createSpecialLectureGrantAction(lectureId, formData)
      if (result?.error) {
        setError(result.error)
        return
      }
      if (result?.success) {
        setOpen(false)
        resetWindow()
        router.refresh()
      }
    })
  }

  // 다이얼로그가 오래 떠 있어도 "지금 시작" 기본값이 낡지 않도록 열고 닫을 때마다 다시 계산한다.
  const handleOpenChange = (next: boolean) => {
    if (isPending) return
    setOpen(next)
    setError(null)
    resetWindow()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" disabled={triggerDisabled}>
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>영상 공개</DialogTitle>
          <DialogDescription className="text-sm text-slate-600">
            <span className="font-medium text-slate-800">{lectureTitle}</span>
            를(을) 시청할 학생을 선택하고 공개 구간을 지정하세요. 시작 전에는 보이지 않고, 종료
            시각이 지나면 자동으로 비공개로 전환됩니다.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <AudienceSelector
            classes={classes}
            students={students}
            defaultMode="class"
            disabled={isPending}
          />

          <GrantWindowFields
            idPrefix={`share-${lectureId}`}
            startsAt={startsAt}
            expiresAt={expiresAt}
            onStartsAtChange={setStartsAt}
            onExpiresAtChange={setExpiresAt}
            disabled={isPending}
          />

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isPending}
            >
              취소
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? (
                <span className="flex items-center justify-center gap-2">
                  <LoadingSpinner />
                  저장 중...
                </span>
              ) : (
                '공개하기'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
