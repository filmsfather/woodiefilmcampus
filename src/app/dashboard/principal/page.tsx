import { requireAuthForDashboard } from '@/lib/auth'

export default async function PrincipalDashboardPage() {
  const { profile } = await requireAuthForDashboard('principal')

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">원장 대시보드</h1>
        <p className="text-slate-600">
          {profile?.name ?? profile?.email} 님, 상단 역할 전환 메뉴를 통해 필요한 대시보드로 이동해 업무를 진행해 주세요.
        </p>
      </div>
      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
        캠퍼스 핵심 지표, 역할 관리 카드 등 원장 전용 콘텐츠가 이 영역에 추가될 예정입니다.
      </div>
    </section>
  )
}
