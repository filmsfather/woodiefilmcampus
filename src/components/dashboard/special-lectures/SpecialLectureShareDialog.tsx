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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import {
  AudienceSelector,
  type AudienceClassOption,
  type AudienceStudentOption,
} from '@/components/dashboard/special-lectures/AudienceSelector'
import { createSpecialLectureGrantAction } from '@/app/dashboard/manager/special-lectures/actions'
import {
  SPECIAL_LECTURE_DEFAULT_GRANT_HOURS,
  SPECIAL_LECTURE_MAX_GRANT_HOURS,
} from '@/lib/special-lectures'

interface SpecialLectureShareDialogProps {
  lectureId: string
  lectureTitle: string
  classes: AudienceClassOption[]
  students: AudienceStudentOption[]
  triggerLabel?: string
  triggerDisabled?: boolean
}

const QUICK_PRESETS: Array<{ label: string; hours: number }> = [
  { label: '1시간', hours: 1 },
  { label: '6시간', hours: 6 },
  { label: '하루', hours: 24 },
  { label: '3일', hours: 24 * 3 },
  { label: '7일', hours: 24 * 7 },
]

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
  const [hours, setHours] = useState<number>(SPECIAL_LECTURE_DEFAULT_GRANT_HOURS)

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    const form = event.currentTarget
    const formData = new FormData(form)
    formData.set('expires_hours', String(hours))

    startTransition(async () => {
      const result = await createSpecialLectureGrantAction(lectureId, formData)
      if (result?.error) {
        setError(result.error)
        return
      }
      if (result?.success) {
        setOpen(false)
        setHours(SPECIAL_LECTURE_DEFAULT_GRANT_HOURS)
        router.refresh()
      }
    })
  }

  const handleOpenChange = (next: boolean) => {
    if (isPending) return
    setOpen(next)
    if (!next) {
      setError(null)
      setHours(SPECIAL_LECTURE_DEFAULT_GRANT_HOURS)
    }
  }

  const expiresPreviewLabel = (() => {
    if (!Number.isFinite(hours) || hours <= 0) return null
    const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000)
    return new Intl.DateTimeFormat('ko', { dateStyle: 'medium', timeStyle: 'short' }).format(expiresAt)
  })()

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
            를(을) 시청할 학생을 선택하고 공개 기간을 설정하세요. 저장하면 즉시 반영됩니다.
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

          <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3">
            <Label htmlFor="expires_hours" className="text-sm text-slate-800">
              공개 기간 (시간)
            </Label>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                id="expires_hours"
                type="number"
                min={1}
                max={SPECIAL_LECTURE_MAX_GRANT_HOURS}
                step={1}
                value={Number.isFinite(hours) ? hours : ''}
                onChange={(event) => {
                  const next = Number(event.target.value)
                  if (Number.isFinite(next) && next > 0) {
                    setHours(Math.min(next, SPECIAL_LECTURE_MAX_GRANT_HOURS))
                  } else {
                    setHours(0)
                  }
                }}
                disabled={isPending}
                className="w-32 bg-white"
              />
              <span className="text-xs text-slate-500">시간 (기본 24시간, 최대 30일)</span>
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

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isPending}
            >
              취소
            </Button>
            <Button type="submit" disabled={isPending || hours <= 0}>
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
