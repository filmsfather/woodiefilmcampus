import { requiresWorkHours } from '@/lib/work-logs'

import type {
  PayrollAdjustmentInput,
  PayrollCalculationBreakdown,
  PayrollCalculationInput,
  WeeklyWorkSummary,
} from './types'

const WEEKLY_HOLIDAY_STANDARD_DAYS = 5

function parseSeoulDate(dateString: string): Date {
  return new Date(`${dateString}T00:00:00+09:00`)
}

function toDateToken(date: Date): string {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function startOfISOWeek(date: Date): Date {
  const result = new Date(date)
  const day = result.getDay() === 0 ? 7 : result.getDay()
  const diff = day - 1
  result.setDate(result.getDate() - diff)
  result.setHours(0, 0, 0, 0)
  return result
}

function endOfISOWeek(date: Date): Date {
  const start = startOfISOWeek(date)
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  end.setHours(23, 59, 59, 999)
  return end
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function cloneAdjustment(input: PayrollAdjustmentInput): PayrollAdjustmentInput {
  return {
    label: input.label,
    amount: roundCurrency(input.amount),
    isDeduction: input.isDeduction ?? false,
  }
}

export function calculatePayroll(input: PayrollCalculationInput): PayrollCalculationBreakdown {
  const periodStart = new Date(input.periodStart)
  const periodEnd = new Date(input.periodEnd)
  const allowWeeklyHoliday = input.contractType !== 'freelancer'

  const weekMap = new Map<string, WeeklyWorkSummary>()

  const relevantEntries = input.workLogs.filter((entry) => {
    const date = parseSeoulDate(entry.workDate)
    return date >= periodStart && date <= periodEnd
  })

  for (const entry of relevantEntries) {
    const entryDate = parseSeoulDate(entry.workDate)
    const weekStart = startOfISOWeek(entryDate)
    const weekKey = weekStart.toISOString()
    if (!weekMap.has(weekKey)) {
      const weekEnd = endOfISOWeek(entryDate)
      const displayStartDate = weekStart.getTime() < periodStart.getTime() ? new Date(periodStart) : new Date(weekStart)
      const displayEndDate = weekEnd.getTime() > periodEnd.getTime() ? new Date(periodEnd) : new Date(weekEnd)
      weekMap.set(weekKey, {
        weekNumber: Number.parseInt(toWeekIndex(weekStart), 10),
        weekStart: toDateToken(displayStartDate),
        weekEnd: toDateToken(displayEndDate),
        totalWorkHours: 0,
        containsTardy: false,
        containsAbsence: false,
        containsSubstitute: false,
        eligibleForWeeklyHolidayAllowance: false,
        weeklyHolidayAllowanceHours: 0,
        entries: [],
      })
    }
    const summary = weekMap.get(weekKey)!
    summary.entries.push(entry)

    if (requiresWorkHours(entry.status) && typeof entry.workHours === 'number') {
      summary.totalWorkHours += entry.workHours
    }

    if (entry.status === 'tardy') {
      summary.containsTardy = true
    }
    if (entry.status === 'absence') {
      summary.containsAbsence = true
    }
    if (entry.status === 'substitute') {
      summary.containsSubstitute = true
    }
  }

  const weeklySummaries = Array.from(weekMap.values()).sort((a, b) => a.weekStart.localeCompare(b.weekStart))

  for (const summary of weeklySummaries) {
    const eligible =
      allowWeeklyHoliday &&
      summary.totalWorkHours >= 15 &&
      !summary.containsTardy &&
      !summary.containsAbsence &&
      !summary.containsSubstitute

    summary.eligibleForWeeklyHolidayAllowance = eligible
    summary.weeklyHolidayAllowanceHours = eligible
      ? roundCurrency(summary.totalWorkHours / WEEKLY_HOLIDAY_STANDARD_DAYS)
      : 0
  }

  const totalWorkHours = weeklySummaries.reduce((sum, summary) => sum + summary.totalWorkHours, 0)
  const weeklyHolidayAllowanceHours = allowWeeklyHoliday
    ? weeklySummaries.reduce((sum, summary) => sum + summary.weeklyHolidayAllowanceHours, 0)
    : 0

  const hourlyTotal = roundCurrency(totalWorkHours * input.hourlyRate)
  const weeklyHolidayAllowance = allowWeeklyHoliday
    ? roundCurrency(weeklyHolidayAllowanceHours * input.hourlyRate)
    : 0
  const baseSalaryTotal = roundCurrency(input.baseSalaryAmount ?? 0)

  const normalizedAdjustments = (input.adjustments ?? []).map(cloneAdjustment)
  const additionAdjustments = normalizedAdjustments.filter((item) => !item.isDeduction)
  const deductionAdjustments = normalizedAdjustments.filter((item) => item.isDeduction)

  const additionTotal = additionAdjustments.reduce((sum, item) => sum + item.amount, 0)
  const deductionAdjustmentsTotal = deductionAdjustments.reduce((sum, item) => sum + item.amount, 0)

  const grossPay = roundCurrency(hourlyTotal + weeklyHolidayAllowance + baseSalaryTotal + additionTotal)

  const deductionDetails: Array<{ label: string; amount: number }> = []

  if (input.contractType === 'employee' && input.insuranceEnrolled) {
    const healthInsurance = roundCurrency(grossPay * 0.045)
    const nationalPension = roundCurrency(grossPay * 0.03545)
    const longTermCare = roundCurrency(grossPay * 0.03545 * 0.1281)
    const employmentInsurance = roundCurrency(grossPay * 0.009)

    deductionDetails.push({ label: '건강보험 (4.5%)', amount: healthInsurance })
    deductionDetails.push({ label: '국민연금 (3.545%)', amount: nationalPension })
    deductionDetails.push({ label: '장기요양보험 (건강보험의 12.81%)', amount: longTermCare })
    deductionDetails.push({ label: '고용보험 (0.9%)', amount: employmentInsurance })
  } else if (input.contractType === 'freelancer') {
    const withholding = roundCurrency(grossPay * 0.033)
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
    weeklyHolidayAllowanceHours: roundCurrency(weeklyHolidayAllowanceHours),
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

function toWeekIndex(date: Date): string {
  const temp = new Date(date.getFullYear(), 0, 1)
  const firstMondayOffset = ((temp.getDay() + 6) % 7)
  const firstWeekStart = new Date(temp)
  firstWeekStart.setDate(temp.getDate() - firstMondayOffset)
  const diff = date.getTime() - firstWeekStart.getTime()
  const week = Math.floor(diff / (7 * 24 * 60 * 60 * 1000)) + 1
  return `${week}`.padStart(2, '0')
}
