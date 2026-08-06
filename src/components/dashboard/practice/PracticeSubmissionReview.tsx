'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, RefreshCw } from 'lucide-react'

import {
  markPracticeAttemptMissedAction,
  retryPracticeOcrAction,
} from '@/app/dashboard/teacher/practice-feedback/actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatKstTime } from '@/lib/practice/shared'
import type { PracticeAttemptDetail } from '@/types/practice'

const OCR_STATUS_LABELS: Record<string, string> = {
  pending: '변환 대기',
  processing: '변환 중',
  done: '변환 완료',
  failed: '변환 실패',
}

export function PracticeSubmissionReview({ attempt }: { attempt: PracticeAttemptDetail }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const handleRetryOcr = () => {
    setError(null)
    startTransition(async () => {
      const result = await retryPracticeOcrAction({ attemptId: attempt.attemptId })
      if (result.error) {
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  const handleMarkMissed = () => {
    if (!window.confirm('이 응시를 미제출로 처리할까요?')) {
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await markPracticeAttemptMissedAction({ attemptId: attempt.attemptId })
      if (result.error) {
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  if (!attempt.submittedAt) {
    return (
      <Card className="border-amber-200 bg-amber-50/60">
        <CardContent className="space-y-3 py-8 text-center">
          <p className="text-sm text-amber-800">
            아직 제출되지 않았습니다. 제출 마감은 {formatKstTime(attempt.deadlineAt)}였습니다.
          </p>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {attempt.status !== 'missed' ? (
            <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={handleMarkMissed}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              미제출로 처리
            </Button>
          ) : (
            <Badge variant="outline">미제출 처리됨</Badge>
          )}
        </CardContent>
      </Card>
    )
  }

  if (attempt.practiceType === 'interview') {
    return (
      <Card className="border-slate-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-slate-900">학생 답안</CardTitle>
          <p className="text-xs text-slate-500">{formatKstTime(attempt.submittedAt)} 제출</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {attempt.problem.items.map((item, index) => (
            <div key={item.id} className="space-y-2 rounded-md border border-slate-200 bg-white p-3">
              <p className="text-xs font-medium text-slate-500">문항 {index + 1}</p>
              <p className="whitespace-pre-wrap text-sm text-slate-600">{item.prompt}</p>
              <div className="rounded-md bg-slate-50 p-3">
                <p className="whitespace-pre-wrap text-sm text-slate-900">
                  {attempt.typedAnswers[item.id]?.trim() || '작성하지 않음'}
                </p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    )
  }

  const ocrReady = attempt.ocrStatus === 'done' && Boolean(attempt.ocrText?.trim())

  return (
    <Card className="border-slate-200">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 pb-3">
        <div>
          <CardTitle className="text-base text-slate-900">제출한 원고</CardTitle>
          <p className="text-xs text-slate-500">
            {formatKstTime(attempt.submittedAt)} 제출 · 사진 {attempt.submissionImages.length}장
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={ocrReady ? 'secondary' : 'outline'}>
            {OCR_STATUS_LABELS[attempt.ocrStatus] ?? attempt.ocrStatus}
          </Badge>
          <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={handleRetryOcr}>
            {isPending ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-1 h-4 w-4" />
            )}
            다시 변환
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        {ocrReady ? (
          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-500">AI 변환 원문</p>
            <div className="max-h-[480px] overflow-y-auto whitespace-pre-wrap rounded-md border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed text-slate-900">
              {attempt.ocrText}
            </div>
          </div>
        ) : (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            손글씨 변환이 아직 완료되지 않았습니다. 아래 원본 사진으로 먼저 확인하고, 필요하면 &ldquo;다시
            변환&rdquo;을 눌러주세요.
          </div>
        )}

        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-500">원본 사진</p>
          <div className="flex flex-wrap gap-3">
            {attempt.submissionImages.map((image, index) =>
              image.url ? (
                <a key={image.id} href={image.url} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={image.url}
                    alt={`제출 원고 ${index + 1}`}
                    className="max-h-80 rounded-md border border-slate-200 object-contain transition hover:opacity-90"
                  />
                </a>
              ) : null
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
