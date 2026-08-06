import type { Metadata } from 'next'

import { PracticeBoardGrid } from '@/components/dashboard/practice/PracticeBoardGrid'
import { PracticeDateNav } from '@/components/dashboard/practice/PracticeDateNav'
import { requireAuthForDashboard } from '@/lib/auth'
import { getTodayISOInKst } from '@/lib/counseling'
import { fetchPracticeUniversityOptions } from '@/lib/practice/problems'
import { fetchPracticeDayBoard, fetchPracticeStudentOptions } from '@/lib/practice/slots'

export const metadata: Metadata = {
  title: '모의실기 예약 보드 | Woodie Film Campus',
  description: '담임 반 학생을 빈 슬롯에 배정하세요.',
}

const BASE_PATH = '/dashboard/teacher/practice-feedback/board'

function normalizeDateParam(value: string | undefined, fallback: string) {
  if (!value) return fallback
  return /^\d{4}-\d{2}-\d{2}$/u.test(value) ? value : fallback
}

export default async function TeacherPracticeBoardPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const { profile } = await requireAuthForDashboard(['teacher', 'manager'])

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
      <p className="text-sm text-slate-600">
        담임 선생님은 다른 선생님의 빈 슬롯에도 자기 반 학생을 넣을 수 있습니다. 배정하면 대학별 문제가 자동으로
        정해지고, 예약 시각에서 제한시간을 뺀 시점부터 학생에게 문제가 공개됩니다.
      </p>
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
