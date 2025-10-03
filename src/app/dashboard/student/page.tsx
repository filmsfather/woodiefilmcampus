import { requireAuthForDashboard } from '@/lib/auth'

export default async function StudentDashboardPage() {
  const { profile } = await requireAuthForDashboard('student')

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">학생 대시보드</h1>
        <p className="text-slate-600">
          {profile?.name ?? profile?.email} 학생, 학습 현황과 진도 요약이 여기에 표시될 예정입니다.
        </p>
      </div>
      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
        모바일 친화적인 출석, 과제 제출, 알림 위젯을 이 영역에 채워나가세요.
      </div>
    </section>
  )
}
