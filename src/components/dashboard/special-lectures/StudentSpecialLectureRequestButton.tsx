'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { Button } from '@/components/ui/button'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import {
  cancelSpecialLectureRequestAction,
  requestSpecialLectureAction,
} from '@/app/dashboard/student/special-lectures/actions'

interface StudentSpecialLectureRequestButtonProps {
  lectureId: string
  requestId?: string | null
  mode: 'request' | 'cancel'
  size?: 'sm' | 'default'
  className?: string
}

export function StudentSpecialLectureRequestButton({
  lectureId,
  requestId,
  mode,
  size = 'sm',
  className,
}: StudentSpecialLectureRequestButtonProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const handleClick = () => {
    if (mode === 'cancel' && !window.confirm('신청을 취소할까요?')) {
      return
    }

    setError(null)
    startTransition(async () => {
      const result =
        mode === 'request'
          ? await requestSpecialLectureAction(lectureId)
          : await cancelSpecialLectureRequestAction(requestId ?? '')

      if (result?.error) {
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className={className}>
      <Button
        type="button"
        size={size}
        variant={mode === 'request' ? 'default' : 'outline'}
        onClick={handleClick}
        disabled={isPending}
      >
        {isPending ? (
          <span className="flex items-center justify-center gap-2">
            <LoadingSpinner />
            처리 중...
          </span>
        ) : mode === 'request' ? (
          '신청하기'
        ) : (
          '신청 취소'
        )}
      </Button>
      {error ? <p className="mt-1 text-xs text-rose-600">{error}</p> : null}
    </div>
  )
}
