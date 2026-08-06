import type { Metadata } from 'next'

import { PracticeSlotPlanner } from '@/components/dashboard/practice/PracticeSlotPlanner'
import { requireAuthForDashboard } from '@/lib/auth'
import { getMonthRange, getTodayISOInKst } from '@/lib/counseling'
import { fetchPracticeSlotBlocks, fetchPracticeTeacherOptions } from '@/lib/practice/slots'

export const metadata: Metadata = {
  title: '모의실기 슬롯 개설 | Woodie Film Campus',
  description: '선생님별 15분 단위 1:1 피드백 슬롯을 개설하세요.',
}

function normalizeDateParam(value: string | undefined, fallback: string) {
  if (!value) {
    return fallback
  }
  return /^\d{4}-\d{2}-\d{2}$/u.test(value) ? value : fallback
}

export default async function PracticeSlotsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  await requireAuthForDashboard('manager')

  const params = await searchParams
  const today = getTodayISOInKst()
  const selectedDate = normalizeDateParam(params?.date, today)

  const [yearStr, monthStr] = selectedDate.split('-')
  const year = Number(yearStr)
  const month = Number(monthStr)
  const { start, end } = getMonthRange(year, month)

  const [blocks, teachers] = await Promise.all([
    fetchPracticeSlotBlocks(start, end),
    fetchPracticeTeacherOptions(),
  ])

  return (
    <PracticeSlotPlanner
      year={year}
      month={month}
      today={today}
      selectedDate={selectedDate}
      blocks={blocks}
      teachers={teachers}
    />
  )
}
