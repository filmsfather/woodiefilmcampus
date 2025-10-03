import { requireAuthForDashboard } from '@/lib/auth'

export default async function PrincipalDashboardPage() {
  const { profile } = await requireAuthForDashboard('principal')

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">원장 대시보드</h1>
        <p className="text-slate-600">
          {profile?.name ?? profile?.email} 님, 전체 캠퍼스 현황을 한눈에 볼 수 있는 영역입니다.
        </p>
      </div>
      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
        앞으로 캠퍼스 요약, 역할 관리, 반 편성 위젯 등이 이 공간에 배치될 예정입니다.
      </div>
    </section>
  )
}
