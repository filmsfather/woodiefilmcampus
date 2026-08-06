import type { Metadata } from 'next'

import { PracticeBoardGrid } from '@/components/dashboard/practice/PracticeBoardGrid'
import { PracticeDateNav } from '@/components/dashboard/practice/PracticeDateNav'
import { requireAuthForDashboard } from '@/lib/auth'
import { getTodayISOInKst } from '@/lib/counseling'
import { fetchPracticeUniversityOptions } from '@/lib/practice/problems'
import { fetchPracticeDayBoard, fetchPracticeStudentOptions } from '@/lib/practice/slots'

export const metadata: Metadata = {
  title: '모의실기 예약 보드 | Woodie Film Campus',
  description: '선생님별 15분 슬롯에 학생을 배정하세요.',
}

const BASE_PATH = '/dashboard/manager/practice-feedback/board'

function normalizeDateParam(value: string | undefined, fallback: string) {
  if (!value) return fallback
  return /^\d{4}-\d{2}-\d{2}$/u.test(value) ? value : fallback
}

export default async function ManagerPracticeBoardPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const { profile } = await requireAuthForDashboard('manager')

  const params = await searchParams
  const today = getTodayISOInKst()
  const selectedDate = normalizeDateParam(params?.date, today)

  const [board, students, universities] = await Promise.all([
    fetchPracticeDayBoard(selectedDate),
    fetchPracticeStudentOptions(profile?.id ?? null),
    fetchPracticeUniversityOptions(),
  ])

  return (
    <div className="space-y-4">
      <PracticeDateNav basePath={BASE_PATH} date={selectedDate} today={today} />
      <PracticeBoardGrid
        board={board}
        students={students}
        universities={universities}
        sessionHrefBase="/dashboard/teacher/practice-feedback/sessions"
        canAssign
      />
    </div>
  )
}
