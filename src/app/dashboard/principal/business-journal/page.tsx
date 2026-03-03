import { requireAuthForDashboard } from '@/lib/auth'
import DateUtil from '@/lib/date-util'
import { resolveMonthRange } from '@/lib/work-logs'
import { fetchTeacherPayrollProfiles } from '@/lib/payroll/config'
import { fetchApprovedWorkLogsByTeacher, fetchTeacherDirectory } from '@/lib/payroll/queries'
import { calculatePayroll } from '@/lib/payroll/calculate'
import {
  BusinessJournalClient,
  type PayrollSummaryEntry,
} from '@/components/dashboard/principal/business-journal/BusinessJournalClient'

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

  const entries: PayrollSummaryEntry[] = []

  for (const teacherId of teacherIds) {
    const teacher = teacherDirectory[teacherId]
    const profile = payrollProfiles[teacherId]
    if (!teacher || !profile) continue

    const workLogs = workLogsByTeacher[teacherId] ?? []

    const breakdown = calculatePayroll({
      teacherId,
      teacherName: teacher.name ?? teacher.email ?? null,
      periodStart,
      periodEnd,
      hourlyRate: profile.hourlyRate,
      baseSalaryAmount: profile.baseSalaryAmount,
      contractType: profile.contractType,
      insuranceEnrolled: profile.insuranceEnrolled,
      workLogs,
      adjustments: [],
    })

    entries.push({
      id: teacherId,
      name: teacher.name ?? teacher.email ?? '이름 미등록',
      insuranceEnrolled: profile.insuranceEnrolled,
      totalWorkHours: breakdown.totalWorkHours,
      baseSalaryTotal: breakdown.baseSalaryTotal,
      hourlyRate: profile.hourlyRate,
      grossPay: breakdown.grossPay,
      deductionsTotal: breakdown.deductionsTotal,
      netPay: breakdown.netPay,
      role: undefined,
    })
  }

  return (
    <BusinessJournalClient
      monthToken={monthToken}
      monthLabel={monthRange.label}
      entries={entries}
    />
  )
}
