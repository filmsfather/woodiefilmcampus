'use client'

import { useActionState, useState, useRef } from 'react'
import { Sparkles } from 'lucide-react'

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

  const [isGenerating, setIsGenerating] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleGenerateGreeting = async () => {
    setIsGenerating(true)
    setAiError(null)

    try {
      const context = textareaRef.current?.value || ''

      const response = await fetch('/api/learning-journal/generate-greeting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monthToken, context }),
      })

      const data = await response.json()

      if (!response.ok || data.error) {
        setAiError(data.error || 'AI 인사말 생성에 실패했습니다.')
        return
      }

      if (textareaRef.current && data.greeting) {
        textareaRef.current.value = data.greeting
      }
    } catch {
      setAiError('AI 서버 연결에 실패했습니다.')
    } finally {
      setIsGenerating(false)
    }
  }

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
        {aiError ? (
          <Alert variant="destructive">
            <AlertDescription>{aiError}</AlertDescription>
          </Alert>
        ) : null}

        <form action={formAction} className="space-y-4">
          <input type="hidden" name="monthToken" value={monthToken} />
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="message">인사말</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleGenerateGreeting}
                disabled={isGenerating || isPending}
                className="gap-1.5"
              >
                <Sparkles className="h-4 w-4" />
                {isGenerating ? 'AI 작성 중...' : 'AI 작성'}
              </Button>
            </div>
            <Textarea
              ref={textareaRef}
              id="message"
              name="message"
              rows={6}
              defaultValue={defaultMessage}
              placeholder="키워드나 전달하고 싶은 내용을 입력하고 'AI 작성' 버튼을 누르면 자동으로 인사말이 생성됩니다."
              required
              disabled={isPending || isGenerating}
              maxLength={2000}
            />
            <p className="text-xs text-slate-500">
              💡 키워드나 전달하고 싶은 내용을 입력한 뒤 AI 작성 버튼을 누르면, 해당 내용을 반영한 인사말이 자동 생성됩니다.
            </p>
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={isPending || isGenerating} className="sm:w-40">
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
