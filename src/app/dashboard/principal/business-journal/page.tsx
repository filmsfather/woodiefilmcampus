import { requireAuthForDashboard } from '@/lib/auth'
import DateUtil from '@/lib/date-util'
import { resolveMonthRange } from '@/lib/work-logs'
import { fetchTeacherPayrollProfiles } from '@/lib/payroll/config'
import {
  fetchApprovedWorkLogsByTeacher,
  fetchTeacherDirectory,
  loadPayrollRuns,
} from '@/lib/payroll/queries'
import { calculatePayroll } from '@/lib/payroll/calculate'
import type { PayrollAdjustmentInput } from '@/lib/payroll/types'
import {
  BusinessJournalClient,
  type PayrollSummaryEntry,
} from '@/components/dashboard/principal/business-journal/BusinessJournalClient'
import { loadLedgerEntries, loadJournalMemo } from './actions'

function normalizeAdjustments(value: unknown): PayrollAdjustmentInput[] {
  if (!Array.isArray(value)) return []
  const results: PayrollAdjustmentInput[] = []
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue
    const record = entry as Record<string, unknown>
    const label = typeof record.label === 'string' ? record.label : null
    if (!label) continue
    const rawAmount = record.amount
    const amount = typeof rawAmount === 'number' ? rawAmount : Number.parseFloat(String(rawAmount))
    if (Number.isNaN(amount)) continue
    const isDeduction = Boolean(record.isDeduction)
    results.push({ label, amount, isDeduction })
  }
  return results
}

export default async function BusinessJournalPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireAuthForDashboard('principal')

  const searchParams = await props.searchParams
  const monthTokenParam = typeof searchParams?.month === 'string' ? searchParams.month : null

  const monthRange = resolveMonthRange(monthTokenParam)
  const monthToken = monthRange.startDate.slice(0, 7)
  const periodStart = DateUtil.toUTCDate(monthRange.startDate)
  const periodEnd = DateUtil.addDays(DateUtil.toUTCDate(monthRange.endExclusiveDate), -1)

  const teacherDirectory = await fetchTeacherDirectory()
  const payrollProfiles = await fetchTeacherPayrollProfiles()

  const teacherIds = Object.keys(payrollProfiles).filter((id) => teacherDirectory[id])

  const workLogsByTeacher = teacherIds.length
    ? await fetchApprovedWorkLogsByTeacher(monthRange.startDate, monthRange.endExclusiveDate, teacherIds)
    : {}

  const payrollRuns = teacherIds.length
    ? await loadPayrollRuns(monthRange.startDate, monthRange.endExclusiveDate, teacherIds)
    : []

  const entries: PayrollSummaryEntry[] = []

  for (const teacherId of teacherIds) {
    const teacher = teacherDirectory[teacherId]
    const profile = payrollProfiles[teacherId]
    if (!teacher || !profile) continue

    const workLogs = workLogsByTeacher[teacherId] ?? []

    const matchingRuns = payrollRuns
      .filter((run) => run.teacherId === teacherId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    const latestRun = matchingRuns[0] ?? null

    const runMeta = latestRun?.meta as Record<string, unknown> | undefined
    const adjustments = normalizeAdjustments(runMeta ? runMeta['adjustments'] : undefined)

    const breakdown = calculatePayroll({
      teacherId,
      teacherName: teacher.name ?? teacher.email ?? null,
      periodStart,
      periodEnd,
      hourlyRate: profile.hourlyRate,
      weeklyHolidayRate: profile.weeklyHolidayRate,
      baseSalaryAmount: profile.baseSalaryAmount,
      nationalPensionAmount: profile.nationalPensionAmount,
      contractType: profile.contractType,
      insuranceEnrolled: profile.insuranceEnrolled,
      workLogs,
      adjustments,
    })

    entries.push({
      id: teacherId,
      name: teacher.name ?? teacher.email ?? '이름 미등록',
      insuranceEnrolled: profile.insuranceEnrolled,
      totalWorkHours: breakdown.totalWorkHours,
      baseSalaryTotal: breakdown.baseSalaryTotal,
      hourlyRate: profile.hourlyRate,
      weeklyHolidayRate: profile.weeklyHolidayRate,
      grossPay: breakdown.grossPay,
      deductionsTotal: breakdown.deductionsTotal,
      netPay: breakdown.netPay,
    })
  }

  const [savedLedgerEntries, savedMemo] = await Promise.all([
    loadLedgerEntries(monthToken),
    loadJournalMemo(monthToken),
  ])

  return (
    <BusinessJournalClient
      monthToken={monthToken}
      monthLabel={monthRange.label}
      entries={entries}
      savedLedgerEntries={savedLedgerEntries}
      savedMemo={savedMemo}
    />
  )
}
