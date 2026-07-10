import type { Metadata } from 'next'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { ExamSetForm } from '@/components/dashboard/exams/ExamSetForm'
import { requireAuthForDashboard } from '@/lib/auth'

export const metadata: Metadata = {
  title: '새 시험 세트 | 시험 출제',
  description: '시험 문항과 오답노트 문항을 함께 작성해 재사용 가능한 시험 세트를 만듭니다.',
}

export default async function NewExamPage() {
  const { profile } = await requireAuthForDashboard('principal')

  return (
    <section className="space-y-6">
      <DashboardBackLink fallbackHref="/dashboard/principal/exams" label="시험 출제로 돌아가기" />

      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-slate-900">새 시험 세트 만들기</h1>
        <p className="text-sm text-slate-600">
          문항마다 오답노트 문항을 함께 작성해 두면, non-pass 학생에게 자동으로 오답노트 과제가 배정됩니다.
        </p>
      </header>

      <ExamSetForm uploaderId={profile!.id} />
    </section>
  )
}
