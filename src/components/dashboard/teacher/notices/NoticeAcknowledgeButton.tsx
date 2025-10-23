'use client'

import { useState, useTransition } from 'react'

import { acknowledgeNotice } from '@/app/dashboard/teacher/notices/actions'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { LoadingSpinner } from '@/components/ui/loading-spinner'

interface NoticeAcknowledgeButtonProps {
  noticeId: string
  initialAcknowledgedAt: string | null
  disabled?: boolean
}

export function NoticeAcknowledgeButton({
  noticeId,
  initialAcknowledgedAt,
  disabled,
}: NoticeAcknowledgeButtonProps) {
  const [acknowledgedAt, setAcknowledgedAt] = useState<string | null>(initialAcknowledgedAt)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const handleClick = () => {
    if (acknowledgedAt) {
      return
    }

    setError(null)

    startTransition(async () => {
      const formData = new FormData()
      formData.set('noticeId', noticeId)

      const result = await acknowledgeNotice(formData)

      if (result?.error) {
        setError(result.error)
        return
      }

      setAcknowledgedAt(result?.acknowledgedAt ?? new Date().toISOString())
    })
  }

  if (acknowledgedAt) {
    return (
      <div className="rounded-md border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
        공지를 {new Intl.DateTimeFormat('ko', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(acknowledgedAt))}
        에 확인했습니다.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <Button type="button" disabled={disabled || isPending} onClick={handleClick} className="w-full md:w-auto">
        {isPending ? (
          <span className="flex items-center gap-2">
            <LoadingSpinner className="h-4 w-4" /> 확인 중...
          </span>
        ) : (
          '공지 확인'
        )}
      </Button>
    </div>
  )
}
