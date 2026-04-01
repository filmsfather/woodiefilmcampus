'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { Button } from '@/components/ui/button'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { closeNoticeApplications, reopenNoticeApplications } from '@/app/dashboard/teacher/notices/actions'

interface CloseApplicationButtonProps {
  noticeId: string
  isClosed: boolean
  closedAt?: string | null
}

function formatKoreanDate(dateIso: string) {
  return new Intl.DateTimeFormat('ko', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(dateIso))
}

export function CloseApplicationButton({ noticeId, isClosed, closedAt }: CloseApplicationButtonProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const handleClose = () => {
    if (!confirm('신청을 마감하시겠습니까? 마감 후에는 새로운 신청 및 취소가 불가합니다.')) return

    startTransition(async () => {
      const result = await closeNoticeApplications(noticeId)
      if (result.error) {
        alert(result.error)
      } else {
        router.refresh()
      }
    })
  }

  const handleReopen = () => {
    if (!confirm('신청 마감을 해제하시겠습니까? 다시 신청을 받을 수 있게 됩니다.')) return

    startTransition(async () => {
      const result = await reopenNoticeApplications(noticeId)
      if (result.error) {
        alert(result.error)
      } else {
        router.refresh()
      }
    })
  }

  if (isClosed) {
    return (
      <div className="flex items-center gap-2">
        {closedAt && (
          <span className="text-xs text-slate-500">
            {formatKoreanDate(closedAt)} 마감
          </span>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={handleReopen}
          disabled={isPending}
        >
          {isPending ? <LoadingSpinner className="mr-2 h-4 w-4" /> : null}
          마감 해제
        </Button>
      </div>
    )
  }

  return (
    <Button
      variant="destructive"
      size="sm"
      onClick={handleClose}
      disabled={isPending}
    >
      {isPending ? <LoadingSpinner className="mr-2 h-4 w-4" /> : null}
      신청 마감
    </Button>
  )
}
