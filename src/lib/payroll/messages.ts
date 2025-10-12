import type { PayrollAdjustmentInput, PayrollCalculationBreakdown, PayrollMessageContext } from './types'

const currencyFormatter = new Intl.NumberFormat('ko-KR', {
  style: 'currency',
  currency: 'KRW',
  minimumFractionDigits: 0,
})

function formatCurrency(value: number): string {
  return currencyFormatter.format(Math.round(value))
}

function formatHours(value: number): string {
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? `${rounded}시간` : `${rounded.toFixed(1)}시간`
}

function splitAdjustments(adjustments: PayrollAdjustmentInput[] = []) {
  const additions: PayrollAdjustmentInput[] = []
  const deductions: PayrollAdjustmentInput[] = []

  for (const entry of adjustments) {
    if (entry.isDeduction) {
      deductions.push(entry)
    } else {
      additions.push(entry)
    }
  }

  return { additions, deductions }
}

export function buildPayrollMessage(context: PayrollMessageContext): string {
  const teacherLabel = context.teacherName ? `${context.teacherName} 선생님` : '선생님'
  const lines: string[] = []

  lines.push(`${teacherLabel}, ${context.periodLabel} 급여 정산 결과입니다.`)
  lines.push('아래 내역을 확인하시고 문제가 없다면 확인 완료 버튼을 눌러주세요.')
  lines.push('')

  lines.push(`- 근무시간: ${formatHours(context.totalWorkHours)}`)
  lines.push(`- 근무급: ${formatCurrency(context.hourlyTotal)}`)
  if (context.weeklyHolidayAllowance > 0) {
    lines.push(`- 주휴수당: ${formatCurrency(context.weeklyHolidayAllowance)}`)
  }
  if (context.baseSalaryTotal > 0) {
    lines.push(`- 기본급: ${formatCurrency(context.baseSalaryTotal)}`)
  }

  const { additions, deductions } = splitAdjustments(context.adjustments)

  for (const addition of additions) {
    lines.push(`- 추가 (${addition.label}): ${formatCurrency(addition.amount)}`)
  }

  if (context.deductions.length > 0 || deductions.length > 0) {
    lines.push('')
    lines.push('공제 내역')
    for (const deduction of context.deductions) {
      lines.push(`- ${deduction.label}: ${formatCurrency(deduction.amount)}`)
    }
    for (const deduction of deductions) {
      lines.push(`- ${deduction.label}: ${formatCurrency(deduction.amount)}`)
    }
  }

  lines.push('')
  lines.push(`실지급 예정 금액: ${formatCurrency(context.netPay)}`)
  lines.push('확인 완료 버튼을 누르면 원장님께 전달됩니다.')

  return lines.join('\n')
}

export function createMessageContext(
  teacherName: string | null,
  periodLabel: string,
  breakdown: PayrollCalculationBreakdown
): PayrollMessageContext {
  return {
    teacherName,
    periodLabel,
    totalWorkHours: breakdown.totalWorkHours,
    hourlyTotal: breakdown.hourlyTotal,
    weeklyHolidayAllowance: breakdown.weeklyHolidayAllowance,
    baseSalaryTotal: breakdown.baseSalaryTotal,
    adjustments: breakdown.adjustments,
    deductions: breakdown.deductionDetails,
    netPay: breakdown.netPay,
  }
}
