'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, Loader2, Trash2 } from 'lucide-react'

import {
  deletePracticeProblemAction,
  togglePracticeProblemAction,
} from '@/app/dashboard/teacher/mock-practice/problems/actions'
import { Button } from '@/components/ui/button'

export function PracticeProblemActions({
  problemId,
  isActive,
  usageCount,
}: {
  problemId: string
  isActive: boolean
  usageCount: number
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const handleToggle = () => {
    setError(null)
    startTransition(async () => {
      const result = await togglePracticeProblemAction(problemId, !isActive)
      if (result.success) {
        router.refresh()
      } else {
        setError(result.error ?? '상태 변경에 실패했습니다.')
      }
    })
  }

  const handleDelete = () => {
    if (!window.confirm('이 문제를 삭제할까요? 문항, 이미지, 채점표가 함께 삭제됩니다.')) {
      return
    }

    setError(null)
    startTransition(async () => {
      const result = await deletePracticeProblemAction(problemId)
      if (result.success) {
        router.refresh()
      } else {
        setError(result.error ?? '삭제에 실패했습니다.')
      }
    })
  }

  return (
    <div className="flex items-center gap-1">
      {error && <span className="mr-1 text-xs text-red-600">{error}</span>}
      <Button type="button" variant="ghost" size="sm" disabled={isPending} onClick={handleToggle}>
        {isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : isActive ? (
          <EyeOff className="h-4 w-4" />
        ) : (
          <Eye className="h-4 w-4" />
        )}
        <span className="sr-only">{isActive ? '비활성화' : '활성화'}</span>
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-red-600 hover:text-red-700"
        disabled={isPending || usageCount > 0}
        title={usageCount > 0 ? '이미 배정된 문제는 삭제할 수 없습니다.' : '문제 삭제'}
        onClick={handleDelete}
      >
        <Trash2 className="h-4 w-4" />
        <span className="sr-only">문제 삭제</span>
      </Button>
    </div>
  )
}
