'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Star, Trash2 } from 'lucide-react'

import {
  deleteInterviewSheetTemplateAction,
  setDefaultInterviewSheetTemplateAction,
} from '@/app/dashboard/teacher/mock-practice/interview-sheet/actions'
import { Button } from '@/components/ui/button'

export function InterviewSheetTemplateDeleteButton({ templateId }: { templateId: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const handleDelete = () => {
    if (!window.confirm('이 템플릿을 삭제할까요? 이미 학생 면접지에 복사된 질문은 유지됩니다.')) {
      return
    }

    setError(null)
    startTransition(async () => {
      const result = await deleteInterviewSheetTemplateAction(templateId)
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
        <span className="sr-only">템플릿 삭제</span>
      </Button>
    </div>
  )
}

export function InterviewSheetTemplateSetDefaultButton({ templateId }: { templateId: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const handleSetDefault = () => {
    setError(null)
    startTransition(async () => {
      const result = await setDefaultInterviewSheetTemplateAction(templateId)
      if (result.success) {
        router.refresh()
      } else {
        setError(result.error ?? '기본 템플릿 설정에 실패했습니다.')
      }
    })
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-red-600">{error}</span>}
      <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={handleSetDefault}>
        {isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Star className="mr-1 h-4 w-4" />}
        기본으로 설정
      </Button>
    </div>
  )
}
