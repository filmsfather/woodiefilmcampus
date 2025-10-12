'use client'

import Link from 'next/link'
import { Fragment, useEffect, useMemo, useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

import { previewPayrollAdjustments, requestPayrollConfirmation } from '@/app/dashboard/principal/payroll/actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type {
  PayrollAdjustmentInput,
  PayrollCalculationBreakdown,
  TeacherPayrollAcknowledgement,
  TeacherPayrollProfile,
  TeacherPayrollRun,
} from '@/lib/payroll/types'
import type { TeacherProfileSummary } from '@/lib/work-logs'

interface TeacherOption {
  id: string
  label: string
}

interface PrincipalPayrollTeacherEntry {
  teacher: TeacherProfileSummary
  payrollProfile: TeacherPayrollProfile
  breakdown: PayrollCalculationBreakdown
  run: TeacherPayrollRun | null
  acknowledgement: TeacherPayrollAcknowledgement | null
  messagePreview: string
  adjustments: PayrollAdjustmentInput[]
  requestNote: string | null
}

interface PrincipalPayrollClientProps {
  monthToken: string
  monthLabel: string
  teachers: PrincipalPayrollTeacherEntry[]
  teacherOptions: TeacherOption[]
  selectedTeacherId: string | null
}

interface FeedbackState {
  type: 'success' | 'error'
  message: string
}

interface IncentiveDraft {
  id: string
  label: string
  amount: string
}

function generateDraftId(): string {
  return Math.random().toString(36).slice(2, 10)
}

function createIncentiveDraft(label?: string, amount?: number | string): IncentiveDraft {
  return {
    id: generateDraftId(),
    label: typeof label === 'string' ? label : '',
    amount:
      typeof amount === 'number' && Number.isFinite(amount)
        ? amount.toString()
        : typeof amount === 'string'
          ? amount
          : '',
  }
}

function sanitizeIncentivesForSubmit(incentives: IncentiveDraft[]): Array<{ label: string; amount: number }> {
  return incentives
    .map((item) => ({
      label: item.label.trim(),
      amount: Number.parseFloat(item.amount.replace(/,/g, '')),
    }))
    .filter((item) => item.label.length > 0 && Number.isFinite(item.amount) && item.amount > 0)
    .map((item) => ({
      label: item.label,
      amount: Math.round(item.amount * 100) / 100,
    }))
}

function toIncentiveKey(label: string, amount: number): string {
  return `${label.trim()}::${(Math.round(amount * 100) / 100).toFixed(2)}`
}

