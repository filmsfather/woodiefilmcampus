import DashboardBackLink from "@/components/dashboard/DashboardBackLink"
import { CulturePickForm } from "@/components/dashboard/culture-picks/CulturePickForm"
import { requireAuthForDashboard } from "@/lib/auth"

export default async function NewCulturePickPage() {
  await requireAuthForDashboard(["teacher", "manager", "principal"])

  return (
    <section className="space-y-6">
      <div className="space-y-3">
        <DashboardBackLink
          fallbackHref="/dashboard/culture-picks"
          label="목록으로 돌아가기"
        />
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-slate-900">✨ 새 Culture Pick 등록</h1>
          <p className="text-sm text-slate-600">
            학생들에게 추천하고 싶은 책, 영화, 음악을 등록해보세요
          </p>
        </div>
      </div>

      <div className="max-w-xl">
        <CulturePickForm mode="create" />
      </div>
    </section>
  )
}

