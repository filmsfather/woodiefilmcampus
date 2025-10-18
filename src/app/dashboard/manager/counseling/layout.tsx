import type { ReactNode } from 'react'

import { CounselingNav } from '@/components/counseling/CounselingNav'
import { requireAuthForDashboard } from '@/lib/auth'

const NAV_ITEMS = [
  {
    label: '슬롯 설정',
    description: '하루 시간표에서 상담 가능 시간을 열고 닫아요.',
    href: '/dashboard/manager/counseling/slots',
  },
  {
    label: '예약 현황',
    description: '일자/주간별 상담 예약 상태를 확인합니다.',
    href: '/dashboard/manager/counseling/reservations',
  },
  {
    label: '질문 항목 설정',
    description: '예약 신청 폼에 노출할 추가 질문을 관리합니다.',
    href: '/dashboard/manager/counseling/questions',
  },
] as const

export default async function ManagerCounselingLayout({ children }: { children: ReactNode }) {
  await requireAuthForDashboard('manager')

  return (
    <section className="space-y-8">
      <div className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-slate-900">상담 관리</h1>
          <p className="text-sm text-slate-600">
            실장·원장 전용 상담 운영 센터입니다. 예약 가능한 시간과 신청 폼 질문, 예약 현황을 한 곳에서 관리하세요.
          </p>
        </div>
        <CounselingNav items={NAV_ITEMS} />
      </div>
      <div className="space-y-6">{children}</div>
    </section>
  )
}
