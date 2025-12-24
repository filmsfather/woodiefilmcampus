'use client'

import { useActionState } from 'react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { saveLearningJournalCommentAction } from '@/app/dashboard/teacher/learning-journal/actions'
import {
  initialActionState,
  type ActionState,
} from '@/app/dashboard/manager/classes/action-state'

interface CommentEditorProps {
  entryId: string
  roleScope: 'homeroom' | 'subject'
  subject?: string | null
  label: string
  description?: string
  defaultValue: string
}

export function CommentEditor({ entryId, roleScope, subject, label, description, defaultValue }: CommentEditorProps) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    saveLearningJournalCommentAction,
    initialActionState
  )

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="space-y-1">
        <Label className="text-base font-semibold text-slate-900">{label}</Label>
        {description ? <p className="text-sm text-slate-500">{description}</p> : null}
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

      <form action={formAction} className="space-y-3">
        <input type="hidden" name="entryId" value={entryId} />
        <input type="hidden" name="roleScope" value={roleScope} />
        {subject ? <input type="hidden" name="subject" value={subject} /> : null}
        <Textarea
          name="body"
          defaultValue={defaultValue}
          rows={6}
          placeholder="코멘트를 입력하세요. (비워두면 삭제됩니다)"
          disabled={isPending}
          maxLength={4000}
        />
        <div className="flex justify-end">
          <Button type="submit" disabled={isPending} className="sm:w-32">
            {isPending ? '저장 중...' : '코멘트 저장'}
          </Button>
        </div>
      </form>
    </div>
  )
}
