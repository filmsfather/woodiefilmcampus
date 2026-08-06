'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Loader2, Save } from 'lucide-react'

import { savePracticeFeedbackAction } from '@/app/dashboard/teacher/practice-feedback/actions'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { formatKstDateTime } from '@/lib/practice/shared'
import type { PracticeAttemptDetail } from '@/types/practice'

export function PracticeFeedbackForm({ attempt }: { attempt: PracticeAttemptDetail }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [savedMessage, setSavedMessage] = useState<string | null>(null)

  const [feedbackText, setFeedbackText] = useState(attempt.feedback?.feedbackText ?? '')
  const [comment, setComment] = useState(attempt.feedback?.comment ?? '')
  const [scores, setScores] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {}
    for (const score of attempt.feedback?.scores ?? []) {
      initial[score.rubricItemId] = String(score.score)
    }
    return initial
  })

  const maxTotal = useMemo(
    () => attempt.problem.rubricItems.reduce((sum, item) => sum + item.maxScore, 0),
    [attempt.problem.rubricItems]
  )

  const currentTotal = useMemo(() => {
    return attempt.problem.rubricItems.reduce((sum, item) => {
      const value = Number(scores[item.id])
      return sum + (Number.isFinite(value) ? value : 0)
    }, 0)
  }, [attempt.problem.rubricItems, scores])

  const submit = (finalize: boolean) => {
    setError(null)
    setSavedMessage(null)

    const payloadScores: Array<{ rubricItemId: string; score: number }> = []

    for (const item of attempt.problem.rubricItems) {
      const raw = scores[item.id]
      if (raw === undefined || raw === '') {
        continue
      }
      const value = Number(raw)
      if (!Number.isFinite(value) || value < 0) {
        setError(`"${item.label}" 점수를 숫자로 입력해주세요.`)
        return
      }
      if (value > item.maxScore) {
        setError(`"${item.label}" 점수는 배점 ${item.maxScore}점을 넘을 수 없습니다.`)
        return
      }
      payloadScores.push({ rubricItemId: item.id, score: value })
    }

    if (finalize && !window.confirm('피드백을 확정할까요? 확정하면 학생 아카이브에 공개됩니다.')) {
      return
    }

    startTransition(async () => {
      const result = await savePracticeFeedbackAction({
        attemptId: attempt.attemptId,
        feedbackText: feedbackText.trim() || null,
        comment: comment.trim() || null,
        scores: payloadScores,
        finalize,
      })

      if (result.error) {
        setError(result.error)
        return
      }

      setSavedMessage(finalize ? '피드백을 확정했습니다.' : '임시 저장했습니다.')
      router.refresh()
    })
  }

  return (
    <Card className="border-slate-200">
      <CardHeader className="pb-3">
        <CardTitle className="text-base text-slate-900">피드백 작성</CardTitle>
        {attempt.feedback ? (
          <p className="text-xs text-slate-500">
            마지막 저장 {formatKstDateTime(attempt.feedback.updatedAt)}
            {attempt.feedback.teacherName ? ` · ${attempt.feedback.teacherName}` : ''}
          </p>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        {savedMessage && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
            {savedMessage}
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="practice-feedback-text">피드백</Label>
          <Textarea
            id="practice-feedback-text"
            value={feedbackText}
            onChange={(event) => setFeedbackText(event.target.value)}
            placeholder="학생에게 전할 피드백을 작성하세요."
            rows={8}
            maxLength={20000}
            disabled={isPending}
          />
        </div>

        {attempt.practiceType === 'interview' ? (
          <div className="space-y-2">
            <Label htmlFor="practice-feedback-comment">면접 코멘트</Label>
            <Textarea
              id="practice-feedback-comment"
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder="녹화 면접에서 관찰한 태도, 발화, 보완점 등을 덧붙이세요."
              rows={5}
              maxLength={10000}
              disabled={isPending}
            />
          </div>
        ) : null}

        {attempt.problem.rubricItems.length > 0 ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>채점표</Label>
              <span className="text-sm font-medium text-slate-700">
                {currentTotal} / {maxTotal}점
              </span>
            </div>
            <div className="space-y-2">
              {attempt.problem.rubricItems.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center gap-3 rounded-md border border-slate-200 bg-white p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900">{item.label}</p>
                    {item.description ? <p className="text-xs text-slate-500">{item.description}</p> : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={0}
                      max={item.maxScore}
                      step={0.5}
                      value={scores[item.id] ?? ''}
                      onChange={(event) =>
                        setScores((prev) => ({ ...prev, [item.id]: event.target.value }))
                      }
                      disabled={isPending}
                      className="w-24"
                      aria-label={`${item.label} 점수`}
                    />
                    <span className="text-sm text-slate-500">/ {item.maxScore}점</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" disabled={isPending} onClick={() => submit(false)}>
            {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            임시 저장
          </Button>
          <Button type="button" disabled={isPending} onClick={() => submit(true)}>
            {isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="mr-2 h-4 w-4" />
            )}
            피드백 확정
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
