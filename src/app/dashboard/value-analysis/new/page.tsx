import DashboardBackLink from "@/components/dashboard/DashboardBackLink"
import { ValueAnalysisUploadForm } from "@/components/dashboard/value-analysis/ValueAnalysisUploadForm"
import { requireAuthForDashboard } from "@/lib/auth"
import { createClient as createServerSupabase } from "@/lib/supabase/server"
import type { ValueAnalysisGenre } from "@/lib/value-analysis"

export default async function ValueAnalysisNewPage() {
  const { profile } = await requireAuthForDashboard([
    "student",
    "teacher",
    "manager",
    "principal",
  ])

  const supabase = await createServerSupabase()
  const { data: genres } = await supabase
    .from("value_analysis_genres")
    .select("id, name, sort_order")
    .order("sort_order", { ascending: true })

  return (
    <section className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-3">
        <DashboardBackLink
          fallbackHref="/dashboard/value-analysis"
          label="게시판으로 돌아가기"
        />
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-slate-900">
            가치분석 제출
          </h1>
          <p className="text-sm text-slate-600">
            PDF 형태의 가치분석 과제를 업로드하세요.
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <ValueAnalysisUploadForm
          genres={(genres ?? []) as ValueAnalysisGenre[]}
          uploaderId={profile.id}
        />
      </div>
    </section>
  )
}
