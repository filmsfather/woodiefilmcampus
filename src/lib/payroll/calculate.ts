import DateUtil from '@/lib/date-util'
import { requiresWorkHours } from '@/lib/work-logs'

import type {
  PayrollAdjustmentInput,
  PayrollCalculationBreakdown,
  PayrollCalculationInput,
  WeeklyWorkSummary,
} from './types'
import { FREELANCER_WITHHOLDING_RATE } from './constants'

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function roundDown10(value: number): number {
  return Math.floor(value / 10) * 10
}

function cloneAdjustment(input: PayrollAdjustmentInput): PayrollAdjustmentInput {
  return {
    label: input.label,
    amount: roundCurrency(input.amount),
    isDeduction: input.isDeduction ?? false,
  }
}

export function calculatePayroll(input: PayrollCalculationInput): PayrollCalculationBreakdown {
  const periodStart = DateUtil.toUTCDate(input.periodStart)
  const periodEnd = DateUtil.toUTCDate(input.periodEnd)

  const weekMap = new Map<string, WeeklyWorkSummary>()

  const relevantEntries = input.workLogs.filter((entry) => {
    const date = DateUtil.toUTCDate(entry.workDate)
    return date >= periodStart && date <= periodEnd
  })

  for (const entry of relevantEntries) {
    const entryDate = DateUtil.toUTCDate(entry.workDate)
    const weekStart = DateUtil.startOfWeek(entryDate)
    const weekKey = weekStart.toISOString()
    if (!weekMap.has(weekKey)) {
      const weekEnd = DateUtil.endOfWeek(entryDate)
      const displayStartDate = weekStart.getTime() < periodStart.getTime() ? new Date(periodStart) : new Date(weekStart)
      const displayEndDate = weekEnd.getTime() > periodEnd.getTime() ? new Date(periodEnd) : new Date(weekEnd)
      weekMap.set(weekKey, {
        weekNumber: toWeekIndex(weekStart),
        weekStart: DateUtil.formatISODate(displayStartDate),
        weekEnd: DateUtil.formatISODate(displayEndDate),
        totalWorkHours: 0,
        entries: [],
      })
    }
    const summary = weekMap.get(weekKey)!
    summary.entries.push(entry)

    if (requiresWorkHours(entry.status) && typeof entry.workHours === 'number') {
      summary.totalWorkHours += entry.workHours
    }
  }

  const weeklySummaries = Array.from(weekMap.values()).sort((a, b) => a.weekStart.localeCompare(b.weekStart))

  const totalWorkHours = weeklySummaries.reduce((sum, summary) => sum + summary.totalWorkHours, 0)

  const hourlyTotal = roundCurrency(totalWorkHours * input.hourlyRate)
  const weeklyHolidayAllowance = roundCurrency(totalWorkHours * input.weeklyHolidayRate)
  const baseSalaryTotal = roundCurrency(input.baseSalaryAmount ?? 0)

  const normalizedAdjustments = (input.adjustments ?? []).map(cloneAdjustment)
  const additionAdjustments = normalizedAdjustments.filter((item) => !item.isDeduction)
  const deductionAdjustments = normalizedAdjustments.filter((item) => item.isDeduction)

  const additionTotal = additionAdjustments.reduce((sum, item) => sum + item.amount, 0)
  const deductionAdjustmentsTotal = deductionAdjustments.reduce((sum, item) => sum + item.amount, 0)

  const grossPay = roundCurrency(hourlyTotal + weeklyHolidayAllowance + baseSalaryTotal + additionTotal)

  const deductionDetails: Array<{ label: string; amount: number }> = []

  if (input.contractType === 'employee' && input.insuranceEnrolled) {
    const healthInsurance = roundDown10(grossPay * 0.03595)
    const nationalPension = roundCurrency(input.nationalPensionAmount)
    const longTermCare = roundDown10(healthInsurance * 0.1314)
    const employmentInsurance = roundDown10(grossPay * 0.009)

    deductionDetails.push({ label: '국민연금', amount: nationalPension })
    deductionDetails.push({ label: '건강보험 (3.595%)', amount: healthInsurance })
    deductionDetails.push({ label: '장기요양보험 (건강보험의 13.14%)', amount: longTermCare })
    deductionDetails.push({ label: '고용보험 (0.9%)', amount: employmentInsurance })
  } else if (input.contractType === 'freelancer') {
    const withholding = roundCurrency(grossPay * FREELANCER_WITHHOLDING_RATE)
    deductionDetails.push({ label: '프리랜서 원천징수 (3.3%)', amount: withholding })
  }

  const statutoryDeductionsTotal = deductionDetails.reduce((sum, item) => sum + item.amount, 0)

  for (const item of deductionAdjustments) {
    deductionDetails.push({ label: item.label, amount: item.amount })
  }

  const deductionsTotal = roundCurrency(statutoryDeductionsTotal + deductionAdjustmentsTotal)
  const netPay = roundCurrency(grossPay - deductionsTotal)

  return {
    totalWorkHours: roundCurrency(totalWorkHours),
    hourlyTotal,
    weeklyHolidayAllowance,
    baseSalaryTotal,
    adjustments: normalizedAdjustments,
    grossPay,
    deductionDetails,
    deductionsTotal,
    netPay,
    weeklySummaries,
  }
}

function toWeekIndex(date: Date): number {
  const temp = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const firstMondayOffset = ((temp.getUTCDay() + 6) % 7)
  const firstWeekStart = new Date(temp)
  firstWeekStart.setUTCDate(temp.getUTCDate() - firstMondayOffset)
  const diff = date.getTime() - firstWeekStart.getTime()
  const week = Math.floor(diff / (7 * 24 * 60 * 60 * 1000)) + 1
  return week
}
