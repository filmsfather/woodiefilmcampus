import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { PracticeAttemptRoom } from '@/components/dashboard/practice/PracticeAttemptRoom'
import { requireAuthForDashboard } from '@/lib/auth'
import { fetchPracticeAttemptDetail } from '@/lib/practice/attempts'
import { formatSlotDateLabel } from '@/lib/practice/shared'

export const metadata: Metadata = {
  title: '모의실기 응시 | Woodie Film Campus',
  description: '배정된 모의실기 문제를 풀고 제출하세요.',
}

export default async function StudentPracticeAttemptPage({
  params,
}: {
  params: Promise<{ attemptId: string }>
}) {
  const { profile } = await requireAuthForDashboard('student')
  const { attemptId } = await params

  const attempt = await fetchPracticeAttemptDetail(attemptId)

  if (!attempt || attempt.studentId !== profile!.id) {
    notFound()
  }

  return (
    <section className="space-y-6">
      <div className="space-y-3">
        <DashboardBackLink fallbackHref="/dashboard/student/practice-feedback" label="내 예약으로 돌아가기" />
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-slate-900">{attempt.universityName} 모의실기</h1>
          <p className="text-sm text-slate-600">
            {formatSlotDateLabel(attempt.slotDate)} {attempt.startTime} · {attempt.teacherName} 선생님
          </p>
        </div>
      </div>

      <PracticeAttemptRoom attempt={attempt} />
    </section>
  )
}
