import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { ReviewTaskForm } from '@/components/dashboard/student/exams/ReviewTaskForm'
import { requireAuthForDashboard } from '@/lib/auth'
import { fetchStudentReviewTaskDetail } from '@/lib/exams'

export const metadata: Metadata = {
  title: '오답노트 작성 | Woodie Film Campus',
}

export default async function StudentReviewTaskPage(props: {
  params: Promise<{ reviewTaskId: string }>
}) {
  const { profile } = await requireAuthForDashboard('student')

  const { reviewTaskId } = await props.params
  const detail = await fetchStudentReviewTaskDetail(reviewTaskId, profile!.id)

  if (!detail) {
    notFound()
  }

  return (
    <section className="space-y-6">
      <DashboardBackLink fallbackHref="/dashboard/student/exams" label="시험 목록으로 돌아가기" />

      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-slate-900">{detail.examTitle} 오답노트</h1>
        <p className="text-sm text-slate-600">
          문항별로 답안을 작성하고, 이미지 제출이 필요한 문항에는 이미지와 해설을 함께 올려주세요.
        </p>
      </header>

      <ReviewTaskForm task={detail.task} />
    </section>
  )
}
