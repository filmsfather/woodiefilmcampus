'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlarmClock, Loader2 } from 'lucide-react'

import {
  startExamAttemptAction,
  submitExamAnswersAction,
} from '@/app/dashboard/student/exams/actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { ALLOW_LATE_SUBMISSION } from '@/lib/exam-settings'
import type { StudentExamRunnerData } from '@/types/exam'

const AUTOSAVE_INTERVAL_MS = 30 * 1000

const RESULT_BADGE: Record<string, { label: string; className: string }> = {
  pending: { label: '판정 대기', className: 'bg-slate-100 text-slate-700' },
  pass: { label: 'PASS', className: 'bg-emerald-100 text-emerald-700' },
  nonpass: { label: 'NON-PASS', className: 'bg-rose-100 text-rose-700' },
}

function formatRemaining(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })
}

interface ExamRunnerProps {
  data: StudentExamRunnerData
}

export function ExamRunner({ data }: ExamRunnerProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const attempt = data.attempt
  const isStarted = Boolean(attempt?.startedAt)
  const isSubmitted = Boolean(attempt?.submittedAt)

  const [answers, setAnswers] = useState<Map<string, string>>(() => {
    const map = new Map<string, string>()
    for (const question of data.questions) {
      const saved = attempt?.answers.find((answer) => answer.questionId === question.id)
      map.set(question.id, saved?.content ?? '')
    }
    return map
  })

  // 서버-클라이언트 시계 차이를 보정한 남은 시간 계산
  const skewMs = useMemo(() => Date.now() - new Date(data.serverNow).getTime(), [data.serverNow])
  const deadlineMs = useMemo(() => {
    if (!attempt?.startedAt) return null
    return Math.min(
      new Date(attempt.startedAt).getTime() + data.durationMinutes * 60 * 1000,
      new Date(data.closesAt).getTime()
    )
  }, [attempt?.startedAt, data.durationMinutes, data.closesAt])

  const [remainingMs, setRemainingMs] = useState<number | null>(() =>
    deadlineMs ? deadlineMs - (Date.now() - skewMs) : null
  )

  const answersRef = useRef(answers)
  answersRef.current = answers
  const autoSubmittedRef = useRef(false)

  const buildPayload = useCallback(
    (submit: boolean) => ({
      attemptId: attempt?.id ?? '',
      submit,
      answers: data.questions.map((question) => ({
        questionId: question.id,
        content: answersRef.current.get(question.id) ?? '',
      })),
    }),
    [attempt?.id, data.questions]
  )

  const handleSubmit = useCallback(
    (auto = false) => {
      if (!attempt?.id) return
      if (!auto && !window.confirm('시험을 제출할까요? 제출 후에는 수정할 수 없습니다.')) return

      setError(null)
      startTransition(async () => {
        const result = await submitExamAnswersAction(buildPayload(true))
        if (result.success) {
          router.refresh()
        } else {
          setError(result.error ?? '제출에 실패했습니다.')
        }
      })
    },
    [attempt?.id, buildPayload, router]
  )

  // 타이머
  useEffect(() => {
    if (!deadlineMs || isSubmitted) return

    const tick = () => {
      const remaining = deadlineMs - (Date.now() - skewMs)
      setRemainingMs(remaining)
      if (remaining <= 0 && !ALLOW_LATE_SUBMISSION && !autoSubmittedRef.current) {
        autoSubmittedRef.current = true
        handleSubmit(true)
      }
    }

    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [deadlineMs, isSubmitted, skewMs, handleSubmit])

  // 자동 임시저장
  useEffect(() => {
    if (!isStarted || isSubmitted || !attempt?.id) return

    const interval = setInterval(() => {
      void submitExamAnswersAction(buildPayload(false))
    }, AUTOSAVE_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [isStarted, isSubmitted, attempt?.id, buildPayload])

  const handleStart = () => {
    setError(null)
    startTransition(async () => {
      const result = await startExamAttemptAction(data.sessionId)
      if (result.success) {
        router.refresh()
      } else {
        setError(result.error ?? '시험 시작에 실패했습니다.')
      }
    })
  }

  const now = Date.now() - skewMs
  const notYetOpen = now < new Date(data.opensAt).getTime()
  const alreadyClosed =
    data.sessionStatus !== 'open' ||
    (!ALLOW_LATE_SUBMISSION && now > new Date(data.closesAt).getTime())

  // 제출 완료 화면
  if (isSubmitted && attempt) {
    const badge = RESULT_BADGE[attempt.result] ?? RESULT_BADGE.pending
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          시험을 제출했습니다. 결과: <Badge className={badge.className}>{badge.label}</Badge>
        </div>
        <div className="space-y-4">
          {data.questions.map((question, index) => (
            <Card key={question.id} className="border-slate-200">
              <CardHeader>
                <CardTitle className="text-sm font-medium text-slate-900">
                  문항 {index + 1}. <span className="whitespace-pre-wrap font-normal">{question.prompt}</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="rounded bg-slate-50 p-3 text-sm text-slate-700 whitespace-pre-wrap">
                  {attempt.answers.find((answer) => answer.questionId === question.id)?.content?.trim() || (
                    <span className="text-slate-400">답안 없음</span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  // 시작 전 화면
  if (!isStarted) {
    return (
      <div className="space-y-4">
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
        )}
        <Card className="border-slate-200">
          <CardContent className="space-y-3 py-6 text-center">
            <AlarmClock className="mx-auto h-10 w-10 text-slate-400" />
            <p className="text-sm text-slate-700">
              제한시간 <span className="font-semibold">{data.durationMinutes}분</span> · 문항{' '}
              {data.questions.length}개
            </p>
            <p className="text-xs text-slate-500">
              응시 기간: {formatDateTime(data.opensAt)} ~ {formatDateTime(data.closesAt)}
            </p>
            <p className="text-xs text-slate-500">
              시작 버튼을 누르는 순간부터 제한시간이 흐르며, 시간이 끝나면 자동으로 제출됩니다.
            </p>
            <Button
              size="lg"
              disabled={isPending || notYetOpen || alreadyClosed}
              onClick={handleStart}
            >
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {notYetOpen ? '응시 시작 전입니다' : alreadyClosed ? '응시 기간이 종료되었습니다' : '시험 시작'}
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // 응시 중 화면
  return (
    <div className="space-y-4">
      <div className="sticky top-2 z-10 flex items-center justify-between rounded-md border border-slate-200 bg-white/95 p-3 shadow-sm">
        <div className="flex items-center gap-2 text-sm text-slate-700">
          <AlarmClock className="h-4 w-4 text-slate-500" />
          남은 시간
          <span
            className={`font-mono text-lg font-semibold ${
              remainingMs !== null && remainingMs < 5 * 60 * 1000 ? 'text-rose-600' : 'text-slate-900'
            }`}
          >
            {remainingMs !== null ? formatRemaining(remainingMs) : '--:--'}
          </span>
        </div>
        <Button size="sm" disabled={isPending} onClick={() => handleSubmit(false)}>
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          제출하기
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {data.questions.map((question, index) => (
        <Card key={question.id} className="border-slate-200">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-slate-900">
              문항 {index + 1}. <span className="whitespace-pre-wrap font-normal">{question.prompt}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {question.assets.length > 0 && (
              <div className="flex flex-wrap gap-3">
                {question.assets.map((asset, assetIndex) =>
                  asset.url ? (
                    <a key={asset.id} href={asset.url} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={asset.url}
                        alt={`문항 ${index + 1} 이미지 ${assetIndex + 1}`}
                        className="max-h-56 rounded-md border border-slate-200 object-contain"
                      />
                    </a>
                  ) : null
                )}
              </div>
            )}
            <Textarea
              value={answers.get(question.id) ?? ''}
              onChange={(event) =>
                setAnswers((prev) => {
                  const next = new Map(prev)
                  next.set(question.id, event.target.value)
                  return next
                })
              }
              placeholder="답안을 작성하세요"
              rows={6}
              disabled={isPending}
            />
          </CardContent>
        </Card>
      ))}

      <div className="flex justify-end">
        <Button disabled={isPending} onClick={() => handleSubmit(false)}>
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          제출하기
        </Button>
      </div>
    </div>
  )
}
