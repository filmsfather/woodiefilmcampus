'use client'

import { useEffect, useMemo, useState } from 'react'
import { useActionState } from 'react'

import {
  upsertLearningJournalAnnualScheduleAction,
  deleteLearningJournalAnnualScheduleAction,
} from '@/app/dashboard/principal/learning-journal/actions'
import {
  initialActionState,
  type ActionState,
} from '@/app/dashboard/manager/classes/action-state'
import type { LearningJournalAnnualSchedule } from '@/types/learning-journal'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import {
  formatAnnualScheduleDateRange,
  formatAnnualScheduleTuitionLabel,
} from '@/lib/learning-journal-annual-schedule'

interface AnnualScheduleManagerProps {
  schedules: LearningJournalAnnualSchedule[]
}

interface AnnualScheduleFormProps {
  defaultValues?: LearningJournalAnnualSchedule | null
  onCancel: () => void
  mode: 'create' | 'edit'
}

function AnnualScheduleForm({ defaultValues, onCancel, mode }: AnnualScheduleFormProps) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    upsertLearningJournalAnnualScheduleAction,
    initialActionState
  )

  useEffect(() => {
    if (state.status === 'success') {
      onCancel()
    }
  }, [state.status, onCancel])

  const fieldErrors = state.fieldErrors ?? {}

  const defaultTuitionAmount = useMemo(() => {
    if (!defaultValues || defaultValues.tuitionAmount === null) {
      return ''
    }
    return defaultValues.tuitionAmount.toLocaleString('ko-KR')
  }, [defaultValues])

  return (
    <form
      action={formAction}
      className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4"
    >
      {state.status === 'error' && state.message ? (
        <Alert variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}

      {mode === 'edit' && defaultValues ? (
        <input type="hidden" name="scheduleId" value={defaultValues.id} />
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="periodLabel">기간명</Label>
          <Input
            id="periodLabel"
            name="periodLabel"
            defaultValue={defaultValues?.periodLabel ?? ''}
            placeholder="예: 정규 · 영화제작 특강"
            required
            disabled={isPending}
            maxLength={120}
          />
          {fieldErrors.periodLabel ? (
            <p className="text-xs text-rose-600">{fieldErrors.periodLabel[0]}</p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="tuitionAmount">수업료</Label>
          <Input
            id="tuitionAmount"
            name="tuitionAmount"
            defaultValue={defaultTuitionAmount}
            placeholder="예: 700000"
            disabled={isPending}
          />
          <p className="text-xs text-slate-500">숫자만 입력하면 자동으로 표시됩니다.</p>
          {fieldErrors.tuitionAmount ? (
            <p className="text-xs text-rose-600">{fieldErrors.tuitionAmount[0]}</p>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="startDate">시작일</Label>
          <Input
            id="startDate"
            name="startDate"
            type="date"
            defaultValue={defaultValues?.startDate ?? ''}
            required
            disabled={isPending}
          />
          {fieldErrors.startDate ? (
            <p className="text-xs text-rose-600">{fieldErrors.startDate[0]}</p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="endDate">종료일</Label>
          <Input
            id="endDate"
            name="endDate"
            type="date"
            defaultValue={defaultValues?.endDate ?? ''}
            required
            disabled={isPending}
          />
          {fieldErrors.endDate ? (
            <p className="text-xs text-rose-600">{fieldErrors.endDate[0]}</p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="tuitionDueDate">수업료 납부일</Label>
          <Input
            id="tuitionDueDate"
            name="tuitionDueDate"
            type="date"
            defaultValue={defaultValues?.tuitionDueDate ?? ''}
            disabled={isPending}
          />
          {fieldErrors.tuitionDueDate ? (
            <p className="text-xs text-rose-600">{fieldErrors.tuitionDueDate[0]}</p>
          ) : null}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="memo">비고</Label>
        <Textarea
          id="memo"
          name="memo"
          rows={3}
          defaultValue={defaultValues?.memo ?? ''}
          disabled={isPending}
          placeholder="특이사항을 입력하세요."
          maxLength={2000}
        />
        {fieldErrors.memo ? (
          <p className="text-xs text-rose-600">{fieldErrors.memo[0]}</p>
        ) : null}
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isPending}>
          취소
        </Button>
        <Button type="submit" disabled={isPending} className="sm:w-32">
          {isPending ? '저장 중...' : mode === 'edit' ? '연간 일정 수정' : '연간 일정 추가'}
        </Button>
      </div>
    </form>
  )
}

export function AnnualScheduleManager({ schedules }: AnnualScheduleManagerProps) {
  const [activeForm, setActiveForm] = useState<'create' | { id: string } | null>(null)

  const [deleteState, deleteAction, isDeleting] = useActionState<ActionState, FormData>(
    deleteLearningJournalAnnualScheduleAction,
    initialActionState
  )

  useEffect(() => {
    if (deleteState.status === 'success') {
      setActiveForm(null)
    }
  }, [deleteState.status])

  const activeSchedule = useMemo(() => {
    if (!activeForm || activeForm === 'create') {
      return null
    }

    return schedules.find((schedule) => schedule.id === activeForm.id) ?? null
  }, [activeForm, schedules])

  const hasSchedules = schedules.length > 0

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader className="space-y-1">
        <CardTitle className="text-lg text-slate-900">연간 일정 관리</CardTitle>
        <p className="text-sm text-slate-500">학부모 가정 안내에 4주 단위로 노출됩니다.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {deleteState.status !== 'idle' && deleteState.message ? (
          <Alert variant={deleteState.status === 'error' ? 'destructive' : 'default'}>
            <AlertDescription>{deleteState.message}</AlertDescription>
          </Alert>
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-500">
            {hasSchedules ? `총 ${schedules.length}개의 일정이 등록되어 있습니다.` : '등록된 연간 일정이 없습니다.'}
          </p>
          <Button onClick={() => setActiveForm('create')} disabled={Boolean(activeForm)}>
            새 묶음 추가
          </Button>
        </div>

        {hasSchedules ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>기간명</TableHead>
                <TableHead>기간(날짜)</TableHead>
                <TableHead>비고</TableHead>
                <TableHead>수업료</TableHead>
                <TableHead className="text-right">액션</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {schedules.map((schedule) => {
                const isEditing = activeForm && activeForm !== 'create' && activeForm.id === schedule.id

                return (
                  <TableRow key={schedule.id} className={isEditing ? 'bg-slate-50' : undefined}>
                    <TableCell className="text-slate-900">{schedule.periodLabel}</TableCell>
                    <TableCell className="text-slate-600">
                      {formatAnnualScheduleDateRange(schedule.startDate, schedule.endDate)}
                    </TableCell>
                    <TableCell className="max-w-sm whitespace-pre-line text-slate-500">
                      {schedule.memo ? schedule.memo : '-'}
                    </TableCell>
                    <TableCell className="text-slate-600">
                      {formatAnnualScheduleTuitionLabel(schedule.tuitionDueDate, schedule.tuitionAmount)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setActiveForm({ id: schedule.id })}
                          disabled={Boolean(activeForm) && !(activeForm !== 'create' && activeForm?.id === schedule.id)}
                        >
                          수정
                        </Button>
                        <form action={deleteAction} className="inline-flex">
                          <input type="hidden" name="scheduleId" value={schedule.id} />
                          <Button
                            type="submit"
                            variant="ghost"
                            size="sm"
                            disabled={isDeleting}
                            className="text-rose-600 hover:text-rose-600"
                          >
                            삭제
                          </Button>
                        </form>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        ) : null}

        {activeForm === 'create' || (activeForm && activeSchedule) ? (
          <AnnualScheduleForm
            mode={activeForm === 'create' ? 'create' : 'edit'}
            defaultValues={activeForm === 'create' ? null : activeSchedule}
            onCancel={() => setActiveForm(null)}
          />
        ) : null}
      </CardContent>
    </Card>
  )
}
