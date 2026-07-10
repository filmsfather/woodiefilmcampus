import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { ExamRunner } from '@/components/dashboard/student/exams/ExamRunner'
import { requireAuthForDashboard } from '@/lib/auth'
import { fetchStudentExamRunnerData } from '@/lib/exams'

export const metadata: Metadata = {
  title: '시험 응시 | Woodie Film Campus',
}

export default async function StudentExamSessionPage(props: {
  params: Promise<{ sessionId: string }>
}) {
  const { profile } = await requireAuthForDashboard('student')

  const { sessionId } = await props.params
  const data = await fetchStudentExamRunnerData(sessionId, profile!.id)

  if (!data) {
    notFound()
  }

  return (
    <section className="space-y-6">
      <DashboardBackLink fallbackHref="/dashboard/student/exams" label="시험 목록으로 돌아가기" />

      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-slate-900">{data.examTitle}</h1>
        {data.examDescription && (
          <p className="text-sm text-slate-600 whitespace-pre-wrap">{data.examDescription}</p>
        )}
      </header>

      <ExamRunner data={data} />
    </section>
  )
}
