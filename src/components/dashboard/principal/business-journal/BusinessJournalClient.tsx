'use client'

import { useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'

export interface PayrollSummaryEntry {
  id: string
  name: string
  insuranceEnrolled: boolean
  totalWorkHours: number
  baseSalaryTotal: number
  hourlyRate: number
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

interface BusinessJournalClientProps {
  monthToken: string
  monthLabel: string
  entries: PayrollSummaryEntry[]
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

export function BusinessJournalClient({ monthToken, monthLabel, entries }: BusinessJournalClientProps) {
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
      return (a[sortField] - b[sortField]) * dir
    })
  }, [computedRows, sortField, sortDirection])

  const totals = useMemo(() => {
    return computedRows.reduce(
      (acc, row) => ({
        totalWorkHours: acc.totalWorkHours + row.totalWorkHours,
        baseSalaryTotal: acc.baseSalaryTotal + row.baseSalaryTotal,
        hourlyRateTotal: acc.hourlyRateTotal + row.hourlyRate,
        grossPay: acc.grossPay + row.grossPay,
        deductionsTotal: acc.deductionsTotal + row.deductionsTotal,
        netPay: acc.netPay + row.netPay,
        employerInsurance: acc.employerInsurance + row.employerInsurance,
        retirementPension: acc.retirementPension + row.retirementPension,
      }),
      { totalWorkHours: 0, baseSalaryTotal: 0, hourlyRateTotal: 0, grossPay: 0, deductionsTotal: 0, netPay: 0, employerInsurance: 0, retirementPension: 0 }
    )
  }, [computedRows])

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
                    <SortTrigger label="시급" field="hourlyRate" sortField={sortField} sortDirection={sortDirection} onClick={handleSort} />
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
                    <TableCell className="text-right text-slate-900">{formatCurrency(row.hourlyRate)}</TableCell>
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
                  <TableCell className="text-right font-semibold text-slate-900">{formatHours(totals.totalWorkHours)}</TableCell>
                  <TableCell className="text-right font-semibold text-slate-900">{formatCurrency(totals.baseSalaryTotal)}</TableCell>
                  <TableCell className="text-right font-semibold text-slate-900">{formatCurrency(totals.hourlyRateTotal)}</TableCell>
                  <TableCell className="text-right font-semibold text-slate-900">{formatCurrency(totals.grossPay)}</TableCell>
                  <TableCell className="text-right font-semibold text-slate-900">{formatCurrency(totals.deductionsTotal)}</TableCell>
                  <TableCell className="text-right font-semibold text-slate-900">{formatCurrency(totals.netPay)}</TableCell>
                  <TableCell className="text-right font-semibold text-slate-900">{formatCurrency(totals.employerInsurance)}</TableCell>
                  <TableCell className="text-right font-semibold text-slate-900">{formatCurrency(totals.retirementPension)}</TableCell>
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

      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
        경영일지 작성 기능이 이 영역에 추가될 예정입니다.
      </div>
    </section>
  )
}
