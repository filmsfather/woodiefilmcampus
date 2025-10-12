import type { WorkLogEntry } from '@/lib/work-logs'

export type TeacherContractType = 'employee' | 'freelancer' | 'none'
export type TeacherPayrollRunStatus = 'draft' | 'pending_ack' | 'confirmed'
export type TeacherPayrollItemKind = 'earning' | 'deduction' | 'info'
export type TeacherPayrollAckStatus = 'pending' | 'confirmed'

export interface TeacherPayrollProfile {
  id: string
  teacherId: string
  hourlyRate: number
  hourlyCurrency: string
  baseSalaryAmount: number | null
  baseSalaryCurrency: string
  contractType: TeacherContractType
  insuranceEnrolled: boolean
  effectiveFrom: string
  effectiveTo: string | null
  notes: string | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

export interface TeacherPayrollRun {
  id: string
  teacherId: string
  payrollProfileId: string | null
  periodStart: string
  periodEnd: string
  contractType: TeacherContractType
  insuranceEnrolled: boolean
  hourlyTotal: number
  weeklyHolidayAllowance: number
  baseSalaryTotal: number
  adjustmentTotal: number
  grossPay: number
  deductionsTotal: number
  netPay: number
  status: TeacherPayrollRunStatus
  messagePreview: string | null
  meta: Record<string, unknown>
  requestedBy: string | null
  requestedAt: string | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

export interface TeacherPayrollRunItem {
  id: string
  runId: string
  itemKind: TeacherPayrollItemKind
  label: string
  amount: number
  metadata: Record<string, unknown>
  orderIndex: number
  createdAt: string
  updatedAt: string
}

export interface TeacherPayrollAcknowledgement {
  id: string
  runId: string
  teacherId: string
  status: TeacherPayrollAckStatus
  requestedAt: string
  confirmedAt: string | null
  note: string | null
  updatedBy: string | null
  createdAt: string
  updatedAt: string
}

export interface WeeklyWorkSummary {
  weekNumber: number
  weekStart: string
  weekEnd: string
  totalWorkHours: number
  containsTardy: boolean
  containsAbsence: boolean
  containsSubstitute: boolean
  eligibleForWeeklyHolidayAllowance: boolean
  weeklyHolidayAllowanceHours: number
  entries: WorkLogEntry[]
}

export interface PayrollAdjustmentInput {
  label: string
  amount: number
  isDeduction?: boolean
}

export interface PayrollCalculationInput {
  teacherId: string
  teacherName: string | null
  periodStart: Date
  periodEnd: Date
  hourlyRate: number
  baseSalaryAmount: number | null
  contractType: TeacherContractType
  insuranceEnrolled: boolean
  workLogs: WorkLogEntry[]
  adjustments?: PayrollAdjustmentInput[]
}

export interface PayrollCalculationBreakdown {
  totalWorkHours: number
  weeklyHolidayAllowanceHours: number
  hourlyTotal: number
  weeklyHolidayAllowance: number
  baseSalaryTotal: number
  adjustments: PayrollAdjustmentInput[]
  grossPay: number
  deductionDetails: Array<{
    label: string
    amount: number
  }>
  deductionsTotal: number
  netPay: number
  weeklySummaries: WeeklyWorkSummary[]
}

export interface PayrollMessageContext {
  teacherName: string | null
  periodLabel: string
  hourlyTotal: number
  weeklyHolidayAllowance: number
  baseSalaryTotal: number
  adjustments: PayrollAdjustmentInput[]
  deductions: Array<{
    label: string
    amount: number
  }>
  netPay: number
}

export interface PayrollWithAck extends TeacherPayrollRun {
  acknowledgement: TeacherPayrollAcknowledgement | null
  items: TeacherPayrollRunItem[]
}
