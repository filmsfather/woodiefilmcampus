'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { syncEnrollmentApplicationStatuses } from '@/app/dashboard/manager/enrollment/actions'
import { Button } from '@/components/ui/button'
import { LoadingSpinner } from '@/components/ui/loading-spinner'

interface EnrollmentStatusSyncButtonProps {
  hasPending: boolean
}

interface FeedbackMessage {
  type: 'success' | 'error'
  text: string
}

export function EnrollmentStatusSyncButton({ hasPending }: EnrollmentStatusSyncButtonProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<FeedbackMessage | null>(null)

  const handleClick = () => {
    setFeedback(null)

    startTransition(async () => {
      const result = await syncEnrollmentApplicationStatuses()

      if (!result || 'error' in result) {
        setFeedback({ type: 'error', text: result?.error ?? '상태를 갱신하지 못했습니다.' })
        return
      }

      if (result.updated === 0) {
        setFeedback({ type: 'success', text: '갱신할 상태가 없습니다.' })
      } else {
        setFeedback({ type: 'success', text: `${result.updated}건의 상태를 갱신했습니다.` })
      }

      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <Button
        variant="outline"
        onClick={handleClick}
        disabled={isPending || !hasPending}
        className="w-full justify-center gap-2 sm:w-auto"
      >
        {isPending ? (
          <>
            <LoadingSpinner />
            상태 갱신 중...
          </>
        ) : (
          '상태 일괄 갱신'
        )}
      </Button>
      {feedback ? (
        <p
          className={
            feedback.type === 'error'
              ? 'text-sm text-rose-600'
              : 'text-sm text-emerald-600'
          }
        >
          {feedback.text}
        </p>
      ) : (
        <p className="text-sm text-slate-500">미확인 · 가입완료 상태의 등록원서를 한 번에 검사합니다.</p>
      )}
    </div>
  )
}
