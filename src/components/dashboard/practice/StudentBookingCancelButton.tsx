'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

import { cancelPracticeBookingAction } from '@/app/dashboard/practice-feedback/booking-actions'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'

interface StudentBookingCancelButtonProps {
  bookingId: string
  /** 확인 문구에 보여줄 예약 요약 (예: "3월 2일 14:00 · 중앙대 · 실기글쓰기") */
  summary: string
}

export function StudentBookingCancelButton({ bookingId, summary }: StudentBookingCancelButtonProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const handleCancel = () => {
    setError(null)
    startTransition(async () => {
      const result = await cancelPracticeBookingAction({ bookingId })
      if (result.error) {
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button size="sm" variant="outline" disabled={isPending} className="text-red-600 hover:text-red-700">
            {isPending && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
            예약 취소
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>모의실기 예약을 취소할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              {summary}
              <br />
              취소한 자리는 다른 학생이 예약할 수 있으며, 다시 응시하려면 새로 예약해야 합니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>돌아가기</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancel}
              disabled={isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              예약 취소
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  )
}
