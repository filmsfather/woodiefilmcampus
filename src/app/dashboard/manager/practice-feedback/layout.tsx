import type { ReactNode } from 'react'

import { CounselingNav } from '@/components/counseling/CounselingNav'
import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { requireAuthForDashboard } from '@/lib/auth'

const NAV_ITEMS = [
  {
    label: '슬롯 개설',
    description: '근무 블록을 등록해 15분 슬롯을 만듭니다.',
    href: '/dashboard/manager/practice-feedback/slots',
  },
  {
    label: '예약 보드',
    description: '선생님 x 시간 보드에서 학생을 배정합니다.',
    href: '/dashboard/manager/practice-feedback/board',
  },
  {
    label: '예약 현황',
    description: '전체 예약과 진행 상태를 확인합니다.',
    href: '/dashboard/manager/practice-feedback/bookings',
  },
] as const

export default async function ManagerPracticeFeedbackLayout({ children }: { children: ReactNode }) {
  await requireAuthForDashboard('manager')

  return (
    <section className="space-y-8">
      <div className="space-y-4">
        <DashboardBackLink fallbackHref="/dashboard/manager" label="실장용 허브로 돌아가기" />
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-slate-900">입시 모의실기 1:1 피드백</h1>
          <p className="text-sm text-slate-600">
            선생님별 15분 슬롯을 개설하고, 담임 배정과 학생 자유 예약을 한 곳에서 관리하세요.
          </p>
        </div>
        <CounselingNav items={NAV_ITEMS} />
      </div>
      <div className="space-y-6">{children}</div>
    </section>
  )
}
