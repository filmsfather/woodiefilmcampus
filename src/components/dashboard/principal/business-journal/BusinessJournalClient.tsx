'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { Textarea } from '@/components/ui/textarea'
import {
  upsertLedgerEntry,
  deleteLedgerEntry,
  saveJournalMemo,
  type LedgerEntryRow,
} from '@/app/dashboard/principal/business-journal/actions'

export interface PayrollSummaryEntry {
  id: string
  name: string
  insuranceEnrolled: boolean
  totalWorkHours: number
  baseSalaryTotal: number
  hourlyRate: number
  weeklyHolidayRate: number
  grossPay: number
  deductionsTotal: number
  netPay: number
  role?: string
}

interface ComputedRow extends PayrollSummaryEntry {
  employerInsurance: number
  retirementPension: number
}

const NATIONAL_PENSION_EMPLOYER = 0.045
const HEALTH_INSURANCE_TOTAL = 0.0709
const HEALTH_INSURANCE_EMPLOYER = 0.03545
const LONG_TERM_CARE_RATE = 0.1281
const EMPLOYMENT_INSURANCE_EMPLOYER = 0.009 + 0.0025

function calcEmployerInsurance(grossPay: number, enrolled: boolean): number {
  if (!enrolled) return 0
  const nationalPension = grossPay * NATIONAL_PENSION_EMPLOYER
  const healthInsurance = grossPay * HEALTH_INSURANCE_EMPLOYER
  const longTermCare = grossPay * HEALTH_INSURANCE_TOTAL * LONG_TERM_CARE_RATE / 2
  const employment = grossPay * EMPLOYMENT_INSURANCE_EMPLOYER
  return Math.round(nationalPension + healthInsurance + longTermCare + employment)
}

function calcRetirementPension(grossPay: number, enrolled: boolean): number {
  if (!enrolled) return 0
  return Math.round(grossPay / 12)
}

type SortField = 'name' | 'totalWorkHours' | 'baseSalaryTotal' | 'hourlyRate' | 'grossPay' | 'deductionsTotal' | 'netPay' | 'employerInsurance' | 'retirementPension'
type SortDirection = 'asc' | 'desc'

export interface LedgerItem {
  id: string
  label: string
  amount: number | null
  sortOrder: number
  isAuto?: boolean
  dbId?: string
}

interface BusinessJournalClientProps {
  monthToken: string
  monthLabel: string
  entries: PayrollSummaryEntry[]
  savedLedgerEntries: LedgerEntryRow[]
  savedMemo: string
}

