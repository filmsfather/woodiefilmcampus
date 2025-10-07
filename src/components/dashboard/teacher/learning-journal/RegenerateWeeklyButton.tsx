'use client'

import { useActionState } from 'react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { regenerateLearningJournalWeeklyAction } from '@/app/dashboard/teacher/learning-journal/actions'
import {
  initialActionState,
  type ActionState,
} from '@/app/dashboard/manager/classes/action-state'

interface RegenerateWeeklyButtonProps {
  entryId: string
}

export function RegenerateWeeklyButton({ entryId }: RegenerateWeeklyButtonProps) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    regenerateLearningJournalWeeklyAction,
    initialActionState
  )

  return (
    <div className="space-y-2">
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
      <form action={formAction}>
        <input type="hidden" name="entryId" value={entryId} />
        <Button type="submit" variant="outline" disabled={isPending}>
          {isPending ? '재생성 중...' : '주차별 데이터 다시 불러오기'}
        </Button>
      </form>
    </div>
  )
}
