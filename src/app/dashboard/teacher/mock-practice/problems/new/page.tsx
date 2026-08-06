import type { Metadata } from 'next'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { PracticeProblemForm } from '@/components/dashboard/practice/PracticeProblemForm'
import { requireAuthForDashboard } from '@/lib/auth'
import { fetchPracticeUniversityOptions } from '@/lib/practice/problems'

export const metadata: Metadata = {
  title: '모의실기 문제 추가 | Woodie Film Campus',
  description: '대학별 모의실기 연습문제를 추가하세요.',
}

export default async function NewPracticeProblemPage() {
  const { profile } = await requireAuthForDashboard(['teacher', 'manager'])
  const universities = await fetchPracticeUniversityOptions()

  return (
    <section className="space-y-6">
      <div className="space-y-3">
        <DashboardBackLink
          fallbackHref="/dashboard/teacher/mock-practice/problems"
          label="문제 은행으로 돌아가기"
        />
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-slate-900">모의실기 문제 추가</h1>
          <p className="text-sm text-slate-600">
            대학과 유형을 고르고 문항, 제한시간, 채점표를 작성하세요. 저장하면 예약 시 자동 배정 후보에 들어갑니다.
          </p>
        </div>
      </div>

      <PracticeProblemForm uploaderId={profile!.id} universities={universities} />
    </section>
  )
}