function buildIncentiveDrafts(
  meta: Record<string, unknown> | undefined,
  adjustments: PayrollAdjustmentInput[]
): IncentiveDraft[] {
  const drafts: IncentiveDraft[] = []

  const incentivesSource = meta && typeof meta === 'object' ? (meta as Record<string, unknown>).incentives : undefined
  if (Array.isArray(incentivesSource)) {
    for (const item of incentivesSource as Array<{ label?: unknown; amount?: unknown }>) {
      if (!item || typeof item !== 'object') {
        continue
      }
      const label = typeof item.label === 'string' ? item.label : ''
      const amountValue =
        typeof item.amount === 'number'
          ? item.amount
          : Number.parseFloat(String(item.amount ?? ''))
      if (!label || !Number.isFinite(amountValue) || amountValue <= 0) {
        continue
      }
      drafts.push(createIncentiveDraft(label, amountValue))
    }
  }

  if (drafts.length === 0) {
    const fallback = adjustments.filter((item) => !item.isDeduction && item.label === '인센티브')
    for (const item of fallback) {
      drafts.push(createIncentiveDraft(item.label, item.amount))
    }
  }

  return drafts
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

function formatHours(value: number): string {
  return `${Math.round(value * 10) / 10}시간`
}

function shiftMonth(token: string, offset: number): string {
  const [yearToken, monthTokenPart] = token.split('-')
  const year = Number.parseInt(yearToken, 10)
  const monthIndex = Number.parseInt(monthTokenPart, 10) - 1
  const target = new Date(year, monthIndex + offset, 1)
  const nextYear = target.getFullYear()
  const nextMonth = `${target.getMonth() + 1}`.padStart(2, '0')
  return `${nextYear}-${nextMonth}`
}

function statusBadge(run: TeacherPayrollRun | null, acknowledgement: TeacherPayrollAcknowledgement | null) {
  if (!run) {
    return { label: '전송 전', variant: 'secondary' as const }
  }
  if (run.status === 'confirmed' || acknowledgement?.status === 'confirmed') {
    return { label: '확인 완료', variant: 'default' as const }
  }
  if (run.status === 'pending_ack') {
    return { label: '확인 대기', variant: 'outline' as const }
  }
  return { label: '임시 저장', variant: 'secondary' as const }
}

function PayrollBreakdownTable({ breakdown }: { breakdown: PayrollCalculationBreakdown }) {
  const additionRows = [
    { label: '근무급', amount: breakdown.hourlyTotal },
    breakdown.weeklyHolidayAllowance > 0
      ? { label: '주휴수당', amount: breakdown.weeklyHolidayAllowance }
      : null,
    breakdown.baseSalaryTotal > 0 ? { label: '기본급', amount: breakdown.baseSalaryTotal } : null,
  ].filter(Boolean) as Array<{ label: string; amount: number }>

  const adjustmentRows = breakdown.adjustments
    .filter((item) => !item.isDeduction && item.amount !== 0)
    .map((item) => ({ label: `추가 · ${item.label}`, amount: item.amount }))

  const deductionRows = breakdown.deductionDetails.map((item) => ({
    label: `공제 · ${item.label}`,
    amount: item.amount,
  }))

  const deductionAdjustmentRows = breakdown.adjustments
    .filter((item) => item.isDeduction && item.amount !== 0)
    .map((item) => ({ label: `공제 · ${item.label}`, amount: item.amount }))

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>항목</TableHead>
          <TableHead className="text-right">금액</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {additionRows.map((row) => (
          <TableRow key={row.label}>
            <TableCell>{row.label}</TableCell>
            <TableCell className="text-right text-slate-900">{formatCurrency(row.amount)}</TableCell>
          </TableRow>
        ))}
        {adjustmentRows.map((row) => (
          <TableRow key={row.label}>
            <TableCell>{row.label}</TableCell>
            <TableCell className="text-right text-slate-900">{formatCurrency(row.amount)}</TableCell>
          </TableRow>
        ))}
        <TableRow>
          <TableCell className="font-medium text-slate-900">총지급액 (P4)</TableCell>
          <TableCell className="text-right font-semibold text-slate-900">
            {formatCurrency(breakdown.grossPay)}
          </TableCell>
        </TableRow>
        {[...deductionRows, ...deductionAdjustmentRows].map((row) => (
          <TableRow key={row.label}>
            <TableCell>{row.label}</TableCell>
            <TableCell className="text-right text-rose-600">- {formatCurrency(row.amount)}</TableCell>
          </TableRow>
        ))}
        <TableRow>
          <TableCell className="font-medium text-slate-900">실지급액</TableCell>
          <TableCell className="text-right font-semibold text-slate-900">
            {formatCurrency(breakdown.netPay)}
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  )
}

