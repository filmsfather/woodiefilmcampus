import Link from 'next/link'

import { DashboardCard } from '@/components/dashboard/DashboardCard'
import { Button } from '@/components/ui/button'
import { requireAuthForDashboard } from '@/lib/auth'

type ActionVariant = 'default' | 'secondary' | 'outline'

interface DashboardActionItem {
  label: string
  href: string
  description: string
  variant: ActionVariant
}

const TODO_ACTIONS: DashboardActionItem[] = [
  {
    label: '이번달 학습 계획',
    href: '/dashboard/student/monthly-plan',
    description: '과목별 커리큘럼을 살펴보고 월간 학습 동선을 한눈에 정리합니다.',
    variant: 'default',
  },
  {
    label: '이번주 문제집 풀기',
    href: '/dashboard/student/tasks',
    description: '이번 주 배정된 문제집으로 바로 이동해 과제를 마무리합니다.',
    variant: 'secondary',
  },
]

const DONE_ACTIONS: DashboardActionItem[] = [
  {
    label: '지난달 학습 일지',
    href: '/dashboard/student/learning-journal',
    description: '지난달 학습 흐름과 피드백을 되돌아보며 개선 포인트를 찾습니다.',
    variant: 'default',
  },
  {
    label: '영화 감상 일지',
    href: '/dashboard/student/film-notes',
    description: '감상한 영화와 느낀 점을 차곡차곡 기록해 기억과 통찰을 정리합니다.',
    variant: 'secondary',
  },
  {
    label: '작품 아틀리에',
    href: '/dashboard/student/atelier',
    description: '다른 친구들의 과제를 둘러보고 배울 점을 발견해 자신의 작품에 반영해 보세요.',
    variant: 'outline',
  },
]

export default async function StudentDashboardPage() {
  const { profile } = await requireAuthForDashboard('student')

  if (!profile) {
    return null
  }

  const displayName = profile.name ?? profile.email ?? '학생'

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-slate-900">학생 대시보드</h1>
        <p className="text-sm text-slate-600">{displayName}님, 필요한 학습 메뉴를 선택해 다음 단계를 준비해 보세요.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <DashboardCard
          title="해야할 일"
          description="이번 주 집중 과제와 월간 목표를 빠르게 파악하고 바로 실행할 수 있는 작업 공간입니다."
        >
          <div className="grid gap-4">
            {TODO_ACTIONS.map(({ label, href, description, variant }) => (
              <div key={href} className="flex flex-col gap-1">
                <Button asChild variant={variant} className="justify-start">
                  <Link href={href}>{label}</Link>
                </Button>
                <p className="text-xs text-slate-500">{description}</p>
              </div>
            ))}
          </div>
        </DashboardCard>
        <DashboardCard
          title="해냈던 일"
          description="지난 활동을 정리하며 성취를 확인하고 다음 학습에 참고할 기록 보관소입니다."
        >
          <div className="grid gap-4">
            {DONE_ACTIONS.map(({ label, href, description, variant }) => (
              <div key={href} className="flex flex-col gap-1">
                <Button asChild variant={variant} className="justify-start">
                  <Link href={href}>{label}</Link>
                </Button>
                <p className="text-xs text-slate-500">{description}</p>
              </div>
            ))}
          </div>
        </DashboardCard>
      </div>
    </section>
  )
}
