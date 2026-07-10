import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { ExamSetForm } from '@/components/dashboard/exams/ExamSetForm'
import { requireAuthForDashboard } from '@/lib/auth'
import { fetchExamDetail } from '@/lib/exams'

export const metadata: Metadata = {
  title: '시험 세트 수정 | 시험 출제',
}

export default async function EditExamPage(props: { params: Promise<{ examId: string }> }) {
  const { profile } = await requireAuthForDashboard('principal')

  const { examId } = await props.params
  const exam = await fetchExamDetail(examId)

  if (!exam) {
    notFound()
  }

  if (exam.sessions.length > 0) {
    redirect(`/dashboard/principal/exams/${exam.id}`)
  }

  return (
    <section className="space-y-6">
      <DashboardBackLink
        fallbackHref={`/dashboard/principal/exams/${exam.id}`}
        label="시험 세트 상세로 돌아가기"
      />

      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-slate-900">시험 세트 수정</h1>
        <p className="text-sm text-slate-600">아직 출제되지 않은 세트만 수정할 수 있습니다.</p>
      </header>

      <ExamSetForm uploaderId={profile!.id} initialExam={exam} />
    </section>
  )
}
