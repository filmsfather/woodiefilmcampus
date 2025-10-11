import { requireAuthForDashboard } from '@/lib/auth'

export default async function StudentMonthlyPlanPlaceholderPage() {
  const { profile } = await requireAuthForDashboard('student')

  if (!profile) {
    return null
  }

  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-slate-900">이번달 학습 계획</h1>
        <p className="text-sm text-slate-600">곧 구현 예정입니다.</p>
      </header>
    </section>
  )
}
