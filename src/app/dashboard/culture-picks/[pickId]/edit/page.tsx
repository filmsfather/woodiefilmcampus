import { notFound } from "next/navigation"

import DashboardBackLink from "@/components/dashboard/DashboardBackLink"
import { CulturePickForm } from "@/components/dashboard/culture-picks/CulturePickForm"
import { requireAuthForDashboard } from "@/lib/auth"
import { createClient as createServerSupabase } from "@/lib/supabase/server"
import { type CulturePickCategory } from "@/lib/validation/culture-pick"

interface PageProps {
  params: Promise<{ pickId: string }>
}

export default async function EditCulturePickPage({ params }: PageProps) {
  const { pickId } = await params
  const { profile } = await requireAuthForDashboard(["teacher", "manager", "principal"])
  const supabase = await createServerSupabase()

  const { data: pick, error } = await supabase
    .from("culture_picks")
    .select("id, category, title, creator, description, cover_url, external_link, period_label, teacher_id")
    .eq("id", pickId)
    .single()

  if (error || !pick) {
    notFound()
  }

  // 권한 확인: 작성자 본인 또는 관리자/교장만 수정 가능
  const canEdit = pick.teacher_id === profile.id || ["manager", "principal"].includes(profile.role)
  if (!canEdit) {
    notFound()
  }

  return (
    <section className="space-y-6">
      <div className="space-y-3">
        <DashboardBackLink
          fallbackHref={`/dashboard/culture-picks/${pickId}`}
          label="상세 페이지로 돌아가기"
        />
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-slate-900">✏️ Culture Pick 수정</h1>
          <p className="text-sm text-slate-600">
            콘텐츠 정보를 수정합니다
          </p>
        </div>
      </div>

      <div className="max-w-xl">
        <CulturePickForm
          mode="edit"
          pickId={pickId}
          defaultValues={{
            category: pick.category as CulturePickCategory,
            title: pick.title,
            creator: pick.creator,
            description: pick.description,
            coverUrl: pick.cover_url,
            externalLink: pick.external_link,
            periodLabel: pick.period_label,
          }}
        />
      </div>
    </section>
  )
}

