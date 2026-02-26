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
  previousComment?: string | null
}

function PreviousCommentHint({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false)
  const isLong = text.length > 80

  return (
    <button
      type="button"
      onClick={() => setExpanded((prev) => !prev)}
      className="w-full rounded border border-slate-100 bg-slate-50 px-3 py-2 text-left"
    >
      <span className="text-xs font-medium text-slate-400">지난 코멘트</span>
      <p className={`mt-0.5 text-xs text-slate-500 whitespace-pre-wrap ${!expanded && isLong ? 'line-clamp-2' : ''}`}>
        {text}
      </p>
      {isLong ? (
        <span className="mt-1 inline-block text-xs text-slate-400">
          {expanded ? '접기' : '더보기'}
        </span>
      ) : null}
    </button>
  )
}

export function CommentEditor({ entryId, roleScope, subject, label, description, defaultValue, previousComment }: CommentEditorProps) {
  const formRef = useRef<HTMLFormElement>(null)
  const lastSavedRef = useRef(defaultValue)
  const [showSuccess, setShowSuccess] = useState(false)

  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    saveLearningJournalCommentAction,
    initialActionState
  )

  useEffect(() => {
    if (state.status === 'success') {
      setShowSuccess(true)
      const timer = setTimeout(() => setShowSuccess(false), 2000)
      return () => clearTimeout(timer)
    }
  }, [state])

  const handleBlur = useCallback((e: React.FocusEvent<HTMLTextAreaElement>) => {
    const currentValue = e.target.value
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
        {previousComment ? <PreviousCommentHint text={previousComment} /> : null}
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
