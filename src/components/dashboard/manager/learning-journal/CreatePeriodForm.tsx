'use client'

import { useActionState, useEffect, useRef } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  createLearningJournalPeriodAction,
} from '@/app/dashboard/manager/learning-journal/actions'
import {
  initialActionState,
  type ActionState,
} from '@/app/dashboard/manager/classes/action-state'

interface ClassOption {
  id: string
  name: string
}

interface CreatePeriodFormProps {
  classOptions: ClassOption[]
  defaultStartDate: string
}

export function CreatePeriodForm({ classOptions, defaultStartDate }: CreatePeriodFormProps) {
  const formRef = useRef<HTMLFormElement | null>(null)
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    createLearningJournalPeriodAction,
    initialActionState
  )
  const hasClasses = classOptions.length > 0
  const selectDisabled = isPending || !hasClasses

  useEffect(() => {
    if (state.status === 'success') {
      formRef.current?.reset()
    }
  }, [state.status])

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader className="space-y-1">
        <CardTitle className="text-lg text-slate-900">새 학습일지 주기 생성</CardTitle>
        <p className="text-sm text-slate-500">반과 시작일을 선택하면 4주 일정이 자동으로 생성됩니다.</p>
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
          <div className="grid gap-2 md:col-span-1">
            <Label htmlFor="classId">반 선택</Label>
            <Select
              name="classId"
              defaultValue={classOptions[0]?.id}
              disabled={selectDisabled}
              required
            >
              <SelectTrigger id="classId">
                <SelectValue placeholder="반을 선택하세요" />
              </SelectTrigger>
              <SelectContent>
                {classOptions.length === 0 ? (
                  <SelectItem value="" disabled>
                    등록된 반이 없습니다.
                  </SelectItem>
                ) : (
                  classOptions.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2 md:col-span-1">
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

          <div className="grid gap-2 md:col-span-2">
            <Label htmlFor="label">라벨 (선택)</Label>
            <Input id="label" name="label" placeholder="예: 2025년 3월 1차" disabled={isPending} maxLength={120} />
          </div>

          <div className="md:col-span-2 flex justify-end">
            <Button type="submit" disabled={isPending || !hasClasses} className="md:w-40">
              {isPending ? '생성 중...' : '주기 생성'}
            </Button>
          </div>
        </form>
        {!hasClasses ? (
          <p className="text-xs text-amber-600">
            학습일지를 생성하려면 먼저 반과 학생 배정이 필요합니다.
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}
