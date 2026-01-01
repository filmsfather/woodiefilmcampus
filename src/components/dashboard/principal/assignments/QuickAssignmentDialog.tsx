'use client'

import { useState, useTransition, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarIcon, Check, FileText, Search } from 'lucide-react'
import { ko } from 'date-fns/locale'

import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
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
import { createAssignment } from '@/app/dashboard/assignments/actions'
import type { WorkbookOption } from '@/app/dashboard/principal/assignments/page'

interface ClassOption {
  id: string
  name: string
}

interface QuickAssignmentDialogProps {
  open: boolean
  onClose: () => void
  initialClassId: string
  initialClassName: string
  classes: ClassOption[]
  workbooks: WorkbookOption[]
}

export function QuickAssignmentDialog({
  open,
  onClose,
  initialClassId,
  initialClassName,
  classes,
  workbooks,
}: QuickAssignmentDialogProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // 선택된 반들 (초기 반 포함)
  const [selectedClassIds, setSelectedClassIds] = useState<Set<string>>(
    () => new Set([initialClassId])
  )

  // 선택된 문제집
  const [selectedWorkbookId, setSelectedWorkbookId] = useState<string | null>(null)

  // 출제일
  const [publishDate, setPublishDate] = useState<Date | undefined>(undefined)

  // 마감일
  const [dueDate, setDueDate] = useState<Date | undefined>(undefined)

  // 검색어
  const [workbookQuery, setWorkbookQuery] = useState('')

  // 초기화 (다이얼로그 열릴 때)
  const resetState = () => {
    setSelectedClassIds(new Set([initialClassId]))
    setSelectedWorkbookId(null)
    setPublishDate(undefined)
    setDueDate(undefined)
    setWorkbookQuery('')
  }

  // 다이얼로그가 열릴 때마다 초기화
  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      resetState()
    } else {
      onClose()
    }
  }

  // 반 토글
  const toggleClass = (classId: string) => {
    setSelectedClassIds((prev) => {
      const next = new Set(prev)
      if (next.has(classId)) {
        // 최소 1개는 선택되어 있어야 함
        if (next.size > 1) {
          next.delete(classId)
        }
      } else {
        next.add(classId)
      }
      return next
    })
  }

  // 문제집 필터링
  const filteredWorkbooks = useMemo(() => {
    if (!workbookQuery.trim()) return workbooks
    const query = workbookQuery.toLowerCase()
    return workbooks.filter(
      (wb) =>
        wb.title.toLowerCase().includes(query) ||
        (wb.weekLabel?.toLowerCase().includes(query) ?? false)
    )
  }, [workbooks, workbookQuery])

  // 선택된 문제집 정보
  const selectedWorkbook = workbooks.find((wb) => wb.id === selectedWorkbookId)

  // 제출 가능 여부
  const canSubmit = selectedClassIds.size > 0 && selectedWorkbookId !== null

  // 과제 출제
  const handleSubmit = () => {
    if (!canSubmit || !selectedWorkbookId) return

    startTransition(async () => {
      const result = await createAssignment({
        workbookId: selectedWorkbookId,
        targetClassIds: Array.from(selectedClassIds),
        targetStudentIds: [],
        publishedAt: publishDate ? publishDate.toISOString() : new Date().toISOString(),
        dueAt: dueDate ? dueDate.toISOString() : null,
      })

      if (result?.error) {
        console.error('과제 출제 실패:', result.error)
        alert(result.error)
      } else {
        onClose()
        router.refresh()
      }
    })
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>통합이론 과제 출제</SheetTitle>
          <SheetDescription>
            {initialClassName} 반에 통합이론 과제를 출제합니다.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* 1. 반 선택 */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-slate-700">
              출제할 반 선택
            </label>
            <div className="flex flex-wrap gap-2">
              {classes.map((cls) => {
                const isSelected = selectedClassIds.has(cls.id)
                const isInitial = cls.id === initialClassId
                return (
                  <button
                    key={cls.id}
                    type="button"
                    onClick={() => toggleClass(cls.id)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-colors',
                      isSelected
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    )}
                  >
                    {isSelected && <Check className="h-3.5 w-3.5" />}
                    {cls.name}
                    {isInitial && !isSelected && (
                      <span className="text-xs text-slate-400">(현재)</span>
                    )}
                  </button>
                )
              })}
            </div>
            <p className="text-xs text-slate-500">
              선택된 반: {selectedClassIds.size}개
            </p>
          </div>

          {/* 2. 문제집 선택 */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-slate-700">
              문제집 선택
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="문제집 검색..."
                value={workbookQuery}
                onChange={(e) => setWorkbookQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
              {filteredWorkbooks.length === 0 ? (
                <div className="py-6 text-center text-sm text-slate-500">
                  {workbooks.length === 0
                    ? '통합이론 문제집이 없습니다.'
                    : '검색 결과가 없습니다.'}
                </div>
              ) : (
                filteredWorkbooks.map((wb) => {
                  const isSelected = selectedWorkbookId === wb.id
                  return (
                    <button
                      key={wb.id}
                      type="button"
                      onClick={() => setSelectedWorkbookId(wb.id)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors',
                        isSelected
                          ? 'bg-slate-900 text-white'
                          : 'hover:bg-slate-50'
                      )}
                    >
                      <FileText
                        className={cn(
                          'h-4 w-4 shrink-0',
                          isSelected ? 'text-white' : 'text-slate-400'
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{wb.title}</p>
                        <div className="flex items-center gap-2 text-xs">
                          <span
                            className={isSelected ? 'text-slate-300' : 'text-slate-500'}
                          >
                            {wb.itemCount}문항
                          </span>
                          {wb.weekLabel && (
                            <Badge
                              variant={isSelected ? 'secondary' : 'outline'}
                              className="text-[10px]"
                            >
                              {wb.weekLabel}
                            </Badge>
                          )}
                        </div>
                      </div>
                      {isSelected && <Check className="h-4 w-4 shrink-0" />}
                    </button>
                  )
                })
              )}
            </div>
          </div>

          {/* 3. 출제일/마감일 선택 */}
          <div className="grid grid-cols-2 gap-4">
            {/* 출제일 */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">
                출제일
              </label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal',
                      !publishDate && 'text-slate-500'
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {publishDate
                      ? publishDate.toLocaleDateString('ko-KR', {
                          month: 'short',
                          day: 'numeric',
                        })
                      : '즉시'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={publishDate}
                    onSelect={setPublishDate}
                    locale={ko}
                  />
                </PopoverContent>
              </Popover>
              {publishDate && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPublishDate(undefined)}
                  className="h-auto p-0 text-xs text-slate-500"
                >
                  즉시 출제로 변경
                </Button>
              )}
            </div>

            {/* 마감일 */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">
                마감일
              </label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal',
                      !dueDate && 'text-slate-500'
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dueDate
                      ? dueDate.toLocaleDateString('ko-KR', {
                          month: 'short',
                          day: 'numeric',
                        })
                      : '없음'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dueDate}
                    onSelect={setDueDate}
                    locale={ko}
                    disabled={(date) => {
                      const minDate = publishDate ?? new Date()
                      return date < minDate
                    }}
                  />
                </PopoverContent>
              </Popover>
              {dueDate && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDueDate(undefined)}
                  className="h-auto p-0 text-xs text-slate-500"
                >
                  마감일 제거
                </Button>
              )}
            </div>
          </div>

          {/* 요약 */}
          {selectedWorkbook && (
            <div className="rounded-lg bg-slate-50 p-4">
              <h4 className="mb-2 text-sm font-medium text-slate-700">출제 요약</h4>
              <ul className="space-y-1 text-sm text-slate-600">
                <li>• 문제집: {selectedWorkbook.title}</li>
                <li>• 대상: {selectedClassIds.size}개 반</li>
                <li>
                  • 출제일:{' '}
                  {publishDate
                    ? publishDate.toLocaleDateString('ko-KR', {
                        month: 'long',
                        day: 'numeric',
                      })
                    : '즉시'}
                </li>
                <li>
                  • 마감일:{' '}
                  {dueDate
                    ? dueDate.toLocaleDateString('ko-KR', {
                        month: 'long',
                        day: 'numeric',
                      })
                    : '없음'}
                </li>
              </ul>
            </div>
          )}

          {/* 버튼 */}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} className="flex-1">
              취소
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!canSubmit || isPending}
              className="flex-1"
            >
              {isPending ? '출제 중...' : '과제 출제'}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

