'use client'

import Link from 'next/link'
import { Fragment, useEffect, useMemo, useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

import { completePayrollPayment, requestPayrollConfirmation, savePayrollDraft } from '@/app/dashboard/principal/payroll/actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ExternalSubstituteModal } from '@/components/dashboard/principal/payroll/ExternalSubstituteModal'
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

interface PayrollSummaryRow {
  id: string
  name: string
  totalWorkHours: number
  baseSalaryTotal: number
  hourlyRate: number
  grossPay: number
  deductionsTotal: number
  netPay: number
}

type SummarySortField = 'name' | 'totalWorkHours' | 'baseSalaryTotal' | 'hourlyRate' | 'grossPay' | 'deductionsTotal' | 'netPay'
type SortDirection = 'asc' | 'desc'

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
  let index = 0

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
      // Use deterministic ID for initial items to avoid hydration mismatch
      drafts.push({
        id: `init-${index++}`,
        label,
        amount: amountValue.toString(),
      })
    }
  }

  if (drafts.length === 0) {
    const fallback = adjustments.filter((item) => !item.isDeduction && item.label === '인센티브')
    for (const item of fallback) {
      // Use deterministic ID for initial items to avoid hydration mismatch
      drafts.push({
        id: `init-${index++}`,
        label: item.label,
        amount: typeof item.amount === 'number' && Number.isFinite(item.amount) ? item.amount.toString() : '',
      })
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
  if (run.status === 'paid') {
    return { label: '지급 완료', variant: 'default' as const }
  }
  if (run.status === 'confirmed' || acknowledgement?.status === 'confirmed') {
    return { label: '확인 완료', variant: 'outline' as const }
  }
  if (run.status === 'pending_ack') {
    return { label: '확인 대기', variant: 'secondary' as const }
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

function PayrollSummaryTable({ rows, sortField, sortDirection, onSort }: {
  rows: PayrollSummaryRow[]
  sortField: SummarySortField
  sortDirection: SortDirection
  onSort: (field: SummarySortField) => void
}) {
  const totals = rows.reduce(
    (acc, row) => {
      return {
        totalWorkHours: acc.totalWorkHours + row.totalWorkHours,
        baseSalaryTotal: acc.baseSalaryTotal + row.baseSalaryTotal,
        hourlyRateTotal: acc.hourlyRateTotal + row.hourlyRate,
        grossPay: acc.grossPay + row.grossPay,
        deductionsTotal: acc.deductionsTotal + row.deductionsTotal,
        netPay: acc.netPay + row.netPay,
      }
    },
    {
      totalWorkHours: 0,
      baseSalaryTotal: 0,
      hourlyRateTotal: 0,
      grossPay: 0,
      deductionsTotal: 0,
      netPay: 0,
    }
  )

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>
              <SortTrigger
                label="이름"
                field="name"
                sortField={sortField}
                sortDirection={sortDirection}
                onClick={onSort}
              />
            </TableHead>
            <TableHead className="text-right">
              <SortTrigger
                label="근무시간"
                field="totalWorkHours"
                sortField={sortField}
                sortDirection={sortDirection}
                onClick={onSort}
              />
            </TableHead>
            <TableHead className="text-right">
              <SortTrigger
                label="기본급"
                field="baseSalaryTotal"
                sortField={sortField}
                sortDirection={sortDirection}
                onClick={onSort}
              />
            </TableHead>
            <TableHead className="text-right">
              <SortTrigger
                label="시급"
                field="hourlyRate"
                sortField={sortField}
                sortDirection={sortDirection}
                onClick={onSort}
              />
            </TableHead>
            <TableHead className="text-right">
              <SortTrigger
                label="총지급액"
                field="grossPay"
                sortField={sortField}
                sortDirection={sortDirection}
                onClick={onSort}
              />
            </TableHead>
            <TableHead className="text-right">
              <SortTrigger
                label="공제금 합계"
                field="deductionsTotal"
                sortField={sortField}
                sortDirection={sortDirection}
                onClick={onSort}
              />
            </TableHead>
            <TableHead className="text-right">
              <SortTrigger
                label="실지급금"
                field="netPay"
                sortField={sortField}
                sortDirection={sortDirection}
                onClick={onSort}
              />
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="font-medium text-slate-900">{row.name}</TableCell>
              <TableCell className="text-right text-slate-900">{formatHours(row.totalWorkHours)}</TableCell>
              <TableCell className="text-right text-slate-900">{formatCurrency(row.baseSalaryTotal)}</TableCell>
              <TableCell className="text-right text-slate-900">{formatCurrency(row.hourlyRate)}</TableCell>
              <TableCell className="text-right text-slate-900">{formatCurrency(row.grossPay)}</TableCell>
              <TableCell className="text-right text-slate-900">{formatCurrency(row.deductionsTotal)}</TableCell>
              <TableCell className="text-right text-slate-900">{formatCurrency(row.netPay)}</TableCell>
            </TableRow>
          ))}
          <TableRow className="bg-slate-50">
            <TableCell className="font-semibold text-slate-900">총계</TableCell>
            <TableCell className="text-right font-semibold text-slate-900">{formatHours(totals.totalWorkHours)}</TableCell>
            <TableCell className="text-right font-semibold text-slate-900">{formatCurrency(totals.baseSalaryTotal)}</TableCell>
            <TableCell className="text-right font-semibold text-slate-900">{formatCurrency(totals.hourlyRateTotal)}</TableCell>
            <TableCell className="text-right font-semibold text-slate-900">{formatCurrency(totals.grossPay)}</TableCell>
            <TableCell className="text-right font-semibold text-slate-900">{formatCurrency(totals.deductionsTotal)}</TableCell>
            <TableCell className="text-right font-semibold text-slate-900">{formatCurrency(totals.netPay)}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  )
}

