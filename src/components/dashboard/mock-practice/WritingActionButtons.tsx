'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Lock, Trash2 } from 'lucide-react'

import {
  closeWritingSessionAction,
  deleteWritingSetAction,
} from '@/app/dashboard/teacher/mock-practice/writing/actions'
import { Button } from '@/components/ui/button'

export function WritingSetDeleteButton({ setId }: { setId: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const handleDelete = () => {
    if (!window.confirm('이 작문 세트를 삭제할까요? 오답노트 템플릿도 함께 삭제됩니다.')) {
      return
    }

    setError(null)
    startTransition(async () => {
      const result = await deleteWritingSetAction(setId)
      if (result.success) {
        router.refresh()
      } else {
        setError(result.error ?? '삭제에 실패했습니다.')
      }
    })
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-red-600">{error}</span>}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-red-600 hover:text-red-700"
        disabled={isPending}
        onClick={handleDelete}
      >
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        <span className="sr-only">세트 삭제</span>
      </Button>
    </div>
  )
}

export function WritingSessionCloseButton({ sessionId }: { sessionId: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const handleClose = () => {
    if (!window.confirm('이 회차를 마감할까요? 마감하면 아직 시작하지 않은 학생은 시험을 시작할 수 없습니다.')) {
      return
    }

    setError(null)
    startTransition(async () => {
      const result = await closeWritingSessionAction(sessionId)
      if (result.success) {
        router.refresh()
      } else {
        setError(result.error ?? '마감에 실패했습니다.')
      }
    })
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-red-600">{error}</span>}
      <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={handleClose}>
        {isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Lock className="mr-1 h-4 w-4" />}
        회차 마감
      </Button>
    </div>
  )
}
