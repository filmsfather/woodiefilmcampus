import { notFound } from 'next/navigation'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { ClassMaterialPostForm } from '@/components/dashboard/class-materials/ClassMaterialPostForm'
import {
  deleteClassMaterialPost,
  updateClassMaterialPost,
} from '@/app/dashboard/teacher/class-materials/actions'
import {
  type ClassMaterialAssetType,
  getClassMaterialSubjectLabel,
  isClassMaterialSubject,
} from '@/lib/class-materials'
import { requireAuthForDashboard } from '@/lib/auth'
import { createClient as createServerSupabase } from '@/lib/supabase/server'

export default async function EditClassMaterialPage({
  params,
}: {
  params: Promise<{ subject: string; postId: string }>
}) {
  const { profile } = await requireAuthForDashboard(['teacher', 'manager'])
  const { subject, postId } = await params
  if (!isClassMaterialSubject(subject)) {
    notFound()
  }
  const supabase = createServerSupabase()

  const { data, error } = await supabase
    .from('class_material_posts')
    .select(
      `id,
       subject,
       week_label,
       title,
       description,
       attachments:class_material_post_assets!class_material_post_assets_post_id_fkey(
         id,
         kind,
         order_index,
         media_asset:media_assets(id, metadata)
       )
      `
    )
    .eq('id', postId)
    .maybeSingle()

  if (error) {
    console.error('[class-materials] edit fetch error', error)
    throw new Error('자료 정보를 불러오지 못했습니다.')
  }

  if (!data || data.subject !== subject) {
    notFound()
  }

  const attachmentDefaults = (Array.isArray(data.attachments) ? data.attachments : [])
    .map((attachment) => {
      const mediaRelation = Array.isArray(attachment.media_asset)
        ? attachment.media_asset[0]
        : attachment.media_asset
      const meta = (mediaRelation?.metadata as { originalName?: string } | null) ?? null
      return {
        id: String(attachment.id),
        kind: (attachment.kind ?? 'class_material') as ClassMaterialAssetType,
        name: meta?.originalName ?? '첨부 파일',
        order: Number(attachment.order_index ?? 0),
      }
    })
    .sort((a, b) => a.order - b.order)

  const defaults = {
    postId: data.id as string,
    weekLabel: data.week_label as string | null,
    title: data.title as string,
    description: data.description as string | null,
    attachments: attachmentDefaults,
  }

  const title = getClassMaterialSubjectLabel(subject)

  return (
    <section className="space-y-6">
      <DashboardBackLink
        fallbackHref={`/dashboard/teacher/class-materials/${subject}/${postId}`}
        label="자료 상세로 돌아가기"
      />
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-slate-900">{title} · 자료 수정</h1>
        <p className="text-sm text-slate-600">파일 교체 또는 설명 수정을 진행할 수 있습니다.</p>
      </div>

      <ClassMaterialPostForm
        subject={subject}
        defaults={defaults}
        submitLabel="자료 수정"
        onSubmit={updateClassMaterialPost}
        onDelete={deleteClassMaterialPost.bind(null, postId)}
        currentUserId={profile.id}
      />
    </section>
  )
}