function SortTrigger({
  label,
  field,
  sortField,
  sortDirection,
  onClick,
}: {
  label: string
  field: SummarySortField
  sortField: SummarySortField
  sortDirection: SortDirection
  onClick: (field: SummarySortField) => void
}) {
  const isActive = field === sortField
  const nextDirection = isActive && sortDirection === 'asc' ? '↓' : '↑'
  return (
    <button
      type="button"
      onClick={() => onClick(field)}
      className={cn(
        'inline-flex items-center gap-1 text-xs font-medium text-slate-600 transition hover:text-slate-900',
        isActive && 'text-slate-900'
      )}
    >
      <span>{label}</span>
      <span aria-hidden>{nextDirection}</span>
    </button>
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
      savePayrollDraft(formData)
        .then((result) => {
          if (!result?.success || !result.breakdown) {
            setFeedback({ type: 'error', message: result?.error ?? '인센티브를 저장하지 못했습니다.' })
            return
          }
          setCurrentBreakdown(result.breakdown)
          if (typeof result.message === 'string') {
            setMessagePreviewState(result.message)
          }
          setIncentives(result.breakdown.adjustments
            .filter((item) => !item.isDeduction && !previousIncentiveKeys.has(toIncentiveKey(item.label, item.amount)))
            .map((item) => createIncentiveDraft(item.label === '인센티브' ? '' : item.label, item.amount)))
          setFeedback({ type: 'success', message: '인센티브를 저장하고 정산 정보를 갱신했습니다.' })
          router.refresh()
        })
        .catch((error) => {
          console.error('[payroll] save incentives error', error)
          setFeedback({ type: 'error', message: '인센티브 저장 중 오류가 발생했습니다.' })
        })
    })
  }

  const handleCompletePayment = () => {
    if (!run) return
    if (!confirm('정말로 지급 완료 처리하시겠습니까?')) return

    startTransition(async () => {
      setFeedback(null)
      const result = await completePayrollPayment(run.id)
      if (result?.success) {
        setFeedback({ type: 'success', message: '지급 완료 상태로 변경했습니다.' })
        router.refresh()
      } else {
        setFeedback({ type: 'error', message: result?.error ?? '처리하지 못했습니다.' })
      }
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
                시급 {formatCurrency(payrollProfile.hourlyRate)}
                {currentBreakdown.baseSalaryTotal > 0 && ` · 기본급 ${formatCurrency(currentBreakdown.baseSalaryTotal)}`}
                {' '}· 계약 형태{' '}
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
        <section className="space-y-2">
          <details className="rounded-lg border border-slate-200 p-4">
            <summary className="cursor-pointer text-sm font-medium text-slate-900">
              <span>금액 구성</span>
              <span className="ml-4 text-xs font-normal text-slate-500">
                총지급 {formatCurrency(currentBreakdown.grossPay)} · 공제 {formatCurrency(currentBreakdown.deductionsTotal)} · 실지급 {formatCurrency(currentBreakdown.netPay)}
              </span>
            </summary>
            <div className="mt-3">
              <PayrollBreakdownTable breakdown={currentBreakdown} />
            </div>
          </details>
        </section>

        <section className="space-y-2">
          <details className="rounded-lg border border-slate-200 p-4">
            <summary className="cursor-pointer text-sm font-medium text-slate-900">
              <span>주차별 계산 흐름</span>
              <span className="ml-4 text-xs font-normal text-slate-500">
                근무 {formatHours(currentBreakdown.totalWorkHours)} · 주휴수당 {formatHours(currentBreakdown.weeklyHolidayAllowanceHours)}
              </span>
            </summary>
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
            <details className="rounded-lg border border-slate-200 p-4">
              <summary className="cursor-pointer text-sm font-medium text-slate-900">
                <span>구성원 안내 메시지</span>
                <span className="ml-4 text-xs font-normal text-slate-500">기본 메시지 확인 및 추가 안내 입력</span>
              </summary>
              <div className="mt-3 space-y-3">
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
                    placeholder={`${teacher.name ?? teacher.email ?? '구성원'}께 추가로 전달할 요청 사항이 있다면 입력하세요.`}
                    disabled={isPending}
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor={`request-note-${teacher.id}`} className="text-sm font-medium text-slate-900">
                    원장 메모 (카드에 노출)
                  </label>
                  <Textarea
                    id={`request-note-${teacher.id}`}
                    name="requestNote"
                    placeholder="정산 안내 카드에 함께 표시할 메시지를 입력하세요."
                    defaultValue={requestNote ?? ''}
                    disabled={isPending}
                  />
                </div>
              </div>
            </details>
            {feedback && (
              <p className={cn('text-sm', feedback.type === 'success' ? 'text-emerald-600' : 'text-rose-600')}>
                {feedback.message}
              </p>
            )}

            <div className="flex items-center justify-end gap-2">
              {status.label === '확인 완료' && run && (
                <Button type="button" variant="outline" onClick={handleCompletePayment} disabled={isPending || isPreviewing}>
                  지급 완료 처리
                </Button>
              )}
              <Button type="submit" disabled={isPending || isPreviewing}>
                {isPending ? '요청 전송 중…' : '확인 요청'}
              </Button>
            </div>
          </form>
        </section>
      </CardContent>
      <CardFooter className="justify-end text-xs text-slate-500">
        {monthLabel} 정산 기준 · 데이터는 승인된 근무일지에 기반합니다.
      </CardFooter>
    </Card >
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
  const [sortField, setSortField] = useState<SummarySortField>('netPay')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [isExternalModalOpen, setExternalModalOpen] = useState(false)
  const [activeTeacherTab, setActiveTeacherTab] = useState<string | null>(null)

  // 정렬된 순서에 맞게 탭도 정렬
  const sortedTeachers = useMemo(() => {
    return [...teachers].sort((a, b) => {
      const direction = sortDirection === 'asc' ? 1 : -1
      if (sortField === 'name') {
        const nameA = a.teacher.name ?? a.teacher.email ?? ''
        const nameB = b.teacher.name ?? b.teacher.email ?? ''
        return nameA.localeCompare(nameB, 'ko') * direction
      }
      const getValue = (entry: PrincipalPayrollTeacherEntry) => {
        switch (sortField) {
          case 'totalWorkHours': return entry.breakdown.totalWorkHours
          case 'baseSalaryTotal': return entry.breakdown.baseSalaryTotal
          case 'hourlyRate': return entry.payrollProfile.hourlyRate
          case 'grossPay': return entry.breakdown.grossPay
          case 'deductionsTotal': return entry.breakdown.deductionsTotal
          case 'netPay': return entry.breakdown.netPay
          default: return 0
        }
      }
      return (getValue(a) - getValue(b)) * direction
    })
  }, [teachers, sortField, sortDirection])

  // 현재 선택된 교사 (없으면 첫 번째 교사)
  const activeTeacher = useMemo(() => {
    if (sortedTeachers.length === 0) return null
    if (activeTeacherTab) {
      const found = sortedTeachers.find((t) => t.teacher.id === activeTeacherTab)
      if (found) return found
    }
    return sortedTeachers[0]
  }, [sortedTeachers, activeTeacherTab])

  const summaryRows = useMemo<PayrollSummaryRow[]>(() => {
    const unsorted = teachers.map((entry) => ({
      id: entry.teacher.id,
      name: entry.teacher.name ?? entry.teacher.email ?? '이름 미등록',
      totalWorkHours: entry.breakdown.totalWorkHours,
      baseSalaryTotal: entry.breakdown.baseSalaryTotal,
      hourlyRate: entry.payrollProfile.hourlyRate,
      grossPay: entry.breakdown.grossPay,
      deductionsTotal: entry.breakdown.deductionsTotal,
      netPay: entry.breakdown.netPay,
    }))
    const sorted = [...unsorted].sort((a, b) => {
      const direction = sortDirection === 'asc' ? 1 : -1
      if (sortField === 'name') {
        return (a.name ?? '').localeCompare(b.name ?? '', 'ko') * direction
      }
      const valueA = a[sortField]
      const valueB = b[sortField]
      return (valueA - valueB) * direction
    })
    return sorted
  }, [teachers, sortField, sortDirection])

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
      return '전체 교직원'
    }
    const option = teacherOptions.find((item) => item.id === selectedTeacherId)
    return option?.label ?? '전체 교직원'
  }, [selectedTeacherId, teacherOptions])

  const handleSort = (field: SummarySortField) => {
    setSortField((prevField) => {
      if (prevField === field) {
        setSortDirection((prevDirection) => (prevDirection === 'asc' ? 'desc' : 'asc'))
        return prevField
      }
      setSortDirection('asc')
      return field
    })
  }

  return (
    <>
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
              size="sm"
              variant="outline"
              className="mr-2"
              onClick={() => setExternalModalOpen(true)}
            >
              외부 대타 현황
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
                <SelectItem value="all">전체 교직원</SelectItem>
                {teacherOptions.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </header>

        {summaryRows.length > 0 && (
          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-medium text-slate-900">정산 요약</h2>
            <PayrollSummaryTable rows={summaryRows} sortField={sortField} sortDirection={sortDirection} onSort={handleSort} />
          </section>
        )}

        {teachers.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
            표시할 급여 정보가 없습니다. 급여 프로필이 등록된 교직원인지 또는 승인된 근무일지가 있는지 확인해주세요.
          </div>
        ) : (
          <div className="space-y-4">
            {/* 교사 탭 네비게이션 */}
            <div className="flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-white p-2">
              {sortedTeachers.map((entry, index) => {
                const isActive = activeTeacher?.teacher.id === entry.teacher.id
                const teacherName = entry.teacher.name ?? entry.teacher.email ?? '이름 미등록'
                const status = statusBadge(entry.run, entry.acknowledgement)
                return (
                  <button
                    key={entry.teacher.id}
                    type="button"
                    onClick={() => setActiveTeacherTab(entry.teacher.id)}
                    className={cn(
                      'flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors',
                      isActive
                        ? 'border-border bg-secondary text-secondary-foreground'
                        : 'border-transparent bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                    )}
                  >
                    <span className={cn('text-xs', isActive ? 'text-secondary-foreground/70' : 'text-muted-foreground/70')}>{index + 1}</span>
                    <span>{teacherName}</span>
                    <Badge
                      variant={
                        status.label === '지급 완료' ? 'default' :
                        status.label === '확인 완료' ? 'outline' :
                        status.label === '확인 대기' ? 'secondary' : 'secondary'
                      }
                      className={cn(
                        'text-xs',
                        status.label === '지급 완료' && 'bg-emerald-600',
                        status.label === '확인 완료' && 'border-blue-300 text-blue-700',
                        status.label === '확인 대기' && 'bg-amber-100 text-amber-800'
                      )}
                    >
                      {status.label}
                    </Badge>
                  </button>
                )
              })}
            </div>
            
            {/* 선택된 교사의 카드 */}
            {activeTeacher && (
              <TeacherPayrollCard
                key={activeTeacher.teacher.id}
                monthToken={monthToken}
                monthLabel={monthLabel}
                entry={activeTeacher}
              />
            )}
          </div>
        )}
      </section>
      <ExternalSubstituteModal
        open={isExternalModalOpen}
        onOpenChange={setExternalModalOpen}
        monthToken={monthToken}
      />
    </>
  )
}
