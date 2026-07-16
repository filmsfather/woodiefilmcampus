import type { Metadata } from 'next'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { InterviewSetForm } from '@/components/dashboard/mock-practice/InterviewSetForm'
import { requireAuthForDashboard } from '@/lib/auth'

export const metadata: Metadata = {
  title: '면접 문제 만들기 | Woodie Film Campus',
  description: '모의 면접 문제 세트와 피드백 템플릿을 만드세요.',
}

export default async function InterviewSetCreatePage() {
  const { profile } = await requireAuthForDashboard(['teacher', 'manager'])

  if (!profile) {
    return null
  }

  return (
    <section className="space-y-6">
      <div className="space-y-3">
        <DashboardBackLink fallbackHref="/dashboard/teacher/mock-practice/interview" label="모의 면접으로 돌아가기" />
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-slate-900">면접 문제 만들기</h1>
          <p className="text-sm text-slate-600">
            면접 문항(텍스트/이미지)과 면접 후 학생이 작성할 피드백 템플릿을 함께 만듭니다.
          </p>
        </div>
      </div>

      <InterviewSetForm uploaderId={profile.id} />
    </section>
  )
}
