'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

import {
  closeExamSessionAction,
  deleteExamAction,
  duplicateExamAction,
} from '@/app/dashboard/principal/exams/actions'
import { Button } from '@/components/ui/button'

export function ExamListActions({ examId, canDelete }: { examId: string; canDelete: boolean }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const handleDuplicate = () => {
    setError(null)
    startTransition(async () => {
      const result = await duplicateExamAction(examId)
      if (result.success && result.id) {
        router.push(`/dashboard/principal/exams/${result.id}`)
        router.refresh()
      } else if (result.error) {
        setError(result.error)
      }
    })
  }

  const handleDelete = () => {
    if (!window.confirm('이 시험 세트를 삭제할까요?')) return
    setError(null)
    startTransition(async () => {
      const result = await deleteExamAction(examId)
      if (result.success) {
        router.refresh()
      } else if (result.error) {
        setError(result.error)
      }
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={isPending} onClick={handleDuplicate}>
          {isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
          복제
        </Button>
        {canDelete && (
          <Button
            variant="outline"
            size="sm"
            className="border-red-200 text-red-600 hover:bg-red-50"
            disabled={isPending}
            onClick={handleDelete}
          >
            삭제
          </Button>
        )}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}

export function SessionCloseButton({ sessionId }: { sessionId: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const handleClose = () => {
    if (!window.confirm('이 회차를 마감할까요? 마감 후에는 학생이 응시할 수 없습니다.')) return
    setError(null)
    startTransition(async () => {
      const result = await closeExamSessionAction(sessionId)
      if (result.success) {
        router.refresh()
      } else if (result.error) {
        setError(result.error)
      }
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="outline" size="sm" disabled={isPending} onClick={handleClose}>
        {isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
        회차 마감
      </Button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
