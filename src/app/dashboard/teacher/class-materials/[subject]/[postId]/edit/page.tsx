import { notFound } from 'next/navigation'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { ClassMaterialPostForm } from '@/components/dashboard/class-materials/ClassMaterialPostForm'
import {
  deleteClassMaterialPost,
  updateClassMaterialPost,
} from '@/app/dashboard/teacher/class-materials/actions'
import {
  getClassMaterialSubjectLabel,
  isClassMaterialSubject,
} from '@/lib/class-materials'
import { createClient as createServerSupabase } from '@/lib/supabase/server'

export default async function EditClassMaterialPage({
  params,
}: {
  params: { subject: string; postId: string }
}) {
  if (!isClassMaterialSubject(params.subject)) {
    notFound()
  }

  const subject = params.subject
  const supabase = createServerSupabase()

  const { data, error } = await supabase
    .from('class_material_posts')
    .select(
      `id,
       subject,
       week_label,
       title,
       description,
       class_material_asset:media_assets!class_material_posts_class_material_asset_id_fkey(metadata),
       student_handout_asset:media_assets!class_material_posts_student_handout_asset_id_fkey(metadata)
      `
    )
    .eq('id', params.postId)
    .maybeSingle()

  if (error) {
    console.error('[class-materials] edit fetch error', error)
    throw new Error('자료 정보를 불러오지 못했습니다.')
  }

  if (!data || data.subject !== subject) {
    notFound()
  }

  const classMaterialAsset = Array.isArray(data.class_material_asset)
    ? data.class_material_asset[0]
    : data.class_material_asset
  const studentHandoutAsset = Array.isArray(data.student_handout_asset)
    ? data.student_handout_asset[0]
    : data.student_handout_asset

  const classMaterialMeta = (classMaterialAsset?.metadata as { originalName?: string } | null) ?? null
  const studentHandoutMeta = (studentHandoutAsset?.metadata as { originalName?: string } | null) ?? null

  const defaults = {
    postId: data.id as string,
    weekLabel: data.week_label as string | null,
    title: data.title as string,
    description: data.description as string | null,
    classMaterialName: classMaterialMeta?.originalName ?? null,
    studentHandoutName: studentHandoutMeta?.originalName ?? null,
  }

  const title = getClassMaterialSubjectLabel(subject)

  return (
    <section className="space-y-6">
      <DashboardBackLink
        fallbackHref={`/dashboard/teacher/class-materials/${subject}/${params.postId}`}
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
        onDelete={() => deleteClassMaterialPost(params.postId)}
      />
    </section>
  )
}
