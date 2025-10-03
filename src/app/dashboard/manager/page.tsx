import { requireAuthForDashboard } from '@/lib/auth'

export default async function ManagerDashboardPage() {
  const { profile } = await requireAuthForDashboard('manager')

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">실장 대시보드</h1>
        <p className="text-slate-600">
          {profile?.name ?? profile?.email} 님, 가입 승인과 역할 배분을 관리할 수 있도록 준비 중입니다.
        </p>
      </div>
      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
        추후 가입 요청, 반 관리, 구성원 위임 카드가 이 영역에 배치됩니다.
      </div>
    </section>
  )
}
