'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, CheckCircle2, Eye, EyeOff, RotateCcw } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import DateUtil from '@/lib/date-util'
import type { StudentTaskDetail, StudentTaskItemDetail } from '@/types/student-task'
import { cn } from '@/lib/utils'

interface SrsTaskRunnerProps {
  task: StudentTaskDetail
  onSubmitAnswer: (payload: { studentTaskItemId: string; isCorrect: boolean }) => Promise<{
    success: boolean
    error?: string
  }>
}

type SubmissionResult = 'correct' | 'incorrect' | null

function getAvailableItems(items: StudentTaskItemDetail[]) {
  const nowMs = DateUtil.nowUTC().getTime()
  return items.filter((item) => {
    if (!item.completedAt) {
      return true
    }

    if (!item.nextReviewAt) {
      return false
    }

    return new Date(item.nextReviewAt).getTime() <= nowMs
  })
}

function getNextScheduledItem(items: StudentTaskItemDetail[]) {
  const nowMs = DateUtil.nowUTC().getTime()
  return items
    .filter((item) => item.nextReviewAt && new Date(item.nextReviewAt).getTime() > nowMs)
    .sort((a, b) => new Date(a.nextReviewAt ?? 0).getTime() - new Date(b.nextReviewAt ?? 0).getTime())
    .at(0)
}

function computeCorrectChoiceIds(item: StudentTaskItemDetail) {
  return item.workbookItem.choices.filter((choice) => choice.isCorrect).map((choice) => choice.id)
}

function normalizeText(value: string) {
  return value.trim().toLowerCase()
}

function isShortAnswerCorrect(item: StudentTaskItemDetail, userInputs: string[]) {
  const expected = item.workbookItem.shortFields
  if (expected.length === 0) {
    return false
  }

  if (expected.length !== userInputs.length) {
    return false
  }

  return expected.every((field, index) => {
    const expectedValue = normalizeText(field.answer)
    const actualValue = normalizeText(userInputs[index] ?? '')
    return expectedValue.length > 0 && expectedValue === actualValue
  })
}

function isMultipleChoiceCorrect(
  item: StudentTaskItemDetail,
  selectedChoiceIds: string[],
  allowMultiple: boolean
) {
  const correctChoiceIds = computeCorrectChoiceIds(item)
  if (correctChoiceIds.length === 0) {
    return false
  }

  if (!allowMultiple) {
    if (selectedChoiceIds.length !== 1) {
      return false
    }
    return correctChoiceIds[0] === selectedChoiceIds[0]
  }

  if (selectedChoiceIds.length === 0) {
    return false
  }

  const selectedSet = new Set(selectedChoiceIds)
  if (selectedSet.size !== correctChoiceIds.length) {
    return false
  }

  return correctChoiceIds.every((choiceId) => selectedSet.has(choiceId))
}

