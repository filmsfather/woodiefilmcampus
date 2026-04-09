import { requireAuthForDashboard } from "@/lib/auth"

export default async function UniversityReportsPage() {
  await requireAuthForDashboard("principal")

  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-slate-900">
          지원가능대학 레포트 관리
        </h1>
        <p className="text-slate-600">
          학생별 지원 가능 대학 레포트를 관리하는 페이지입니다.
        </p>
      </header>

      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
        이 페이지는 준비 중입니다. 곧 기능이 추가될 예정입니다.
      </div>
    </section>
  )
}
