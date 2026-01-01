'use client'

import { useActionState, useRef, useEffect, useState, useCallback } from 'react'

import { Alert, AlertDescription } from '@/components/ui/alert'
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
  const formRef = useRef<HTMLFormElement>(null)
  const lastSavedRef = useRef(defaultValue)
  const [showSuccess, setShowSuccess] = useState(false)

  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    saveLearningJournalCommentAction,
    initialActionState
  )

  // 성공 시 임시 메시지 표시
  useEffect(() => {
    if (state.status === 'success') {
      setShowSuccess(true)
      const timer = setTimeout(() => setShowSuccess(false), 2000)
      return () => clearTimeout(timer)
    }
  }, [state])

  const handleBlur = useCallback((e: React.FocusEvent<HTMLTextAreaElement>) => {
    const currentValue = e.target.value
    // 값이 변경되었을 때만 저장
    if (currentValue !== lastSavedRef.current && formRef.current) {
      lastSavedRef.current = currentValue
      formRef.current.requestSubmit()
    }
  }, [])

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
      {showSuccess ? (
        <p className="text-sm text-green-600">코멘트가 저장되었습니다.</p>
      ) : null}

      <form ref={formRef} action={formAction}>
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
          onBlur={handleBlur}
          className={isPending ? 'opacity-50' : ''}
        />
      </form>
    </div>
  )
}
