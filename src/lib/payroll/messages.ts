import type {
  PayrollAdjustmentInput,
  PayrollCalculationBreakdown,
  PayrollMessageContext,
  TeacherContractType,
} from './types'
import { FREELANCER_WITHHOLDING_RATE } from './constants'

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
  if (context.contractType !== 'freelancer' && context.weeklyHolidayAllowance > 0) {
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
  contractType: TeacherContractType,
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
    contractType,
  }
}

interface SanitizeOptions {
  netPay?: number
  weeklyHolidayAllowance?: number
}

export function sanitizePayrollMessage(
  message: string | null | undefined,
  contractType: TeacherContractType,
  options?: SanitizeOptions
): string | null {
  if (!message) {
    return message ?? null
  }

  if (contractType !== 'freelancer') {
    return message
  }

  const lines = message
    .split(/\r?\n/u)
    .filter((line) => !line.includes('주휴수당'))

  if (
    options &&
    typeof options.netPay === 'number' &&
    typeof options.weeklyHolidayAllowance === 'number' &&
    options.weeklyHolidayAllowance > 0
  ) {
    const adjustedNet = adjustFreelancerNetPay(options.netPay, options.weeklyHolidayAllowance)
    const netLineIndex = lines.findIndex((line) => line.startsWith('실지급 예정 금액'))
    if (netLineIndex >= 0) {
      lines[netLineIndex] = `실지급 예정 금액: ${formatCurrency(adjustedNet)}`
    }
  }

  return lines.join('\n')
}

function adjustFreelancerNetPay(netPay: number, weeklyHolidayAllowance: number): number {
  const deductionPortion = weeklyHolidayAllowance * (1 - FREELANCER_WITHHOLDING_RATE)
  const adjusted = netPay - deductionPortion
  return adjusted < 0 ? 0 : Math.round(adjusted * 100) / 100
}
