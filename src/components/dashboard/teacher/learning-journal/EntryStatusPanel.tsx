'use client'

import { useActionState } from 'react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { updateLearningJournalEntryStatusAction } from '@/app/dashboard/teacher/learning-journal/actions'
import {
  initialActionState,
  type ActionState,
} from '@/app/dashboard/manager/classes/action-state'

interface EntryStatusPanelProps {
  entryId: string
  status: 'draft' | 'submitted' | 'published' | 'archived'
}

function getStatusLabel(status: EntryStatusPanelProps['status']) {
  switch (status) {
    case 'draft':
      return '작성 중'
    case 'submitted':
      return '제출 완료'
    case 'published':
      return '공개 완료'
    case 'archived':
      return '보관'
    default:
      return status
  }
}

export function EntryStatusPanel({ entryId, status }: EntryStatusPanelProps) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    updateLearningJournalEntryStatusAction,
    initialActionState
  )

  const canSubmit = status === 'draft'
  const canRevert = status === 'submitted'

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div>
        <h2 className="text-base font-semibold text-slate-900">제출 상태</h2>
        <p className="text-sm text-slate-500">수정이 끝났다면 제출을 눌러 원장 검토를 요청하세요.</p>
      </div>

      <div className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
        현재 상태: <span className="font-medium text-slate-900">{getStatusLabel(status)}</span>
      </div>

      {state.status === 'error' && state.message ? (
        <Alert variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}
      {state.status === 'success' && state.message ? (
        <Alert>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        <form action={formAction} className="sm:flex-1">
          <input type="hidden" name="entryId" value={entryId} />
          <input type="hidden" name="status" value="submitted" />
          <Button type="submit" disabled={isPending || !canSubmit} className="w-full">
            {isPending && canSubmit ? '제출 중...' : '작성 완료 · 제출'}
          </Button>
        </form>
        <form action={formAction} className="sm:flex-1">
          <input type="hidden" name="entryId" value={entryId} />
          <input type="hidden" name="status" value="draft" />
          <Button type="submit" variant="outline" disabled={isPending || !canRevert} className="w-full">
            {isPending && canRevert ? '되돌리는 중...' : '작성 중으로 되돌리기'}
          </Button>
        </form>
      </div>
    </div>
  )
}
