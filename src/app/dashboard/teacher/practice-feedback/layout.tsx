import type { ReactNode } from 'react'

import { CounselingNav } from '@/components/counseling/CounselingNav'
import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { requireAuthForDashboard } from '@/lib/auth'

const NAV_ITEMS = [
  {
    label: '오늘 진행',
    description: '내 슬롯 타임라인과 진행 상태를 봅니다.',
    href: '/dashboard/teacher/practice-feedback/today',
  },
  {
    label: '예약 보드',
    description: '담임 반 학생을 빈 슬롯에 배정합니다.',
    href: '/dashboard/teacher/practice-feedback/board',
  },
  {
    label: '학생별 이력',
    description: '학생마다 쌓인 모의실기 기록을 봅니다.',
    href: '/dashboard/teacher/practice-feedback/students',
  },
] as const

export default async function TeacherPracticeFeedbackLayout({ children }: { children: ReactNode }) {
  await requireAuthForDashboard(['teacher', 'manager'])

  return (
    <section className="space-y-8">
      <div className="space-y-4">
        <DashboardBackLink fallbackHref="/dashboard/teacher/mock-practice" label="모의실기로 돌아가기" />
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-slate-900">입시 1:1 피드백</h1>
          <p className="text-sm text-slate-600">
            15분 슬롯마다 학생이 제출한 원고나 면접 답안을 확인하고, 그 자리에서 피드백과 채점을 남기세요.
          </p>
        </div>
        <CounselingNav items={NAV_ITEMS} />
      </div>
      <div className="space-y-6">{children}</div>
    </section>
  )
}
