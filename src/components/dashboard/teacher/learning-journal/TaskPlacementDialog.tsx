'use client'

import { useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface PeriodOption {
  id: string
  label: string
  startDate: string
  endDate: string
}

interface TaskInfo {
  taskId: string
  title: string
  weekOverride: number | null
  periodOverride: string | null
}

interface TaskPlacementDialogProps {
  open: boolean
  onClose: () => void
  task: TaskInfo
  currentPeriodId: string
  currentWeekIndex: number
  availablePeriods: PeriodOption[]
  onSubmit: (taskId: string, weekOverride: number | null, periodOverride: string | null) => void
  isSubmitting?: boolean
}

const WEEK_OPTIONS = [
  { value: 'auto', label: '자동 (날짜 기준)' },
  { value: '1', label: '1주차' },
  { value: '2', label: '2주차' },
  { value: '3', label: '3주차' },
  { value: '4', label: '4주차' },
] as const

export function TaskPlacementDialog({
  open,
  onClose,
  task,
  currentPeriodId,
  currentWeekIndex,
  availablePeriods,
  onSubmit,
  isSubmitting = false,
}: TaskPlacementDialogProps) {
  const [selectedPeriod, setSelectedPeriod] = useState<string>(
    task.periodOverride ?? 'auto'
  )
  const [selectedWeek, setSelectedWeek] = useState<string>(
    task.weekOverride ? String(task.weekOverride) : 'auto'
  )

  const handleSubmit = () => {
    const weekOverride = selectedWeek === 'auto' ? null : parseInt(selectedWeek, 10)
    const periodOverride = selectedPeriod === 'auto' ? null : selectedPeriod

    onSubmit(task.taskId, weekOverride, periodOverride)
  }

  const currentPeriod = availablePeriods.find((p) => p.id === currentPeriodId)

  return (
    <Sheet open={open} onOpenChange={(value) => { if (!value) onClose() }}>
      <SheetContent side="right" className="w-full max-w-md">
        <SheetHeader>
          <SheetTitle>과제 배치 변경</SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* 과제 정보 */}
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs text-slate-500">과제</p>
            <p className="mt-1 font-medium text-slate-900">{task.title}</p>
            <p className="mt-2 text-xs text-slate-500">
              현재 위치: {currentPeriod?.label ?? '알 수 없음'} · {currentWeekIndex}주차
            </p>
          </div>

          {/* 월 선택 */}
          <div className="space-y-3">
            <p className="text-sm font-medium text-slate-700">월 선택</p>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setSelectedPeriod('auto')}
                className={cn(
                  'flex w-full items-center justify-between rounded-md border px-3 py-2.5 text-left text-sm transition',
                  selectedPeriod === 'auto'
                    ? 'border-sky-500 bg-sky-50 text-sky-700'
                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                )}
              >
                <span>자동 (날짜 기준)</span>
                {selectedPeriod === 'auto' && (
                  <Badge variant="default" className="text-[10px]">선택됨</Badge>
                )}
              </button>

              {availablePeriods.map((period) => (
                <button
                  key={period.id}
                  type="button"
                  onClick={() => setSelectedPeriod(period.id)}
                  className={cn(
                    'flex w-full items-center justify-between rounded-md border px-3 py-2.5 text-left text-sm transition',
                    selectedPeriod === period.id
                      ? 'border-sky-500 bg-sky-50 text-sky-700'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  )}
                >
                  <div>
                    <span className="font-medium">{period.label}</span>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {period.startDate} ~ {period.endDate}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {period.id === currentPeriodId && (
                      <Badge variant="outline" className="text-[10px]">현재</Badge>
                    )}
                    {selectedPeriod === period.id && (
                      <Badge variant="default" className="text-[10px]">선택됨</Badge>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* 주차 선택 */}
          <div className="space-y-3">
            <p className="text-sm font-medium text-slate-700">주차 선택</p>
            <div className="grid grid-cols-2 gap-2">
              {WEEK_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setSelectedWeek(option.value)}
                  className={cn(
                    'rounded-md border px-3 py-2 text-sm transition',
                    selectedWeek === option.value
                      ? 'border-sky-500 bg-sky-50 text-sky-700 font-medium'
                      : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  )}
                >
                  {option.label}
                  {option.value !== 'auto' && parseInt(option.value, 10) === currentWeekIndex && (
                    <span className="ml-1 text-[10px] text-slate-400">(현재)</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* 안내 메시지 */}
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
            <p className="font-medium">참고</p>
            <ul className="mt-1 list-disc space-y-1 pl-4">
              <li>&apos;자동&apos;을 선택하면 과제의 생성일/마감일 기준으로 자동 배치됩니다.</li>
              <li>변경 후 학습일지를 재생성하면 즉시 반영됩니다.</li>
            </ul>
          </div>

          {/* 버튼 */}
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
              취소
            </Button>
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? '저장 중...' : '저장'}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

