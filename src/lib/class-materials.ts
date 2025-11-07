import { createClient as createServerSupabase } from '@/lib/supabase/server'
export {
  CLASS_MATERIALS_BUCKET,
  CLASS_MATERIAL_SUBJECTS,
  CLASS_MATERIAL_ALLOWED_ROLES,
  type ClassMaterialAllowedRole,
  type ClassMaterialAssetType,
  type ClassMaterialSubject,
  getClassMaterialSubjectDescription,
  getClassMaterialSubjectLabel,
  isClassMaterialAllowedRole,
  isClassMaterialSubject,
} from '@/lib/class-materials-shared'

interface MediaAssetRow {
  id: string
  bucket: string
  path: string
  mime_type: string | null
  metadata: Record<string, unknown> | null
}

interface ClassMaterialSummaryRow {
  id: string
  title: string
  description: string | null
  week_label: string | null
  student_handout_asset?: MediaAssetRow | MediaAssetRow[] | null
}

export interface ClassMaterialSummary {
  id: string
  title: string
  description: string | null
  weekLabel: string | null
  studentHandoutAsset:
    | {
        id: string
        bucket: string
        path: string
        mimeType: string | null
        metadata: Record<string, unknown> | null
      }
    | null
}

export async function fetchClassMaterialSummaries(
  postIds: string[]
): Promise<Map<string, ClassMaterialSummary>> {
  if (postIds.length === 0) {
    return new Map<string, ClassMaterialSummary>()
  }

  const supabase = createServerSupabase()

  const { data, error } = await supabase
    .from('class_material_posts')
    .select(
      `id,
       title,
       description,
       week_label,
       student_handout_asset:media_assets!class_material_posts_student_handout_asset_id_fkey(id, bucket, path, mime_type, metadata)
      `
    )
    .in('id', postIds)

  if (error) {
    console.error('[class-materials] failed to fetch material summaries', error)
    return new Map<string, ClassMaterialSummary>()
  }

  const summaries = new Map<string, ClassMaterialSummary>()

  for (const row of (data ?? []) as ClassMaterialSummaryRow[]) {
    const handoutRelation = Array.isArray(row.student_handout_asset)
      ? row.student_handout_asset[0]
      : row.student_handout_asset

    summaries.set(row.id, {
      id: row.id,
      title: row.title,
      description: row.description ?? null,
      weekLabel: row.week_label ?? null,
      studentHandoutAsset: handoutRelation
        ? {
            id: handoutRelation.id,
            bucket: handoutRelation.bucket,
            path: handoutRelation.path,
            mimeType: handoutRelation.mime_type ?? null,
            metadata: handoutRelation.metadata ?? null,
          }
        : null,
    })
  }

  return summaries
}
