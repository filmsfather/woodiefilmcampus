'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

import {
  evaluateReviewTaskAction,
  passReviewTaskAllAction,
} from '@/app/dashboard/principal/exams/actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import type { ExamReviewTaskView } from '@/types/exam'

const RESULT_BADGE: Record<string, { label: string; className: string }> = {
  pending: { label: '판정 대기', className: 'bg-slate-100 text-slate-700' },
  pass: { label: 'PASS', className: 'bg-emerald-100 text-emerald-700' },
  nonpass: { label: 'NON-PASS', className: 'bg-rose-100 text-rose-700' },
}

interface ItemDecision {
  result: 'pass' | 'nonpass'
  feedback: string
}

interface ReviewTaskEvaluationProps {
  task: ExamReviewTaskView
}

export function ReviewTaskEvaluation({ task }: ReviewTaskEvaluationProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [decisions, setDecisions] = useState<Map<string, ItemDecision>>(() => {
    const map = new Map<string, ItemDecision>()
    for (const item of task.items) {
      map.set(item.id, {
        result: item.result === 'nonpass' ? 'nonpass' : 'pass',
        feedback: item.feedback ?? '',
      })
    }
    return map
  })

  const updateDecision = (itemId: string, updater: (decision: ItemDecision) => ItemDecision) => {
    setDecisions((prev) => {
      const next = new Map(prev)
      const current = next.get(itemId) ?? { result: 'pass' as const, feedback: '' }
      next.set(itemId, updater(current))
      return next
    })
  }

  const handleSave = () => {
    setError(null)
    startTransition(async () => {
      const result = await evaluateReviewTaskAction({
        reviewTaskId: task.id,
        items: task.items.map((item) => {
          const decision = decisions.get(item.id) ?? { result: 'pass' as const, feedback: '' }
          return {
            itemId: item.id,
            result: decision.result,
            feedback: decision.feedback.trim() || null,
          }
        }),
      })

      if (result.success) {
        router.refresh()
      } else {
        setError(result.error ?? '판정 저장에 실패했습니다.')
      }
    })
  }

  const handlePassAll = () => {
    setError(null)
    startTransition(async () => {
      const result = await passReviewTaskAllAction(task.id)
      if (result.success) {
        router.refresh()
      } else {
        setError(result.error ?? '일괄 통과 처리에 실패했습니다.')
      }
    })
  }

  const canEvaluate = task.status === 'submitted' || task.status === 'partial' || task.status === 'pass'

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {task.status === 'assigned' && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
          학생이 아직 오답노트를 제출하지 않았습니다.
        </div>
      )}

      {task.items.map((item, index) => {
        const decision = decisions.get(item.id) ?? { result: 'pass' as const, feedback: '' }
        const badge = RESULT_BADGE[item.result] ?? RESULT_BADGE.pending

        return (
          <Card key={item.id} className="border-slate-200">
            <CardHeader className="flex flex-row items-start justify-between gap-2">
              <CardTitle className="text-sm font-medium text-slate-900">
                문항 {index + 1}. <span className="whitespace-pre-wrap font-normal">{item.prompt}</span>
              </CardTitle>
              <Badge className={badge.className}>{badge.label}</Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="mb-1 text-xs font-medium text-slate-500">학생 답안</p>
                <div className="rounded bg-slate-50 p-3 text-sm text-slate-700 whitespace-pre-wrap">
                  {item.answerContent?.trim() ? item.answerContent : <span className="text-slate-400">답안 없음</span>}
                </div>
              </div>

              {item.assets.length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs font-medium text-slate-500">제출 이미지</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {item.assets.map((asset, assetIndex) => (
                      <figure key={asset.id} className="space-y-1">
                        {asset.url ? (
                          <a href={asset.url} target="_blank" rel="noreferrer">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={asset.url}
                              alt={`이미지 ${assetIndex + 1}`}
                              className="max-h-64 w-full rounded-md border border-slate-200 object-contain"
                            />
                          </a>
                        ) : (
                          <div className="rounded-md border border-slate-200 p-4 text-xs text-slate-400">
                            이미지를 불러오지 못했습니다.
                          </div>
                        )}
                        <figcaption className="text-xs text-slate-600 whitespace-pre-wrap">
                          {asset.caption?.trim() ? asset.caption : '해설 없음'}
                        </figcaption>
                      </figure>
                    ))}
                  </div>
                </div>
              )}

              {canEvaluate && (
                <div className="space-y-2 rounded-md border border-slate-200 p-3">
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={decision.result === 'pass' ? 'default' : 'outline'}
                      className={decision.result === 'pass' ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
                      disabled={isPending}
                      onClick={() => updateDecision(item.id, (entry) => ({ ...entry, result: 'pass' }))}
                    >
                      PASS
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={decision.result === 'nonpass' ? 'destructive' : 'outline'}
                      disabled={isPending}
                      onClick={() => updateDecision(item.id, (entry) => ({ ...entry, result: 'nonpass' }))}
                    >
                      NON-PASS
                    </Button>
                  </div>
                  <Textarea
                    value={decision.feedback}
                    onChange={(event) =>
                      updateDecision(item.id, (entry) => ({ ...entry, feedback: event.target.value }))
                    }
                    placeholder="피드백 (선택)"
                    rows={2}
                    maxLength={2000}
                    disabled={isPending}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}

      {canEvaluate && (
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            className="border-emerald-300 text-emerald-700 hover:bg-emerald-50"
            disabled={isPending}
            onClick={handlePassAll}
          >
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            전체 통과
          </Button>
          <Button disabled={isPending} onClick={handleSave}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            판정 저장
          </Button>
        </div>
      )}
    </div>
  )
}