export function SrsTaskRunner({ task, onSubmitAnswer }: SrsTaskRunnerProps) {
  const router = useRouter()

  const allowMultipleCorrect = useMemo(() => {
    const workbookConfig = (task.assignment?.workbook.config ?? {}) as {
      srs?: { allowMultipleCorrect?: boolean }
    }
    const flag = workbookConfig.srs?.allowMultipleCorrect
    if (typeof flag === 'boolean') {
      return flag
    }
    return true
  }, [task.assignment?.workbook.config])

  const availableItems = useMemo(() => getAvailableItems(task.items), [task.items])
  const nextScheduledItem = useMemo(() => getNextScheduledItem(task.items), [task.items])

  const [currentIndex, setCurrentIndex] = useState(0)
  const currentItem = availableItems[currentIndex] ?? null

  const [selectedChoiceIds, setSelectedChoiceIds] = useState<string[]>([])
  const [shortInputs, setShortInputs] = useState<string[]>([])
  const [result, setResult] = useState<SubmissionResult>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [showAnswer, setShowAnswer] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const shortFieldCount = currentItem?.workbookItem.shortFields.length ?? 0

  useEffect(() => {
    setSelectedChoiceIds([])
    setShortInputs(Array.from({ length: shortFieldCount }, () => ''))
    setResult(null)
    setErrorMessage(null)
    setShowAnswer(false)
  }, [currentItem?.id, shortFieldCount])

  const answerType = currentItem?.workbookItem.answerType ?? 'multiple_choice'

  const canSubmit = useMemo(() => {
    if (!currentItem) {
      return false
    }

    if (answerType === 'multiple_choice') {
      return selectedChoiceIds.length > 0
    }

    return shortInputs.every((value) => value.trim().length > 0)
  }, [currentItem, answerType, selectedChoiceIds, shortInputs])

  const handleToggleChoice = (choiceId: string) => {
    setResult(null)
    setShowAnswer(false)

    if (!allowMultipleCorrect) {
      setSelectedChoiceIds([choiceId])
      return
    }

    setSelectedChoiceIds((prev) => {
      if (prev.includes(choiceId)) {
        return prev.filter((id) => id !== choiceId)
      }
      return [...prev, choiceId]
    })
  }

  const handleShortInputChange = (value: string, index: number) => {
    setResult(null)
    setShowAnswer(false)
    setShortInputs((prev) => prev.map((input, idx) => (idx === index ? value : input)))
  }

  const moveToNextItem = () => {
    setCurrentIndex((prev) => {
      const next = prev + 1
      if (next >= availableItems.length) {
        return 0
      }
      return next
    })
  }

  const handleSubmit = async () => {
    if (!currentItem) {
      return
    }

    setErrorMessage(null)

    let isCorrect = false

    if (answerType === 'multiple_choice') {
      isCorrect = isMultipleChoiceCorrect(currentItem, selectedChoiceIds, allowMultipleCorrect)
    } else {
      isCorrect = isShortAnswerCorrect(currentItem, shortInputs)
    }

    try {
      setIsSubmitting(true)
      const response = await onSubmitAnswer({ studentTaskItemId: currentItem.id, isCorrect })

      if (!response.success) {
        setErrorMessage(response.error ?? '제출 중 오류가 발생했습니다.')
        return
      }

      setResult(isCorrect ? 'correct' : 'incorrect')
      setShowAnswer(true)
      router.refresh()
    } catch (error) {
      console.error('[SrsTaskRunner] submit failed', error)
      setErrorMessage('제출 중 오류가 발생했습니다. 다시 시도해주세요.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!currentItem) {
    if (task.summary.remainingItems === 0) {
      return (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-sm text-slate-600">
          모든 문항을 완료했습니다. 필요하면 과제를 다시 열람하여 복습할 수 있습니다.
        </div>
      )
    }

    return (
      <div className="space-y-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600">
        <p>현재 복습할 문항이 없습니다. 다음 복습 시간에 다시 돌아와주세요.</p>
        {nextScheduledItem?.nextReviewAt && (
          <p>
            다음 복습 예정 시각:{' '}
            <strong>
              {DateUtil.formatForDisplay(nextScheduledItem.nextReviewAt, {
                locale: 'ko-KR',
                timeZone: 'Asia/Seoul',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </strong>
          </p>
        )}
        <Button variant="outline" size="sm" onClick={() => router.refresh()} className="mt-2 w-full sm:w-auto">
          <RotateCcw className="mr-2 h-4 w-4" /> 새로고침
        </Button>
      </div>
    )
  }

  const correctChoices = computeCorrectChoiceIds(currentItem)

  return (
    <div className="space-y-6">
      <Card className="border-slate-200">
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-lg font-semibold text-slate-900">문항 #{currentItem.workbookItem.position}</CardTitle>
            <p className="text-sm text-slate-500">카드별로 정답을 입력하고 확인해보세요.</p>
          </div>
          <Badge variant={currentItem.streak >= 3 ? 'secondary' : 'outline'}>
            연속 정답 {currentItem.streak}회
          </Badge>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <p className="text-base font-medium text-slate-900 whitespace-pre-line">
              {currentItem.workbookItem.prompt}
            </p>
            {currentItem.workbookItem.explanation && (
              <p className="text-sm text-slate-500">{currentItem.workbookItem.explanation}</p>
            )}
          </div>

          {answerType === 'multiple_choice' ? (
            <div className="space-y-3">
              {currentItem.workbookItem.choices.length === 0 ? (
                <p className="text-sm text-slate-500">등록된 보기가 없습니다.</p>
              ) : (
                currentItem.workbookItem.choices.map((choice, index) => {
                  const isSelected = selectedChoiceIds.includes(choice.id)
                  return (
                    <button
                      key={choice.id}
                      type="button"
                      onClick={() => handleToggleChoice(choice.id)}
                      className={cn(
                        'flex w-full items-start gap-3 rounded-md border px-4 py-3 text-left transition',
                        isSelected
                          ? 'border-primary bg-primary/10 text-primary-foreground'
                          : 'border-slate-200 hover:border-primary/60 hover:bg-slate-50'
                      )}
                    >
                      <Checkbox checked={isSelected} className="mt-1" readOnly />
                      <div className="space-y-1">
                        <p className="font-medium text-slate-900">보기 {index + 1}</p>
                        <p className="text-sm text-slate-700 whitespace-pre-line">{choice.content}</p>
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {currentItem.workbookItem.shortFields.length === 0 ? (
                <p className="text-sm text-slate-500">등록된 정답 필드가 없습니다.</p>
              ) : (
                currentItem.workbookItem.shortFields.map((field, index) => (
                  <div key={field.id} className="space-y-2">
                    {field.label && <p className="text-sm font-medium text-slate-700">{field.label}</p>}
                    <Input
                      value={shortInputs[index] ?? ''}
                      onChange={(event) => handleShortInputChange(event.target.value, index)}
                      placeholder={`정답을 입력하세요 (${index + 1})`}
                      disabled={isSubmitting}
                    />
                  </div>
                ))
              )}
            </div>
          )}

          {errorMessage && (
            <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4" />
              <p>{errorMessage}</p>
            </div>
          )}

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2">
              <Button variant="default" disabled={!canSubmit || isSubmitting} onClick={handleSubmit}>
                {isSubmitting ? '제출 중...' : '정답 확인'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowAnswer((prev) => !prev)}
                className="flex items-center gap-1"
              >
                {showAnswer ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                정답 보기
              </Button>
              {availableItems.length > 1 && (
                <Button type="button" variant="ghost" onClick={moveToNextItem}>
                  다음 문항
                </Button>
              )}
            </div>
            {result && (
              <div
                className={cn(
                  'flex items-center gap-2 text-sm',
                  result === 'correct' ? 'text-emerald-600' : 'text-rose-600'
                )}
              >
                {result === 'correct' ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                <span>{result === 'correct' ? '정답입니다!' : '오답입니다. 다시 복습해보세요.'}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {showAnswer && (
        <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
          <p className="font-medium text-slate-800">정답 확인</p>
          {answerType === 'multiple_choice' ? (
            <ul className="list-disc space-y-1 pl-5 text-slate-700">
              {currentItem.workbookItem.choices
                .filter((choice) => correctChoices.includes(choice.id))
                .map((choice) => (
                  <li key={choice.id}>{choice.content}</li>
                ))}
            </ul>
          ) : (
            <ul className="space-y-1 text-slate-700">
              {currentItem.workbookItem.shortFields.map((field) => (
                <li key={field.id}>
                  <span className="font-medium text-slate-800">{field.label ?? '정답'}:</span>{' '}
                  <span>{field.answer}</span>
                </li>
              ))}
            </ul>
          )}
          {currentItem.workbookItem.explanation && (
            <p className="pt-2 text-slate-600">{currentItem.workbookItem.explanation}</p>
          )}
        </div>
      )}
    </div>
  )
}
