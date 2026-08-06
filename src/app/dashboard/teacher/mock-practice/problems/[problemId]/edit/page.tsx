import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { PracticeProblemForm } from '@/components/dashboard/practice/PracticeProblemForm'
import { requireAuthForDashboard } from '@/lib/auth'
import { fetchPracticeProblemDetail, fetchPracticeUniversityOptions } from '@/lib/practice/problems'

export const metadata: Metadata = {
  title: '모의실기 문제 수정 | Woodie Film Campus',
  description: '모의실기 연습문제를 수정하세요.',
}

export default async function EditPracticeProblemPage({
  params,
}: {
  params: Promise<{ problemId: string }>
}) {
  const { profile } = await requireAuthForDashboard(['teacher', 'manager'])
  const { problemId } = await params

  const [problem, universities] = await Promise.all([
    fetchPracticeProblemDetail(problemId),
    fetchPracticeUniversityOptions(),
  ])

  if (!problem) {
    notFound()
  }

  return (
    <section className="space-y-6">
      <div className="space-y-3">
        <DashboardBackLink
          fallbackHref="/dashboard/teacher/mock-practice/problems"
          label="문제 은행으로 돌아가기"
        />
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-slate-900">모의실기 문제 수정</h1>
          <p className="text-sm text-slate-600">
            {problem.usageCount > 0
              ? `이미 ${problem.usageCount}건의 예약에 배정된 문제입니다. 수정 내용은 아직 응시하지 않은 학생에게도 반영됩니다.`
              : '아직 배정되지 않은 문제입니다.'}
          </p>
        </div>
      </div>

      <PracticeProblemForm uploaderId={profile!.id} universities={universities} initialProblem={problem} />
    </section>
  )
}
