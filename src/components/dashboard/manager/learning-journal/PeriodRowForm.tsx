'use client'

import { useActionState, useMemo, useRef } from 'react'
import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  deleteLearningJournalPeriodAction,
  updateLearningJournalPeriodAction,
} from '@/app/dashboard/manager/learning-journal/actions'
import {
  initialActionState,
  type ActionState,
} from '@/app/dashboard/manager/classes/action-state'
import {
  LEARNING_JOURNAL_PERIOD_STATUSES,
  type LearningJournalPeriodWithClass,
} from '@/types/learning-journal'
import { cn } from '@/lib/utils'

interface PeriodRowFormProps {
  period: LearningJournalPeriodWithClass
}

const STATUS_LABEL: Record<string, string> = {
  draft: '초안',
  in_progress: '진행 중',
  completed: '완료',
}

export function PeriodRowForm({ period }: PeriodRowFormProps) {
  const updateFormRef = useRef<HTMLFormElement | null>(null)
  const [updateState, updateAction, isUpdating] = useActionState<ActionState, FormData>(
    updateLearningJournalPeriodAction,
    initialActionState
  )
  const [deleteState, deleteAction, isDeleting] = useActionState<ActionState, FormData>(
    deleteLearningJournalPeriodAction,
    initialActionState
  )

  const statusOptions = useMemo(() => LEARNING_JOURNAL_PERIOD_STATUSES, [])

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm space-y-4">
      <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-base font-semibold text-slate-900">{period.className}</h3>
          <p className="text-sm text-slate-500">
            {period.startDate} ~ {period.endDate} · 학생 {period.studentCount}명
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
          상태: {STATUS_LABEL[period.status] ?? period.status}
        </span>
      </div>

      {/* 학생 버튼 목록 */}
      {period.students.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {period.students.map((student) => {
            const isPublished = student.status === 'published'
            const hasEntry = !!student.entryId

            // 학습일지가 있으면 해당 학습일지 상세 페이지로 이동
            const href = hasEntry
              ? `/dashboard/teacher/learning-journal/entries/${student.entryId}`
              : undefined

            const buttonContent = (
              <span
                className={cn(
                  'inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition',
                  isPublished
                    ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                  !hasEntry && 'opacity-50 cursor-not-allowed'
                )}
              >
                {student.name}
              </span>
            )

            if (hasEntry && href) {
              return (
                <Link key={student.studentId} href={href}>
                  {buttonContent}
                </Link>
              )
            }

            return (
              <span key={student.studentId} title="학습일지가 아직 생성되지 않았습니다">
                {buttonContent}
              </span>
            )
          })}
        </div>
      )}

      {updateState.status === 'error' && updateState.message ? (
        <Alert variant="destructive">
          <AlertDescription>{updateState.message}</AlertDescription>
        </Alert>
      ) : null}
      {updateState.status === 'success' && updateState.message ? (
        <Alert>
          <AlertDescription>{updateState.message}</AlertDescription>
        </Alert>
      ) : null}

      <form ref={updateFormRef} action={updateAction} className="grid gap-4 md:grid-cols-4">
        <input type="hidden" name="periodId" value={period.id} />
        <div className="grid gap-2 md:col-span-1">
          <Label htmlFor={`startDate-${period.id}`}>시작일</Label>
          <Input
            id={`startDate-${period.id}`}
            name="startDate"
            type="date"
            defaultValue={period.startDate}
            disabled={isUpdating}
            required
          />
        </div>
        <div className="grid gap-2 md:col-span-1">
          <Label htmlFor={`label-${period.id}`}>라벨</Label>
          <Input
            id={`label-${period.id}`}
            name="label"
            defaultValue={period.label ?? ''}
            disabled={isUpdating}
            maxLength={120}
            placeholder="예: 2025년 3월 1차"
          />
        </div>
        <div className="grid gap-2 md:col-span-1">
          <Label htmlFor={`status-${period.id}`}>상태</Label>
          <Select name="status" defaultValue={period.status} disabled={isUpdating}>
            <SelectTrigger id={`status-${period.id}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((status) => (
                <SelectItem key={status} value={status}>
                  {STATUS_LABEL[status] ?? status}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end justify-end md:col-span-1">
          <Button type="submit" size="sm" disabled={isUpdating} className="w-full md:w-auto">
            {isUpdating ? '저장 중...' : '변경 저장'}
          </Button>
        </div>
      </form>

      <form action={deleteAction} className="flex justify-end">
        <input type="hidden" name="periodId" value={period.id} />
        <Button
          type="submit"
          size="sm"
          variant="outline"
          disabled={isDeleting}
        >
          {isDeleting ? '삭제 중...' : '삭제'}
        </Button>
      </form>

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
    </div>
  )
}
