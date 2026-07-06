import type { Metadata } from 'next'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { requireAuthForDashboard } from '@/lib/auth'
import {
  fetchClassFormationBoard,
  fetchClassFormationPlans,
  fetchTeacherOptions,
} from '@/lib/class-formation/data'
import ClassFormationWorkspace from '@/app/dashboard/principal/university-reports/wishlists/ClassFormationWorkspace'

export const metadata: Metadata = {
  title: '반편성 | 지원가능대학 레포트',
  description: '확정 완료 학생을 지원 대학·수업 희망 요일 기준으로 필터링해 반을 편성합니다.',
}

type SearchParams = Record<string, string | string[] | undefined>

export default async function ClassFormationPage(props: {
  searchParams?: Promise<SearchParams>
}) {
  await requireAuthForDashboard('principal')

  const searchParams = await props.searchParams
  const planParam = searchParams?.plan
  const requestedPlanId = Array.isArray(planParam) ? planParam[0] : planParam

  const [plans, teacherOptions] = await Promise.all([
    fetchClassFormationPlans(),
    fetchTeacherOptions(),
  ])

  const activePlanId =
    requestedPlanId && plans.some((plan) => plan.id === requestedPlanId)
      ? requestedPlanId
      : plans[0]?.id ?? null

  const board = activePlanId ? await fetchClassFormationBoard(activePlanId) : null

  return (
    <section className="space-y-6">
      <DashboardBackLink
        fallbackHref="/dashboard/principal/university-reports/workflow"
        label="단계별 관리로 돌아가기"
      />

      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-slate-900">반편성</h1>
        <p className="text-sm text-slate-600">
          <code className="rounded bg-slate-100 px-1">/confirm</code> 폼에서 지원 대학과 수업 희망
          요일 선택을 완료한 학생을 대상으로, 지원 대학이 비슷하고 같은 요일에 수강 가능한 학생끼리
          묶어 반을 편성합니다. 확정하면 실제 반으로 반영됩니다.
        </p>
      </header>

      <ClassFormationWorkspace
        plans={plans}
        board={board}
        activePlanId={activePlanId}
        teacherOptions={teacherOptions}
      />
    </section>
  )
}
