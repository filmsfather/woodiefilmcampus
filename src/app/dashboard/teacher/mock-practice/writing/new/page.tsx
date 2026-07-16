import type { Metadata } from 'next'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { WritingSetForm } from '@/components/dashboard/mock-practice/WritingSetForm'
import { requireAuthForDashboard } from '@/lib/auth'

export const metadata: Metadata = {
  title: '작문 문제 만들기 | Woodie Film Campus',
  description: '모의 작문 문제 세트와 제한시간을 설정하세요.',
}

export default async function WritingSetCreatePage() {
  const { profile } = await requireAuthForDashboard(['teacher', 'manager'])

  if (!profile) {
    return null
  }

  return (
    <section className="space-y-6">
      <div className="space-y-3">
        <DashboardBackLink fallbackHref="/dashboard/teacher/mock-practice/writing" label="모의 작문으로 돌아가기" />
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-slate-900">작문 문제 만들기</h1>
          <p className="text-sm text-slate-600">
            작문 문항(텍스트/이미지)과 제한시간을 설정합니다. 문제는 학생이 시험을 시작하는 순간 공개됩니다.
          </p>
        </div>
      </div>

      <WritingSetForm uploaderId={profile.id} />
    </section>
  )
}
