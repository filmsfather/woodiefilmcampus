'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { confirmPayrollAcknowledgement } from '@/app/dashboard/teacher/work-journal/actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { WeeklyWorkSummary } from '@/lib/payroll/types'

interface TeacherPayrollCardData {
  runId: string
  status: 'draft' | 'pending_ack' | 'confirmed'
  grossPay: number
  netPay: number
  messagePreview: string | null
  requestedAt: string | null
  confirmedAt: string | null
  acknowledgementStatus: 'pending' | 'confirmed' | null
  acknowledgementNote: string | null
  requestNote: string | null
  totalWorkHours: number | null
  weeklyHolidayAllowanceHours: number | null
  weeklySummaries: WeeklyWorkSummary[]
}

interface TeacherPayrollCardProps {
  monthLabel: string
  data: TeacherPayrollCardData
}

interface FeedbackState {
  type: 'success' | 'error'
  message: string
}

const currencyFormatter = new Intl.NumberFormat('ko-KR', {
  style: 'currency',
  currency: 'KRW',
  minimumFractionDigits: 0,
})

const dateTimeFormatter = new Intl.DateTimeFormat('ko-KR', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

function formatCurrency(value: number): string {
  return currencyFormatter.format(Math.round(value))
}

function formatHours(value: number | null): string {
  if (value === null) {
    return '-'
  }
  return `${Math.round(value * 10) / 10}시간`
}

export function TeacherPayrollCard({ monthLabel, data }: TeacherPayrollCardProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<FeedbackState | null>(null)

  const status = data.acknowledgementStatus ?? (data.status === 'confirmed' ? 'confirmed' : 'pending')

  const handleSubmit = (formData: FormData) => {
    startTransition(async () => {
      setFeedback(null)
      const result = await confirmPayrollAcknowledgement(formData)
      if (result?.success) {
        setFeedback({ type: 'success', message: '확인 완료로 전송했습니다.' })
        router.refresh()
      } else {
        setFeedback({ type: 'error', message: result?.error ?? '정산 확인에 실패했습니다.' })
      }
    })
  }

  return (
    <Card className="border-slate-200 bg-white shadow-sm">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <CardTitle className="text-xl text-slate-900">{monthLabel} 급여 정산 안내</CardTitle>
              <Badge variant={status === 'confirmed' ? 'default' : status === 'pending' ? 'outline' : 'secondary'}>
                {status === 'confirmed' ? '확인 완료' : '확인 대기'}
              </Badge>
            </div>
            <CardDescription>
              원장님이 공유한 정산 결과를 확인하고 문제가 없다면 확인 완료로 응답해주세요.
            </CardDescription>
          </div>
          <div className="text-right">
            <p className="text-sm text-slate-500">실지급 예정</p>
            <p className="text-2xl font-semibold text-slate-900">{formatCurrency(data.netPay)}</p>
            <p className="text-xs text-slate-500">총지급 {formatCurrency(data.grossPay)}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          <p className="font-medium text-slate-900">정산 메시지</p>
          <pre className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{data.messagePreview ?? '정산 메시지를 불러오지 못했습니다.'}</pre>
        </div>
        {data.requestNote && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-medium">원장 메모</p>
            <p className="mt-1 whitespace-pre-wrap">{data.requestNote}</p>
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-slate-200 p-3 text-sm text-slate-600">
            <p className="text-xs uppercase tracking-wide text-slate-500">근무 시간</p>
            <p className="mt-1 text-base font-medium text-slate-900">{formatHours(data.totalWorkHours)}</p>
          </div>
          <div className="rounded-lg border border-slate-200 p-3 text-sm text-slate-600">
            <p className="text-xs uppercase tracking-wide text-slate-500">주휴수당 시간</p>
            <p className="mt-1 text-base font-medium text-slate-900">{formatHours(data.weeklyHolidayAllowanceHours)}</p>
          </div>
          <div className="rounded-lg border border-slate-200 p-3 text-sm text-slate-600">
            <p className="text-xs uppercase tracking-wide text-slate-500">요청 시간</p>
            <p className="mt-1 text-base font-medium text-slate-900">
              {data.requestedAt ? dateTimeFormatter.format(new Date(data.requestedAt)) : '미요청'}
            </p>
          </div>
        </div>
        {data.weeklySummaries.length > 0 && (
          <details className="rounded-lg border border-slate-200 p-4" open>
            <summary className="cursor-pointer text-sm font-medium text-slate-900">주차별 요약 열기</summary>
            <div className="mt-3 space-y-3 text-sm text-slate-600">
              {data.weeklySummaries.map((week) => (
                <div key={`${week.weekStart}-${week.weekEnd}`} className="rounded border border-slate-200 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium text-slate-900">
                      {week.weekStart} ~ {week.weekEnd}
                    </p>
                    <p>근무 {formatHours(week.totalWorkHours)}</p>
                  </div>
                  <p className="mt-1">
                    주휴수당 조건: {week.eligibleForWeeklyHolidayAllowance ? '충족' : '미충족'}
                  </p>
                </div>
              ))}
            </div>
          </details>
        )}
        {status === 'confirmed' && data.confirmedAt && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
            <p className="font-medium">확인을 완료했습니다.</p>
            <p className="mt-1 text-xs">{dateTimeFormatter.format(new Date(data.confirmedAt))}에 전달되었습니다.</p>
            {data.acknowledgementNote && (
              <p className="mt-2 whitespace-pre-wrap">내 메모: {data.acknowledgementNote}</p>
            )}
          </div>
        )}
        {status === 'pending' && (
          <form action={handleSubmit} className="space-y-3">
            <input type="hidden" name="runId" value={data.runId} />
            <div className="space-y-1">
              <label htmlFor={`payroll-ack-note-${data.runId}`} className="text-sm font-medium text-slate-900">
                메모 (선택)
              </label>
              <Textarea
                id={`payroll-ack-note-${data.runId}`}
                name="note"
                placeholder="정산을 확인하면서 공유하고 싶은 내용을 적어주세요."
                defaultValue={data.acknowledgementNote ?? ''}
                disabled={isPending}
              />
            </div>
            {feedback && (
              <p className={cn('text-sm', feedback.type === 'success' ? 'text-emerald-600' : 'text-rose-600')}>
                {feedback.message}
              </p>
            )}
            <div className="flex justify-end">
              <Button type="submit" disabled={isPending}>
                {isPending ? '전송 중…' : '확인 완료'}
              </Button>
            </div>
          </form>
        )}
      </CardContent>
      <CardFooter className="justify-end text-xs text-slate-500">
        정산 금액은 승인된 근무일지를 기준으로 계산되었습니다.
      </CardFooter>
    </Card>
  )
}
