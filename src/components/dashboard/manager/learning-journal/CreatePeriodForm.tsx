'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'

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
  studentCount: number
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
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([])

  const hasClasses = classOptions.length > 0
  const selectDisabled = isPending || !hasClasses

  // 선택되지 않은 반 목록
  const availableClasses = classOptions.filter((c) => !selectedClassIds.includes(c.id))

  const handleAddClass = (classId: string) => {
    if (classId && !selectedClassIds.includes(classId)) {
      setSelectedClassIds((prev) => [...prev, classId])
    }
  }

  const handleRemoveClass = (classId: string) => {
    setSelectedClassIds((prev) => prev.filter((id) => id !== classId))
  }

  const getClassInfo = (classId: string) => {
    const classOption = classOptions.find((c) => c.id === classId)
    return {
      name: classOption?.name ?? '알 수 없음',
      studentCount: classOption?.studentCount ?? 0,
    }
  }

  useEffect(() => {
    if (state.status === 'success') {
      formRef.current?.reset()
      setSelectedClassIds([])
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
          {/* 숨김 필드: 선택된 반 ID들 */}
          <input type="hidden" name="classIds" value={selectedClassIds.join(',')} />

          <div className="grid gap-2 md:col-span-1">
            <Label>반 선택</Label>
            <Select
              value=""
              onValueChange={handleAddClass}
              disabled={selectDisabled || availableClasses.length === 0}
            >
              <SelectTrigger>
                <SelectValue placeholder={availableClasses.length === 0 ? '모든 반이 선택됨' : '반을 선택하세요'} />
              </SelectTrigger>
              <SelectContent>
                {availableClasses.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.name} ({option.studentCount}명)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* 선택된 반 목록 */}
            {selectedClassIds.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {selectedClassIds.map((classId) => {
                  const info = getClassInfo(classId)
                  return (
                    <span
                      key={classId}
                      className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700"
                    >
                      {info.name} ({info.studentCount}명)
                      <button
                        type="button"
                        onClick={() => handleRemoveClass(classId)}
                        disabled={isPending}
                        className="ml-1 rounded-full p-0.5 hover:bg-slate-200 disabled:opacity-50"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  )
                })}
              </div>
            )}
            {selectedClassIds.length === 0 && (
              <p className="text-xs text-slate-500">반을 선택해주세요.</p>
            )}
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
            <Button type="submit" disabled={isPending || !hasClasses || selectedClassIds.length === 0} className="md:w-40">
              {isPending ? '생성 중...' : `주기 생성 (${selectedClassIds.length}개)`}
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
