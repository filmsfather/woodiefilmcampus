import { requireAuthForDashboard } from '@/lib/auth'

export default async function TeacherDashboardPage() {
  const { profile } = await requireAuthForDashboard('teacher')

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">선생님 대시보드</h1>
        <p className="text-slate-600">
          {profile?.name ?? profile?.email} 님, 수업 준비와 학생 관리 도구가 추가될 예정입니다.
        </p>
      </div>
      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
        수업 일정, 숙제 체크리스트, 반별 공지 컴포넌트를 이 영역에서 설계할 수 있습니다.
      </div>
    </section>
  )
}