const currencyFormatter = new Intl.NumberFormat('ko-KR', {
  style: 'currency',
  currency: 'KRW',
  minimumFractionDigits: 0,
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

function SortTrigger({
  label,
  field,
  sortField,
  sortDirection,
  onClick,
}: {
  label: string
  field: SortField
  sortField: SortField
  sortDirection: SortDirection
  onClick: (field: SortField) => void
}) {
  const isActive = field === sortField
  const arrow = isActive && sortDirection === 'asc' ? '↓' : '↑'
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
      <span aria-hidden>{arrow}</span>
    </button>
  )
}

let nextTempId = 0
function tempId() {
  return `temp-${++nextTempId}-${Date.now()}`
}

function buildInitialItems(
  savedEntries: LedgerEntryRow[],
  type: 'income' | 'expense',
  payrollTotals: { netPay: number; retirementPension: number },
): LedgerItem[] {
  const saved = savedEntries.filter((e) => e.entry_type === type)

  if (type === 'expense') {
    const autoItems: LedgerItem[] = [
      { id: 'auto-net-pay', label: '급여 (실지급금)', amount: payrollTotals.netPay, sortOrder: -2, isAuto: true },
      { id: 'auto-retirement', label: '급여 (퇴직연금)', amount: payrollTotals.retirementPension, sortOrder: -1, isAuto: true },
    ]
    if (saved.length > 0) {
      return [
        ...autoItems,
        ...saved.map((e) => ({
          id: e.id,
          label: e.label,
          amount: e.amount,
          sortOrder: e.sort_order,
          dbId: e.id,
        })),
      ]
    }
    return [
      ...autoItems,
      { id: tempId(), label: '삼성카드', amount: null, sortOrder: 0 },
      { id: tempId(), label: '국민기업카드', amount: null, sortOrder: 1 },
      { id: tempId(), label: '국민기업카드', amount: null, sortOrder: 2 },
      { id: tempId(), label: '현대카드', amount: null, sortOrder: 3 },
    ]
  }

  if (saved.length > 0) {
    return saved.map((e) => ({
      id: e.id,
      label: e.label,
      amount: e.amount,
      sortOrder: e.sort_order,
      dbId: e.id,
    }))
  }
  return [{ id: tempId(), label: '이번달 총수입', amount: null, sortOrder: 0 }]
}

function parseAmountInput(value: string): number | null {
  const cleaned = value.replace(/[^0-9-]/g, '')
  if (!cleaned) return null
  const num = Number.parseInt(cleaned, 10)
  return Number.isNaN(num) ? null : num
}

function formatAmountForInput(amount: number | null): string {
  if (amount === null) return ''
  return amount.toLocaleString('ko-KR')
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

export function BusinessJournalClient({ monthToken, monthLabel, entries, savedLedgerEntries, savedMemo }: BusinessJournalClientProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isRouting, startTransition] = useTransition()
  const [sortField, setSortField] = useState<SortField>('netPay')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')

  const computedRows = useMemo<ComputedRow[]>(() => {
    return entries.map((e) => ({
      ...e,
      employerInsurance: calcEmployerInsurance(e.grossPay, e.insuranceEnrolled),
      retirementPension: calcRetirementPension(e.grossPay, e.insuranceEnrolled),
    }))
  }, [entries])

  const sortedRows = useMemo(() => {
    return [...computedRows].sort((a, b) => {
      const dir = sortDirection === 'asc' ? 1 : -1
      if (sortField === 'name') {
        return a.name.localeCompare(b.name, 'ko') * dir
      }
      if (sortField === 'hourlyRate') {
        return ((a.hourlyRate + a.weeklyHolidayRate) - (b.hourlyRate + b.weeklyHolidayRate)) * dir
      }
      return (a[sortField] - b[sortField]) * dir
    })
  }, [computedRows, sortField, sortDirection])

  const payrollTotals = useMemo(() => {
    return computedRows.reduce(
      (acc, row) => ({
        totalWorkHours: acc.totalWorkHours + row.totalWorkHours,
        baseSalaryTotal: acc.baseSalaryTotal + row.baseSalaryTotal,
        hourlyRateTotal: acc.hourlyRateTotal + (row.hourlyRate + row.weeklyHolidayRate),
        grossPay: acc.grossPay + row.grossPay,
        deductionsTotal: acc.deductionsTotal + row.deductionsTotal,
        netPay: acc.netPay + row.netPay,
        employerInsurance: acc.employerInsurance + row.employerInsurance,
        retirementPension: acc.retirementPension + row.retirementPension,
      }),
      { totalWorkHours: 0, baseSalaryTotal: 0, hourlyRateTotal: 0, grossPay: 0, deductionsTotal: 0, netPay: 0, employerInsurance: 0, retirementPension: 0 }
    )
  }, [computedRows])

  const [incomeItems, setIncomeItems] = useState<LedgerItem[]>(() =>
    buildInitialItems(savedLedgerEntries, 'income', payrollTotals)
  )
  const [expenseItems, setExpenseItems] = useState<LedgerItem[]>(() =>
    buildInitialItems(savedLedgerEntries, 'expense', payrollTotals)
  )
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [memoContent, setMemoContent] = useState(savedMemo)
  const [memoSaveStatus, setMemoSaveStatus] = useState<SaveStatus>('idle')
  const debounceTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const memoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleMemoChange = useCallback(
    (value: string) => {
      setMemoContent(value)
      if (memoTimer.current) clearTimeout(memoTimer.current)
      setMemoSaveStatus('saving')
      memoTimer.current = setTimeout(async () => {
        try {
          const result = await saveJournalMemo({ monthToken, content: value })
          setMemoSaveStatus(result.success ? 'saved' : 'error')
        } catch {
          setMemoSaveStatus('error')
        }
      }, 800)
    },
    [monthToken],
  )

  useEffect(() => {
    return () => {
      if (memoTimer.current) clearTimeout(memoTimer.current)
    }
  }, [])

  useEffect(() => {
    setExpenseItems((prev) =>
      prev.map((item) => {
        if (item.id === 'auto-net-pay') return { ...item, amount: payrollTotals.netPay }
        if (item.id === 'auto-retirement') return { ...item, amount: payrollTotals.retirementPension }
        return item
      })
    )
  }, [payrollTotals.netPay, payrollTotals.retirementPension])

  useEffect(() => {
    return () => {
      debounceTimers.current.forEach((timer) => clearTimeout(timer))
    }
  }, [])

  const persistItem = useCallback(
    async (item: LedgerItem, entryType: 'income' | 'expense') => {
      if (item.isAuto) return
      setSaveStatus('saving')
      try {
        const result = await upsertLedgerEntry({
          id: item.dbId,
          monthToken,
          entryType,
          label: item.label,
          amount: item.amount,
          sortOrder: item.sortOrder,
        })
        if (result.success && result.id && !item.dbId) {
          const setItems = entryType === 'income' ? setIncomeItems : setExpenseItems
          setItems((prev) =>
            prev.map((it) => (it.id === item.id ? { ...it, dbId: result.id } : it))
          )
        }
        setSaveStatus(result.success ? 'saved' : 'error')
      } catch {
        setSaveStatus('error')
      }
    },
    [monthToken],
  )

  const debouncedPersist = useCallback(
    (item: LedgerItem, entryType: 'income' | 'expense') => {
      const existing = debounceTimers.current.get(item.id)
      if (existing) clearTimeout(existing)
      const timer = setTimeout(() => {
        debounceTimers.current.delete(item.id)
        persistItem(item, entryType)
      }, 500)
      debounceTimers.current.set(item.id, timer)
    },
    [persistItem],
  )

  const handleAmountChange = useCallback(
    (id: string, value: string, entryType: 'income' | 'expense') => {
      const amount = parseAmountInput(value)
      const setItems = entryType === 'income' ? setIncomeItems : setExpenseItems
      setItems((prev) => {
        const updated = prev.map((item) => (item.id === id ? { ...item, amount } : item))
        const target = updated.find((item) => item.id === id)
        if (target && !target.isAuto) debouncedPersist(target, entryType)
        return updated
      })
    },
    [debouncedPersist],
  )

  const handleLabelChange = useCallback(
    (id: string, label: string, entryType: 'income' | 'expense') => {
      const setItems = entryType === 'income' ? setIncomeItems : setExpenseItems
      setItems((prev) => {
        const updated = prev.map((item) => (item.id === id ? { ...item, label } : item))
        const target = updated.find((item) => item.id === id)
        if (target && !target.isAuto) debouncedPersist(target, entryType)
        return updated
      })
    },
    [debouncedPersist],
  )

  const handleAddItem = useCallback(
    async (entryType: 'income' | 'expense') => {
      const setItems = entryType === 'income' ? setIncomeItems : setExpenseItems
      const newItem: LedgerItem = {
        id: tempId(),
        label: '',
        amount: null,
        sortOrder: 0,
      }
      setItems((prev) => {
        const maxOrder = prev.reduce((max, it) => Math.max(max, it.sortOrder), -1)
        const item = { ...newItem, sortOrder: maxOrder + 1 }
        newItem.sortOrder = item.sortOrder
        return [...prev, item]
      })
      setSaveStatus('saving')
      try {
        const result = await upsertLedgerEntry({
          monthToken,
          entryType,
          label: newItem.label || '새 항목',
          amount: null,
          sortOrder: newItem.sortOrder,
        })
        if (result.success && result.id) {
          setItems((prev) =>
            prev.map((it) => (it.id === newItem.id ? { ...it, dbId: result.id, label: it.label || '새 항목' } : it))
          )
        }
        setSaveStatus(result.success ? 'saved' : 'error')
      } catch {
        setSaveStatus('error')
      }
    },
    [monthToken],
  )

  const handleDeleteItem = useCallback(
    async (id: string, entryType: 'income' | 'expense') => {
      const setItems = entryType === 'income' ? setIncomeItems : setExpenseItems
      const items = entryType === 'income' ? incomeItems : expenseItems
      const target = items.find((it) => it.id === id)
      if (!target || target.isAuto) return

      setItems((prev) => prev.filter((it) => it.id !== id))
      if (target.dbId) {
        setSaveStatus('saving')
        try {
          const result = await deleteLedgerEntry(target.dbId)
          setSaveStatus(result.success ? 'saved' : 'error')
        } catch {
          setSaveStatus('error')
        }
      }
    },
    [incomeItems, expenseItems],
  )

  const incomeTotalAmount = useMemo(
    () => incomeItems.reduce((sum, it) => sum + (it.amount ?? 0), 0),
    [incomeItems],
  )
  const expenseTotalAmount = useMemo(
    () => expenseItems.reduce((sum, it) => sum + (it.amount ?? 0), 0),
    [expenseItems],
  )
  const balanceAmount = incomeTotalAmount - expenseTotalAmount

  const handleSort = (field: SortField) => {
    setSortField((prev) => {
      if (prev === field) {
        setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))
        return prev
      }
      setSortDirection('asc')
      return field
    })
  }

  const navigateToMonth = (token: string) => {
    const params = new URLSearchParams(searchParams?.toString())
    params.set('month', token)
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`)
    })
  }

  return (
    <section className="mx-auto flex max-w-6xl flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">경영일지</h1>
          <p className="text-sm text-slate-600">{monthLabel} 인건비 정산 요약 및 경영 현황을 확인합니다.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
        </div>
      </header>

      {sortedRows.length > 0 ? (
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-medium text-slate-900">정산 요약</h2>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <SortTrigger label="이름" field="name" sortField={sortField} sortDirection={sortDirection} onClick={handleSort} />
                  </TableHead>
                  <TableHead className="text-right">
                    <SortTrigger label="근무시간" field="totalWorkHours" sortField={sortField} sortDirection={sortDirection} onClick={handleSort} />
                  </TableHead>
                  <TableHead className="text-right">
                    <SortTrigger label="기본급" field="baseSalaryTotal" sortField={sortField} sortDirection={sortDirection} onClick={handleSort} />
                  </TableHead>
                  <TableHead className="text-right">
                    <SortTrigger label="시급+주휴" field="hourlyRate" sortField={sortField} sortDirection={sortDirection} onClick={handleSort} />
                  </TableHead>
                  <TableHead className="text-right">
                    <SortTrigger label="총지급액" field="grossPay" sortField={sortField} sortDirection={sortDirection} onClick={handleSort} />
                  </TableHead>
                  <TableHead className="text-right">
                    <SortTrigger label="공제금 합계" field="deductionsTotal" sortField={sortField} sortDirection={sortDirection} onClick={handleSort} />
                  </TableHead>
                  <TableHead className="text-right">
                    <SortTrigger label="실지급금" field="netPay" sortField={sortField} sortDirection={sortDirection} onClick={handleSort} />
                  </TableHead>
                  <TableHead className="text-right">
                    <SortTrigger label="4대보험(사업주)" field="employerInsurance" sortField={sortField} sortDirection={sortDirection} onClick={handleSort} />
                  </TableHead>
                  <TableHead className="text-right">
                    <SortTrigger label="퇴직연금" field="retirementPension" sortField={sortField} sortDirection={sortDirection} onClick={handleSort} />
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium text-slate-900">
                      <div className="flex items-center gap-2">
                        {row.name}
                        <Badge
                          variant={row.insuranceEnrolled ? 'default' : 'outline'}
                          className="shrink-0 px-1.5 py-0 text-[10px]"
                        >
                          {row.insuranceEnrolled ? '4대보험' : '3.3%'}
                        </Badge>
                        {row.role && (
                          <span className="text-xs text-slate-500">{row.role}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-slate-900">{formatHours(row.totalWorkHours)}</TableCell>
                    <TableCell className="text-right text-slate-900">{formatCurrency(row.baseSalaryTotal)}</TableCell>
                    <TableCell className="text-right text-slate-900">{formatCurrency(row.hourlyRate + row.weeklyHolidayRate)}</TableCell>
                    <TableCell className="text-right text-slate-900">{formatCurrency(row.grossPay)}</TableCell>
                    <TableCell className="text-right text-slate-900">{formatCurrency(row.deductionsTotal)}</TableCell>
                    <TableCell className="text-right text-slate-900">{formatCurrency(row.netPay)}</TableCell>
                    <TableCell className="text-right text-slate-900">
                      {row.employerInsurance > 0 ? formatCurrency(row.employerInsurance) : '—'}
                    </TableCell>
                    <TableCell className="text-right text-slate-900">
                      {row.retirementPension > 0 ? formatCurrency(row.retirementPension) : '—'}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-slate-50">
                  <TableCell className="font-semibold text-slate-900">총계</TableCell>
                  <TableCell className="text-right font-semibold text-slate-900">{formatHours(payrollTotals.totalWorkHours)}</TableCell>
                  <TableCell className="text-right font-semibold text-slate-900">{formatCurrency(payrollTotals.baseSalaryTotal)}</TableCell>
                  <TableCell className="text-right font-semibold text-slate-900">{formatCurrency(payrollTotals.hourlyRateTotal)}</TableCell>
                  <TableCell className="text-right font-semibold text-slate-900">{formatCurrency(payrollTotals.grossPay)}</TableCell>
                  <TableCell className="text-right font-semibold text-slate-900">{formatCurrency(payrollTotals.deductionsTotal)}</TableCell>
                  <TableCell className="text-right font-semibold text-slate-900">{formatCurrency(payrollTotals.netPay)}</TableCell>
                  <TableCell className="text-right font-semibold text-slate-900">{formatCurrency(payrollTotals.employerInsurance)}</TableCell>
                  <TableCell className="text-right font-semibold text-slate-900">{formatCurrency(payrollTotals.retirementPension)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </section>
      ) : (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
          표시할 정산 데이터가 없습니다. 급여 프로필이 등록된 교직원인지 확인해주세요.
        </div>
      )}

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-medium text-slate-900">수입 / 지출 현황</h2>
          <span
            className={cn(
              'text-xs transition-opacity',
              saveStatus === 'saving' && 'text-amber-600',
              saveStatus === 'saved' && 'text-green-600',
              saveStatus === 'error' && 'text-red-600',
              saveStatus === 'idle' && 'opacity-0',
            )}
          >
            {saveStatus === 'saving' && '저장 중...'}
            {saveStatus === 'saved' && '저장됨'}
            {saveStatus === 'error' && '저장 실패'}
          </span>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* 수입 */}
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-blue-700">수입</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[45%]">항목</TableHead>
                  <TableHead className="text-right">금액</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {incomeItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <Input
                        value={item.label}
                        onChange={(e) => handleLabelChange(item.id, e.target.value, 'income')}
                        className="h-8 text-sm"
                        placeholder="항목명"
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        value={formatAmountForInput(item.amount)}
                        onChange={(e) => handleAmountChange(item.id, e.target.value, 'income')}
                        className="h-8 text-right text-sm"
                        placeholder="0"
                        inputMode="numeric"
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-slate-400 hover:text-red-500"
                        onClick={() => handleDeleteItem(item.id, 'income')}
                      >
                        &times;
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-slate-50">
                  <TableCell className="font-semibold text-slate-900">수입 합계</TableCell>
                  <TableCell className="text-right font-semibold text-blue-700">
                    {formatCurrency(incomeTotalAmount)}
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2 w-full text-xs"
              onClick={() => handleAddItem('income')}
            >
              + 수입 항목 추가
            </Button>
          </div>

          {/* 지출 */}
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-red-700">지출</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[45%]">항목</TableHead>
                  <TableHead className="text-right">금액</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenseItems.map((item) => (
                  <TableRow key={item.id} className={item.isAuto ? 'bg-slate-50/50' : undefined}>
                    <TableCell>
                      {item.isAuto ? (
                        <span className="flex items-center gap-1.5 text-sm text-slate-700">
                          {item.label}
                          <Badge variant="outline" className="px-1 py-0 text-[9px] text-slate-400">자동</Badge>
                        </span>
                      ) : (
                        <Input
                          value={item.label}
                          onChange={(e) => handleLabelChange(item.id, e.target.value, 'expense')}
                          className="h-8 text-sm"
                          placeholder="항목명"
                        />
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {item.isAuto ? (
                        <span className="text-sm font-medium text-slate-900">
                          {formatCurrency(item.amount ?? 0)}
                        </span>
                      ) : (
                        <Input
                          value={formatAmountForInput(item.amount)}
                          onChange={(e) => handleAmountChange(item.id, e.target.value, 'expense')}
                          className="h-8 text-right text-sm"
                          placeholder="0"
                          inputMode="numeric"
                        />
                      )}
                    </TableCell>
                    <TableCell>
                      {!item.isAuto && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-slate-400 hover:text-red-500"
                          onClick={() => handleDeleteItem(item.id, 'expense')}
                        >
                          &times;
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-slate-50">
                  <TableCell className="font-semibold text-slate-900">지출 합계</TableCell>
                  <TableCell className="text-right font-semibold text-red-700">
                    {formatCurrency(expenseTotalAmount)}
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2 w-full text-xs"
              onClick={() => handleAddItem('expense')}
            >
              + 지출 항목 추가
            </Button>
          </div>
        </div>

        <div className="mt-6 border-t border-slate-200 pt-4">
          <div className="flex flex-col gap-1 text-sm sm:flex-row sm:justify-end sm:gap-6">
            <div className="flex justify-between sm:gap-2">
              <span className="text-slate-600">수입 합계</span>
              <span className="font-semibold text-blue-700">{formatCurrency(incomeTotalAmount)}</span>
            </div>
            <div className="flex justify-between sm:gap-2">
              <span className="text-slate-600">지출 합계</span>
              <span className="font-semibold text-red-700">{formatCurrency(expenseTotalAmount)}</span>
            </div>
            <div className="flex justify-between sm:gap-2">
              <span className="text-slate-600">차액</span>
              <span
                className={cn(
                  'font-semibold',
                  balanceAmount >= 0 ? 'text-blue-700' : 'text-red-700',
                )}
              >
                {formatCurrency(balanceAmount)}
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium text-slate-900">경영일기</h2>
          <span
            className={cn(
              'text-xs transition-opacity',
              memoSaveStatus === 'saving' && 'text-amber-600',
              memoSaveStatus === 'saved' && 'text-green-600',
              memoSaveStatus === 'error' && 'text-red-600',
              memoSaveStatus === 'idle' && 'opacity-0',
            )}
          >
            {memoSaveStatus === 'saving' && '저장 중...'}
            {memoSaveStatus === 'saved' && '저장됨'}
            {memoSaveStatus === 'error' && '저장 실패'}
          </span>
        </div>
        <Textarea
          value={memoContent}
          onChange={(e) => handleMemoChange(e.target.value)}
          placeholder={`${monthLabel} 경영일기를 작성하세요...`}
          className="min-h-[160px] resize-y text-sm"
        />
      </section>
    </section>
  )
}