function WeeklySummaryList({ breakdown }: { breakdown: PayrollCalculationBreakdown }) {
  if (breakdown.weeklySummaries.length === 0) {
    return <p className="text-sm text-slate-500">승인된 근무일지가 없어 주차별 요약이 없습니다.</p>
  }

  return (
    <div className="space-y-3 text-sm">
      {breakdown.weeklySummaries.map((week) => (
        <div key={`${week.weekStart}-${week.weekEnd}`} className="rounded-lg border border-slate-200 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium text-slate-900">
              {week.weekStart} ~ {week.weekEnd}
            </p>
            <p className="text-slate-500">근무 {formatHours(week.totalWorkHours)}</p>
          </div>
          <div className="mt-2 space-y-1 text-slate-600">
            <p>
              주휴수당 조건:{' '}
              {week.eligibleForWeeklyHolidayAllowance ? (
                <span className="text-emerald-600">충족</span>
              ) : (
                <span className="text-rose-600">미충족</span>
              )}
            </p>
            {week.eligibleForWeeklyHolidayAllowance ? (
              <p>추가 시간: {formatHours(week.weeklyHolidayAllowanceHours)}</p>
            ) : (
              <Fragment>
                <p>조건 요약</p>
                <ul className="list-disc space-y-0.5 pl-5">
                  <li>근무 시간 {week.totalWorkHours >= 15 ? '충족' : '15시간 미만'}</li>
                  <li>지각 여부: {week.containsTardy ? '있음' : '없음'}</li>
                  <li>결근 여부: {week.containsAbsence ? '있음' : '없음'}</li>
                  <li>대타 여부: {week.containsSubstitute ? '있음' : '없음'}</li>
                </ul>
              </Fragment>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function TeacherPayrollCard({
  monthToken,
  monthLabel,
  entry,
}: {
  monthToken: string
  monthLabel: string
  entry: PrincipalPayrollTeacherEntry
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isPreviewing, startPreviewTransition] = useTransition()
  const [feedback, setFeedback] = useState<FeedbackState | null>(null)

  const { teacher, payrollProfile, breakdown, run, acknowledgement, messagePreview, adjustments, requestNote } = entry
  const status = statusBadge(run, acknowledgement)
  const runMeta = (run?.meta as Record<string, unknown> | undefined) ?? undefined

  const initialIncentives = useMemo(() => buildIncentiveDrafts(runMeta, adjustments), [runMeta, adjustments])
  const [incentives, setIncentives] = useState<IncentiveDraft[]>(initialIncentives)
  const [currentBreakdown, setCurrentBreakdown] = useState(breakdown)
  const [messagePreviewState, setMessagePreviewState] = useState(messagePreview)

  useEffect(() => {
    setIncentives(initialIncentives)
  }, [initialIncentives])

  useEffect(() => {
    setCurrentBreakdown(breakdown)
  }, [breakdown])

  useEffect(() => {
    setMessagePreviewState(messagePreview)
  }, [messagePreview])

  const previousIncentiveKeys = useMemo(() => {
    const keys = new Set<string>()
    for (const draft of initialIncentives) {
      const amount = Number.parseFloat(draft.amount.replace(/,/g, ''))
      if (!Number.isFinite(amount)) {
        continue
      }
      keys.add(toIncentiveKey(draft.label, amount))
    }
    return keys
  }, [initialIncentives])

  const sanitizedIncentives = useMemo(() => sanitizeIncentivesForSubmit(incentives), [incentives])
  const incentivesPayload = useMemo(() => JSON.stringify(sanitizedIncentives), [sanitizedIncentives])

  const adjustmentsPayload = useMemo(() => {
    if (previousIncentiveKeys.size === 0) {
      return JSON.stringify(adjustments)
    }
    const filtered = adjustments.filter((item) => !previousIncentiveKeys.has(toIncentiveKey(item.label, item.amount)))
    return JSON.stringify(filtered)
  }, [adjustments, previousIncentiveKeys])

  const addIncentive = () => {
    setFeedback(null)
    setIncentives((prev) => [...prev, createIncentiveDraft()])
  }

  const handleIncentiveLabelChange = (id: string, value: string) => {
    setFeedback(null)
    setIncentives((prev) => prev.map((item) => (item.id === id ? { ...item, label: value } : item)))
  }

  const handleIncentiveAmountChange = (id: string, value: string) => {
    setFeedback(null)
    setIncentives((prev) => prev.map((item) => (item.id === id ? { ...item, amount: value } : item)))
  }

  const removeIncentive = (id: string) => {
    setFeedback(null)
    setIncentives((prev) => prev.filter((item) => item.id !== id))
  }

  const handleSaveIncentives = () => {
    setFeedback(null)

    const hasInvalidEntry = incentives.some((item) => {
      const label = item.label.trim()
      const amount = Number.parseFloat(item.amount.replace(/,/g, ''))
      if (!label && !item.amount) {
        return false
      }
      if (!label || !Number.isFinite(amount) || amount <= 0) {
        return true
      }
      return false
    })

    if (hasInvalidEntry) {
      setFeedback({ type: 'error', message: '인센티브 내역과 금액을 모두 입력하고, 금액은 0보다 커야 합니다.' })
      return
    }

    const formData = new FormData()
    formData.append('teacherId', teacher.id)
    formData.append('month', monthToken)
    formData.append('adjustments', adjustmentsPayload)
    formData.append('incentives', incentivesPayload)

    startPreviewTransition(() => {
      previewPayrollAdjustments(formData)
        .then((result) => {
          if (!result?.success || !result.breakdown) {
            setFeedback({ type: 'error', message: result?.error ?? '인센티브를 반영하지 못했습니다.' })
            return
          }
          setCurrentBreakdown(result.breakdown)
          if (typeof result.message === 'string') {
            setMessagePreviewState(result.message)
          }
          setIncentives(result.breakdown.adjustments
            .filter((item) => !item.isDeduction && !previousIncentiveKeys.has(toIncentiveKey(item.label, item.amount)))
            .map((item) => createIncentiveDraft(item.label === '인센티브' ? '' : item.label, item.amount)))
          setFeedback({ type: 'success', message: '인센티브를 반영해 정산 미리보기를 업데이트했습니다.' })
        })
        .catch((error) => {
          console.error('[payroll] preview incentives error', error)
          setFeedback({ type: 'error', message: '인센티브 미리보기 중 오류가 발생했습니다.' })
        })
    })
  }

  const handleSubmit = (formData: FormData) => {
    startTransition(async () => {
      setFeedback(null)
      const result = await requestPayrollConfirmation(formData)
      if (result?.success) {
        setFeedback({ type: 'success', message: '확인 요청을 전송했습니다.' })
        router.refresh()
      } else {
        setFeedback({ type: 'error', message: result?.error ?? '요청을 처리하지 못했습니다.' })
      }
    })
  }

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <CardTitle className="text-xl text-slate-900">
                {teacher.name ?? teacher.email ?? '이름 미등록'}
              </CardTitle>
              <Badge variant={status.variant}>{status.label}</Badge>
            </div>
            <CardDescription className="space-y-1 text-sm">
              <p>{teacher.email ?? '이메일 미등록'}</p>
              <p>
                시급 {formatCurrency(payrollProfile.hourlyRate)} · 계약 형태{' '}
                {payrollProfile.contractType === 'employee'
                  ? '근로자'
                  : payrollProfile.contractType === 'freelancer'
                    ? '프리랜서'
                    : '기타'}
                {payrollProfile.insuranceEnrolled ? ' · 4대보험 가입' : ''}
              </p>
            </CardDescription>
          </div>
          <div className="text-right">
            <p className="text-sm text-slate-500">실지급 예정</p>
            <p className="text-2xl font-semibold text-slate-900">{formatCurrency(currentBreakdown.netPay)}</p>
            <p className="text-xs text-slate-500">총지급 {formatCurrency(currentBreakdown.grossPay)}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <section className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-slate-200 p-3">
            <p className="text-sm font-medium text-slate-900">집계 개요</p>
            <dl className="mt-2 space-y-1 text-sm text-slate-600">
              <div className="flex justify-between">
                <dt>근무 시간</dt>
                <dd>{formatHours(currentBreakdown.totalWorkHours)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>주휴수당 시간</dt>
                <dd>{formatHours(currentBreakdown.weeklyHolidayAllowanceHours)}</dd>
              </div>
              {currentBreakdown.baseSalaryTotal > 0 && (
                <div className="flex justify-between">
                  <dt>기본급</dt>
                  <dd>{formatCurrency(currentBreakdown.baseSalaryTotal)}</dd>
                </div>
              )}
            </dl>
          </div>
          <div className="rounded-lg border border-slate-200 p-3">
            <p className="text-sm font-medium text-slate-900">확인 현황</p>
            <dl className="mt-2 space-y-1 text-sm text-slate-600">
              <div className="flex justify-between">
                <dt>요청 상태</dt>
                <dd>{status.label}</dd>
              </div>
              {run?.requestedAt && (
                <div className="flex justify-between">
                  <dt>요청 시간</dt>
                  <dd>{dateTimeFormatter.format(new Date(run.requestedAt))}</dd>
                </div>
              )}
              {acknowledgement?.confirmedAt && (
                <div className="flex justify-between text-emerald-600">
                  <dt>교사 확인</dt>
                  <dd>{dateTimeFormatter.format(new Date(acknowledgement.confirmedAt))}</dd>
                </div>
              )}
              {acknowledgement?.note && (
                <div className="space-y-1">
                  <dt className="font-medium text-slate-900">교사 메모</dt>
                  <dd className="whitespace-pre-wrap text-slate-600">{acknowledgement.note}</dd>
                </div>
              )}
            </dl>
          </div>
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-medium text-slate-900">금액 구성</h3>
          <PayrollBreakdownTable breakdown={currentBreakdown} />
        </section>

        <section className="space-y-2">
          <details className="rounded-lg border border-slate-200 p-4" open>
            <summary className="cursor-pointer text-sm font-medium text-slate-900">주차별 계산 흐름</summary>
            <div className="mt-3">
              <WeeklySummaryList breakdown={currentBreakdown} />
            </div>
          </details>
        </section>

        <section className="space-y-3">
          <form action={handleSubmit} className="space-y-3">
            <input type="hidden" name="teacherId" value={teacher.id} />
            <input type="hidden" name="month" value={monthToken} />
            <input type="hidden" name="adjustments" value={adjustmentsPayload} />
            <input type="hidden" name="incentives" value={incentivesPayload} />
            <div className="space-y-2 rounded-lg border border-slate-200 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-medium text-slate-900">인센티브</h3>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={addIncentive} disabled={isPending || isPreviewing}>
                    인센티브 추가
                  </Button>
                  <Button type="button" size="sm" onClick={handleSaveIncentives} disabled={isPending || isPreviewing}>
                    저장
                  </Button>
                </div>
              </div>
              {incentives.length === 0 ? (
                <p className="text-xs text-slate-500">인센티브가 없다면 비워두세요.</p>
              ) : (
                <div className="space-y-2">
                  {incentives.map((item) => (
                    <div key={item.id} className="flex flex-wrap gap-2 md:items-end">
                      <div className="min-w-[180px] flex-1 space-y-1">
                        <Label htmlFor={`incentive-label-${item.id}`} className="text-xs uppercase text-slate-500">
                          내역
                        </Label>
                        <Input
                          id={`incentive-label-${item.id}`}
                          value={item.label}
                          onChange={(event) => handleIncentiveLabelChange(item.id, event.target.value)}
                          placeholder="예: 상담 보너스"
                          disabled={isPending || isPreviewing}
                        />
                      </div>
                      <div className="w-40 space-y-1">
                        <Label htmlFor={`incentive-amount-${item.id}`} className="text-xs uppercase text-slate-500">
                          금액 (원)
                        </Label>
                        <Input
                          id={`incentive-amount-${item.id}`}
                          type="number"
                          min="0"
                          step="1"
                          value={item.amount}
                          onChange={(event) => handleIncentiveAmountChange(item.id, event.target.value)}
                          placeholder="예: 50000"
                          disabled={isPending || isPreviewing}
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => removeIncentive(item.id)}
                          disabled={isPending || isPreviewing}
                        >
                          삭제
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          onClick={handleSaveIncentives}
                          disabled={isPending || isPreviewing}
                        >
                          저장
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <h3 className="text-sm font-medium text-slate-900">교사 안내 메시지</h3>
              <p className="text-xs text-slate-500">기본 메시지를 확인하고 필요 시 추가 안내를 입력하세요.</p>
            </div>
            <pre className="max-h-64 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 whitespace-pre-wrap">
              {messagePreviewState}
            </pre>
            <div className="space-y-1">
              <label htmlFor={`message-append-${teacher.id}`} className="text-sm font-medium text-slate-900">
                추가 안내 문구 (선택)
              </label>
              <Textarea
                id={`message-append-${teacher.id}`}
                name="messageAppend"
                placeholder={`${teacher.name ?? teacher.email ?? '선생님'}께 추가로 전달할 요청 사항이 있다면 입력하세요.`}
                disabled={isPending}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor={`request-note-${teacher.id}`} className="text-sm font-medium text-slate-900">
                원장 메모 (교사 카드에 노출)
              </label>
              <Textarea
                id={`request-note-${teacher.id}`}
                name="requestNote"
                placeholder="정산 안내 카드에 함께 표시할 메시지를 입력하세요."
                defaultValue={requestNote ?? ''}
                disabled={isPending}
              />
            </div>
            {feedback && (
              <p className={cn('text-sm', feedback.type === 'success' ? 'text-emerald-600' : 'text-rose-600')}>
                {feedback.message}
              </p>
            )}
            <div className="flex items-center justify-end gap-2">
              <Button type="submit" disabled={isPending || isPreviewing}>
                {isPending ? '요청 전송 중…' : '교사 확인 요청'}
              </Button>
            </div>
          </form>
        </section>
      </CardContent>
      <CardFooter className="justify-end text-xs text-slate-500">
        {monthLabel} 정산 기준 · 데이터는 승인된 근무일지에 기반합니다.
      </CardFooter>
    </Card>
  )
}


export function PrincipalPayrollClient({
  monthToken,
  monthLabel,
  teachers,
  teacherOptions,
  selectedTeacherId,
}: PrincipalPayrollClientProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isRouting, startTransition] = useTransition()

  const navigateToMonth = (token: string) => {
    const params = new URLSearchParams(searchParams?.toString())
    params.set('month', token)
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`)
    })
  }

  const updateTeacherFilter = (teacherId: string | null) => {
    const params = new URLSearchParams(searchParams?.toString())
    if (teacherId) {
      params.set('teacher', teacherId)
    } else {
      params.delete('teacher')
    }
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`)
    })
  }

  const currentTeacherLabel = useMemo(() => {
    if (!selectedTeacherId) {
      return '전체 선생님'
    }
    const option = teacherOptions.find((item) => item.id === selectedTeacherId)
    return option?.label ?? '전체 선생님'
  }, [selectedTeacherId, teacherOptions])

  return (
    <section className="mx-auto flex max-w-6xl flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">임금관리</h1>
          <p className="text-sm text-slate-600">{monthLabel} 근무일지 기반 급여를 계산하고 확인 요청을 보냅니다.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            asChild
            size="sm"
            variant="secondary"
            className="mr-2"
          >
            <Link href="/dashboard/principal/payroll/profiles">급여 프로필 관리</Link>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isRouting}
            onClick={() => navigateToMonth(shiftMonth(monthToken, -1))}
          >
            이전 달
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isRouting}
            onClick={() => navigateToMonth(shiftMonth(monthToken, 1))}
          >
            다음 달
          </Button>
          <Select
            value={selectedTeacherId ?? 'all'}
            onValueChange={(value) => updateTeacherFilter(value === 'all' ? null : value)}
            disabled={isRouting}
          >
            <SelectTrigger className="w-48">
              <SelectValue>{currentTeacherLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 선생님</SelectItem>
              {teacherOptions.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </header>

      {teachers.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
          표시할 급여 정보가 없습니다. 급여 프로필이 등록된 선생님이거나 승인된 근무일지가 있는지 확인해주세요.
        </div>
      ) : (
        <div className="space-y-6">
          {teachers.map((entry) => (
            <TeacherPayrollCard key={entry.teacher.id} monthToken={monthToken} monthLabel={monthLabel} entry={entry} />
          ))}
        </div>
      )}
    </section>
  )
}
