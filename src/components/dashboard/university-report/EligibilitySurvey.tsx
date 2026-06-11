'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

import { saveEligibility } from '@/app/dashboard/student/university-report/actions'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { ReportEligibility } from '@/lib/university-report/types'

interface EligibilitySurveyProps {
  studentId: string
  initial?: ReportEligibility | null
  isViewingOther?: boolean
}

type AnswerKey = 'isGed' | 'ruralEligible' | 'lowIncomeEligible'

const QUESTIONS: { key: AnswerKey; label: string; hint?: string }[] = [
  {
    key: 'isGed',
    label: '검정고시로 지원하시나요?',
    hint: '검정고시 응시자는 성적증명서 업로드가 필요하지 않습니다.',
  },
  {
    key: 'ruralEligible',
    label: '농어촌 전형에 지원 가능한가요?',
    hint: '농어촌 지역 거주·재학 요건을 충족하는 경우 "예"를 선택하세요.',
  },
  {
    key: 'lowIncomeEligible',
    label: '차상위 전형에 지원 가능한가요?',
    hint: '차상위계층·기초생활수급 등 요건을 충족하는 경우 "예"를 선택하세요.',
  },
]

export default function EligibilitySurvey({
  studentId,
  initial = null,
  isViewingOther = false,
}: EligibilitySurveyProps) {
  const router = useRouter()
  const [answers, setAnswers] = useState<Record<AnswerKey, boolean | null>>({
    isGed: initial?.isGed ?? null,
    ruralEligible: initial?.ruralEligible ?? null,
    lowIncomeEligible: initial?.lowIncomeEligible ?? null,
  })
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const allAnswered = QUESTIONS.every(({ key }) => answers[key] !== null)

  const handleSelect = (key: AnswerKey, value: boolean) => {
    setAnswers((prev) => ({ ...prev, [key]: value }))
  }

  const handleSubmit = () => {
    if (!allAnswered || isPending) return
    setErrorMessage(null)

    startTransition(async () => {
      const result = await saveEligibility({
        studentId,
        isGed: answers.isGed ?? false,
        ruralEligible: answers.ruralEligible ?? false,
        lowIncomeEligible: answers.lowIncomeEligible ?? false,
      })

      if ('error' in result) {
        setErrorMessage(result.error)
        return
      }

      router.refresh()
    })
  }

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base font-semibold text-slate-900">
          성적 등록 전 사전 조사
        </CardTitle>
        <p className="text-sm text-slate-600">
          {isViewingOther
            ? '학생을 대신해 아래 항목을 확인해주세요. 응답에 따라 이후 단계가 달라집니다.'
            : '성적증명서를 업로드하기 전에 아래 세 가지 항목에 응답해주세요. 응답에 따라 이후 단계가 달라집니다.'}
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {QUESTIONS.map(({ key, label, hint }) => (
          <div key={key} className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <p className="text-sm font-medium text-slate-900">{label}</p>
                {hint ? <p className="text-xs text-slate-500">{hint}</p> : null}
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={answers[key] === true ? 'default' : 'outline'}
                  className={cn('min-w-16', answers[key] === true && 'bg-sky-600 hover:bg-sky-700')}
                  onClick={() => handleSelect(key, true)}
                  disabled={isPending}
                >
                  예
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={answers[key] === false ? 'default' : 'outline'}
                  className={cn(
                    'min-w-16',
                    answers[key] === false && 'bg-slate-700 hover:bg-slate-800'
                  )}
                  onClick={() => handleSelect(key, false)}
                  disabled={isPending}
                >
                  아니오
                </Button>
              </div>
            </div>
          </div>
        ))}

        {errorMessage ? <p className="text-xs text-red-600">{errorMessage}</p> : null}

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button type="button" onClick={handleSubmit} disabled={!allAnswered || isPending} className="gap-2">
            {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            응답 저장하고 계속하기
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
