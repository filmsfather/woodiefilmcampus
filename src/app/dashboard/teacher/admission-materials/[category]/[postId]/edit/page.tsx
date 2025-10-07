import { notFound } from 'next/navigation'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { AdmissionMaterialPostForm } from '@/components/dashboard/admission-materials/AdmissionMaterialPostForm'
import {
  deleteAdmissionMaterialPost,
  updateAdmissionMaterialPost,
} from '@/app/dashboard/teacher/admission-materials/actions'
import {
  getAdmissionCategoryLabel,
  isAdmissionMaterialCategory,
} from '@/lib/admission-materials'
import { createClient as createServerSupabase } from '@/lib/supabase/server'

export default async function EditAdmissionMaterialPage({
  params,
}: {
  params: { category: string; postId: string }
}) {
  if (!isAdmissionMaterialCategory(params.category)) {
    notFound()
  }

  const category = params.category
  const supabase = createServerSupabase()

  const { data, error } = await supabase
    .from('admission_material_posts')
    .select(
      `id,
       category,
       target_level,
       title,
       description,
       guide_asset:media_assets!admission_material_posts_guide_asset_id_fkey(metadata),
       resource_asset:media_assets!admission_material_posts_resource_asset_id_fkey(metadata),
       schedules:admission_material_schedules(id, title, start_at, end_at, location, memo)
      `
    )
    .eq('id', params.postId)
    .maybeSingle()

  if (error) {
    console.error('[admission-materials] failed to load post for edit', error)
    throw new Error('입시 자료를 불러올 수 없습니다.')
  }

  if (!data || data.category !== category) {
    notFound()
  }

  const guideRelation = Array.isArray(data.guide_asset) ? data.guide_asset[0] : data.guide_asset
  const resourceRelation = Array.isArray(data.resource_asset) ? data.resource_asset[0] : data.resource_asset

  const pickAssetName = (asset?: { metadata: Record<string, unknown> | null }) => {
    if (!asset) {
      return null
    }
    const metaName = (asset.metadata as { originalName?: string } | null)?.originalName
    return metaName ?? null
  }

  const titleLabel = getAdmissionCategoryLabel(category)

  return (
    <section className="space-y-6">
      <DashboardBackLink
        fallbackHref={`/dashboard/teacher/admission-materials/${category}/${params.postId}`}
        label="입시 자료 상세로 돌아가기"
      />
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-slate-900">{titleLabel} · 자료 수정</h1>
        <p className="text-sm text-slate-600">자료와 일정을 업데이트하면 달력에서도 바로 반영됩니다.</p>
      </div>

      <AdmissionMaterialPostForm
        category={category}
        defaults={{
          postId: data.id as string,
          targetLevel: (data.target_level ?? null) as string | null,
          title: data.title as string,
          description: (data.description ?? null) as string | null,
          guideName: pickAssetName(guideRelation ?? undefined),
          resourceName: pickAssetName(resourceRelation ?? undefined),
          schedules: (Array.isArray(data.schedules) ? data.schedules : []).map((schedule) => ({
            title: String(schedule.title),
            startAt: String(schedule.start_at),
            endAt: schedule.end_at ? String(schedule.end_at) : null,
            memo: schedule.memo ? String(schedule.memo) : null,
          })),
        }}
        submitLabel="변경 사항 저장"
        onSubmit={updateAdmissionMaterialPost}
        onDelete={deleteAdmissionMaterialPost.bind(null, params.postId)}
      />
    </section>
  )
}
