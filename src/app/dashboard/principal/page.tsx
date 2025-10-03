import { PrincipalRoleSwitcher } from '@/components/dashboard/principal/RoleSwitcher'
import { requireAuthForDashboard } from '@/lib/auth'

export default async function PrincipalDashboardPage() {
  const { profile } = await requireAuthForDashboard('principal')

  return (
    <section className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-slate-900">원장 대시보드 허브</h1>
        <p className="text-slate-600">
          {profile?.name ?? profile?.email} 님, 각 역할별 대시보드를 선택해 세부 업무를 진행하세요.
        </p>
      </header>
      <PrincipalRoleSwitcher currentRole={profile?.role ?? 'principal'} />
    </section>
  )
}
