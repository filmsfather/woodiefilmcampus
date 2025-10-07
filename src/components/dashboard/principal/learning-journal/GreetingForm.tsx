'use client'

import { useActionState } from 'react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  upsertLearningJournalGreetingAction,
  deleteLearningJournalGreetingAction,
} from '@/app/dashboard/principal/learning-journal/actions'
import {
  initialActionState,
  type ActionState,
} from '@/app/dashboard/manager/classes/action-state'

interface GreetingFormProps {
  monthToken: string
  defaultMessage: string
}

export function GreetingForm({ monthToken, defaultMessage }: GreetingFormProps) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    upsertLearningJournalGreetingAction,
    initialActionState
  )
  const [deleteState, deleteAction, isDeleting] = useActionState<ActionState, FormData>(
    deleteLearningJournalGreetingAction,
    initialActionState
  )

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader className="space-y-1">
        <CardTitle className="text-lg text-slate-900">원장 인사말</CardTitle>
        <p className="text-sm text-slate-500">선택한 월에 표시될 인사말을 작성하고 저장하세요.</p>
      </CardHeader>
      <CardContent className="space-y-4">
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
        {deleteState.status === 'error' && deleteState.message ? (
          <Alert variant="destructive">
            <AlertDescription>{deleteState.message}</AlertDescription>
          </Alert>
        ) : null}
        {deleteState.status === 'success' && deleteState.message ? (
          <Alert>
            <AlertDescription>{deleteState.message}</AlertDescription>
          </Alert>
        ) : null}

        <form action={formAction} className="space-y-4">
          <input type="hidden" name="monthToken" value={monthToken} />
          <div className="grid gap-2">
            <Label htmlFor="message">인사말</Label>
            <Textarea
              id="message"
              name="message"
              rows={6}
              defaultValue={defaultMessage}
              placeholder="한 달간의 학습 여정을 응원하는 메시지를 작성하세요."
              required
              disabled={isPending}
              maxLength={2000}
            />
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={isPending} className="sm:w-40">
              {isPending ? '저장 중...' : '인사말 저장'}
            </Button>
          </div>
        </form>

        {defaultMessage ? (
          <form action={deleteAction} className="flex justify-end">
            <input type="hidden" name="monthToken" value={monthToken} />
            <Button type="submit" variant="outline" disabled={isDeleting} className="sm:w-32">
              {isDeleting ? '삭제 중...' : '인사말 삭제'}
            </Button>
          </form>
        ) : null}
      </CardContent>
    </Card>
  )
}
