'use client'

import { useState, useEffect } from 'react'
import { CalendarIcon } from 'lucide-react'
import { ko } from 'date-fns/locale'

import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'

interface TaskInfo {
  taskId: string
  assignmentId: string
  title: string
  publishedAt: string | null
  dueAt: string | null
}

interface PublishedAtDialogProps {
  open: boolean
  onClose: () => void
  task: TaskInfo
  onSubmit: (assignmentId: string, publishedAt: string | null, dueAt: string | null) => void
  isSubmitting?: boolean
}

export function PublishedAtDialog({
  open,
  onClose,
  task,
  onSubmit,
  isSubmitting = false,
}: PublishedAtDialogProps) {
  const [publishedAt, setPublishedAt] = useState<Date | undefined>(
    task.publishedAt ? new Date(task.publishedAt) : undefined
  )
  const [dueAt, setDueAt] = useState<Date | undefined>(
    task.dueAt ? new Date(task.dueAt) : undefined
  )

  // 다이얼로그가 열릴 때 task 값으로 초기화
  useEffect(() => {
    if (open) {
      setPublishedAt(task.publishedAt ? new Date(task.publishedAt) : undefined)
      setDueAt(task.dueAt ? new Date(task.dueAt) : undefined)
    }
  }, [open, task.publishedAt, task.dueAt])

  const handleSubmit = () => {
    onSubmit(
      task.assignmentId,
      publishedAt ? publishedAt.toISOString() : null,
      dueAt ? dueAt.toISOString() : null
    )
  }

  const formatDate = (date: Date | undefined) => {
    if (!date) return null
    return date.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  return (
    <Sheet open={open} onOpenChange={(value) => { if (!value) onClose() }}>
      <SheetContent side="right" className="w-full max-w-md">
        <SheetHeader>
          <SheetTitle>출제일 수정</SheetTitle>
          <SheetDescription>
            출제일을 변경하면 학습일지에서 해당 주차로 자동 배치됩니다.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* 과제 정보 */}
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs text-slate-500">과제</p>
            <p className="mt-1 font-medium text-slate-900">{task.title}</p>
          </div>

          {/* 출제일 선택 */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-slate-700">출제일</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    'w-full justify-start text-left font-normal',
                    !publishedAt && 'text-slate-500'
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {formatDate(publishedAt) ?? '출제일을 선택하세요'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={publishedAt}
                  onSelect={setPublishedAt}
                  locale={ko}
                />
              </PopoverContent>
            </Popover>
            {publishedAt && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPublishedAt(undefined)}
                className="h-auto p-0 text-xs text-slate-500"
              >
                출제일 제거
              </Button>
            )}
          </div>

          {/* 마감일 선택 */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-slate-700">마감일</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    'w-full justify-start text-left font-normal',
                    !dueAt && 'text-slate-500'
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {formatDate(dueAt) ?? '마감일을 선택하세요'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={dueAt}
                  onSelect={setDueAt}
                  locale={ko}
                  disabled={(date) => {
                    if (publishedAt && date < publishedAt) return true
                    return false
                  }}
                />
              </PopoverContent>
            </Popover>
            {dueAt && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDueAt(undefined)}
                className="h-auto p-0 text-xs text-slate-500"
              >
                마감일 제거
              </Button>
            )}
          </div>

          {/* 안내 메시지 */}
          <div className="rounded-md border border-sky-200 bg-sky-50 p-3 text-xs text-sky-700">
            <p className="font-medium">안내</p>
            <ul className="mt-1 list-disc space-y-1 pl-4">
              <li>출제일 기준으로 학습일지 주차가 자동 결정됩니다.</li>
              <li>변경사항은 모든 학생의 학습일지에 반영됩니다.</li>
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

