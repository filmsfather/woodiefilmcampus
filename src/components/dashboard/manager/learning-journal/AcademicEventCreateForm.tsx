'use client'

import { useActionState, useEffect, useRef } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  upsertLearningJournalAcademicEventAction,
} from '@/app/dashboard/manager/learning-journal/actions'
import {
  initialActionState,
  type ActionState,
} from '@/app/dashboard/manager/classes/action-state'

interface AcademicEventCreateFormProps {
  monthToken: string
  defaultStartDate: string
}

export function AcademicEventCreateForm({ monthToken, defaultStartDate }: AcademicEventCreateFormProps) {
  const formRef = useRef<HTMLFormElement | null>(null)
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    upsertLearningJournalAcademicEventAction,
    initialActionState
  )

  useEffect(() => {
    if (state.status === 'success') {
      formRef.current?.reset()
    }
  }, [state.status])

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader className="space-y-1">
        <CardTitle className="text-lg text-slate-900">주요 학사 일정 등록</CardTitle>
        <p className="text-sm text-slate-500">선택한 월에 표시할 주요 일정을 정리하세요.</p>
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

        <form ref={formRef} action={formAction} className="grid gap-4 md:grid-cols-2">
          <input type="hidden" name="monthToken" value={monthToken} />
          <div className="grid gap-2 md:col-span-2">
            <Label htmlFor="title">일정 제목</Label>
            <Input id="title" name="title" required placeholder="예: 모의고사 주간" disabled={isPending} />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="startDate">시작일</Label>
            <Input
              id="startDate"
              name="startDate"
              type="date"
              defaultValue={defaultStartDate}
              required
              disabled={isPending}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="endDate">종료일 (선택)</Label>
            <Input id="endDate" name="endDate" type="date" disabled={isPending} />
          </div>

          <div className="grid gap-2 md:col-span-2">
            <Label htmlFor="memo">메모 (선택)</Label>
            <Textarea
              id="memo"
              name="memo"
              rows={3}
              maxLength={2000}
              placeholder="진행 방식이나 참고 사항을 작성하세요."
              disabled={isPending}
            />
          </div>

          <div className="md:col-span-2 flex justify-end">
            <Button type="submit" disabled={isPending} className="md:w-40">
              {isPending ? '저장 중...' : '일정 추가'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
