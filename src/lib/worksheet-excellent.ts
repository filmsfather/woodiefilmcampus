import { createAdminClient } from '@/lib/supabase/admin'
import { loadMediaAssetLookup, pickFirstRelation, type WorksheetPhoto } from '@/lib/worksheet-posts'

type JsonRecord = Record<string, unknown>

export interface WorksheetExcellentMonth {
  id: string
  label: string
  year: number
  month: number
}

export interface WorksheetExcellentPostItem {
  postId: string
  studentName: string
  className: string | null
  workbookTitle: string | null
  featuredComment: string | null
  mediaAssetId: string
  photos: WorksheetPhoto[]
  selectedAt: string
}

export interface WorksheetExcellentMonthGroup {
  month: WorksheetExcellentMonth
  posts: WorksheetExcellentPostItem[]
}

export interface WorksheetPostExcellenceEntry {
  monthId: string
  monthLabel: string
}

export async function fetchWorksheetExcellentMonths(): Promise<WorksheetExcellentMonth[]> {
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('worksheet_excellent_months')
    .select('id, label, year, month')
    .order('year', { ascending: false })
    .order('month', { ascending: false })

  if (error) {
    console.error('[worksheet-excellent] failed to fetch months', error)
    return []
  }

  return (data ?? []).map((row) => ({
    id: row.id as string,
    label: row.label as string,
    year: row.year as number,
    month: row.month as number,
  }))
}

export async function addWorksheetExcellentMonth(
  label: string,
  year: number,
  month: number,
  createdBy: string
): Promise<{ success: true; month: WorksheetExcellentMonth } | { success: false; error: string }> {
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('worksheet_excellent_months')
    .insert({ label, year, month, created_by: createdBy })
    .select('id, label, year, month')
    .single()

  if (error) {
    if (error.code === '23505') {
      return { success: false, error: '해당 연도/월이 이미 존재합니다.' }
    }
    console.error('[worksheet-excellent] failed to add month', error)
    return { success: false, error: '월 추가에 실패했습니다.' }
  }

  return {
    success: true,
    month: {
      id: data.id as string,
      label: data.label as string,
      year: data.year as number,
      month: data.month as number,
    },
  }
}

export async function selectWorksheetExcellentPost(
  monthId: string,
  postId: string,
  selectedBy: string
): Promise<{ success: true } | { success: false; error: string }> {
  const admin = createAdminClient()

  const { data: post, error: postError } = await admin
    .from('worksheet_posts')
    .select('id, is_featured')
    .eq('id', postId)
    .eq('is_deleted', false)
    .maybeSingle()

  if (postError || !post) {
    return { success: false, error: '게시물을 찾을 수 없습니다.' }
  }

  if (!post.is_featured) {
    return { success: false, error: '추천된 게시물만 우수작으로 선정할 수 있습니다.' }
  }

  const { error } = await admin
    .from('worksheet_excellent_posts')
    .upsert(
      { month_id: monthId, post_id: postId, selected_by: selectedBy },
      { onConflict: 'month_id,post_id', ignoreDuplicates: true }
    )

  if (error) {
    console.error('[worksheet-excellent] failed to select post', error)
    return { success: false, error: '우수작 선정에 실패했습니다.' }
  }

  return { success: true }
}

export async function removeWorksheetExcellentPost(
  monthId: string,
  postId: string
): Promise<{ success: true } | { success: false; error: string }> {
  const admin = createAdminClient()

  const { error } = await admin
    .from('worksheet_excellent_posts')
    .delete()
    .eq('month_id', monthId)
    .eq('post_id', postId)

  if (error) {
    console.error('[worksheet-excellent] failed to remove excellent post', error)
    return { success: false, error: '우수작 해제에 실패했습니다.' }
  }

  return { success: true }
}

export async function getWorksheetPostExcellenceMap(
  postIds: string[]
): Promise<Map<string, WorksheetPostExcellenceEntry>> {
  if (postIds.length === 0) {
    return new Map()
  }

  const admin = createAdminClient()

  const { data, error } = await admin
    .from('worksheet_excellent_posts')
    .select('post_id, month_id, worksheet_excellent_months(id, label)')
    .in('post_id', postIds)

  if (error) {
    console.error('[worksheet-excellent] failed to load excellence map', error)
    return new Map()
  }

  const map = new Map<string, WorksheetPostExcellenceEntry>()

  for (const row of data ?? []) {
    const postId = row.post_id as string
    const monthRelation = pickFirstRelation<{ id: string; label: string }>(row.worksheet_excellent_months)

    if (!monthRelation) {
      continue
    }

    map.set(postId, {
      monthId: monthRelation.id,
      monthLabel: monthRelation.label,
    })
  }

  return map
}

export async function fetchWorksheetExcellentPostsByMonth(): Promise<WorksheetExcellentMonthGroup[]> {
  const admin = createAdminClient()

  const { data: months, error: monthsError } = await admin
    .from('worksheet_excellent_months')
    .select('id, label, year, month')
    .order('year', { ascending: false })
    .order('month', { ascending: false })

  if (monthsError || !months || months.length === 0) {
    if (monthsError) {
      console.error('[worksheet-excellent] failed to fetch months', monthsError)
    }
    return []
  }

  const monthIds = months.map((row) => row.id as string)

  const { data: excellentRows, error: excellentError } = await admin
    .from('worksheet_excellent_posts')
    .select(`
      id,
      month_id,
      post_id,
      selected_at,
      worksheet_posts!inner(
        id,
        media_asset_id,
        is_featured,
        is_deleted,
        hidden_by_student,
        featured_comment,
        profiles:profiles!worksheet_posts_student_id_fkey(id, name),
        classes:classes!worksheet_posts_class_id_fkey(id, name),
        workbooks:workbooks!worksheet_posts_workbook_id_fkey(id, title),
        worksheet_post_assets(id, order_index, media_asset_id)
      )
    `)
    .in('month_id', monthIds)
    .order('selected_at', { ascending: false })

  if (excellentError) {
    console.error('[worksheet-excellent] failed to fetch excellent posts', excellentError)
    return []
  }

  const rows = (excellentRows ?? []) as unknown as Array<JsonRecord>

  const mediaAssetIds = new Set<string>()

  for (const row of rows) {
    const post = pickFirstRelation<JsonRecord>(row.worksheet_posts)

    if (!post) {
      continue
    }

    if (typeof post.media_asset_id === 'string') {
      mediaAssetIds.add(post.media_asset_id)
    }

    const assets = Array.isArray(post.worksheet_post_assets) ? post.worksheet_post_assets : []

    for (const asset of assets) {
      const mediaId = (asset as JsonRecord).media_asset_id
      if (typeof mediaId === 'string') {
        mediaAssetIds.add(mediaId)
      }
    }
  }

  const assetLookup = await loadMediaAssetLookup(admin, Array.from(mediaAssetIds))

  const monthMap = new Map<string, WorksheetExcellentMonthGroup>()

  for (const row of months) {
    monthMap.set(row.id as string, {
      month: {
        id: row.id as string,
        label: row.label as string,
        year: row.year as number,
        month: row.month as number,
      },
      posts: [],
    })
  }

  for (const row of rows) {
    const monthId = row.month_id as string
    const postId = row.post_id as string
    const selectedAt = row.selected_at as string
    const post = pickFirstRelation<JsonRecord>(row.worksheet_posts)

    if (!post || post.is_deleted === true || post.hidden_by_student === true) {
      continue
    }

    const group = monthMap.get(monthId)

    if (!group) {
      continue
    }

    const profileRelation = pickFirstRelation<{ id: string; name: string | null }>(post.profiles)
    const classRelation = pickFirstRelation<{ id: string; name: string | null }>(post.classes)
    const workbookRelation = pickFirstRelation<{ id: string; title: string | null }>(post.workbooks)

    const mediaAssetId = typeof post.media_asset_id === 'string' ? post.media_asset_id : ''

    const rawAttachments = Array.isArray(post.worksheet_post_assets) ? post.worksheet_post_assets : []

    let photos = rawAttachments
      .map((attachment, index) => {
        const asset = attachment as JsonRecord
        const attachmentId = typeof asset.id === 'string' ? asset.id : null
        const attachmentMediaId = typeof asset.media_asset_id === 'string' ? asset.media_asset_id : null

        if (!attachmentId || !attachmentMediaId) {
          return null
        }

        const info = assetLookup.get(attachmentMediaId)

        if (!info) {
          return null
        }

        return {
          id: attachmentId,
          mediaAssetId: attachmentMediaId,
          filename: info.filename,
          url: info.url,
          order: typeof asset.order_index === 'number' ? asset.order_index : index,
        }
      })
      .filter((photo): photo is WorksheetPhoto & { order: number } => Boolean(photo))
      .sort((a, b) => a.order - b.order)

    if (photos.length === 0 && mediaAssetId) {
      const info = assetLookup.get(mediaAssetId)

      if (info) {
        photos = [
          {
            id: `${postId}-primary`,
            mediaAssetId,
            filename: info.filename,
            url: info.url,
            order: 0,
          },
        ]
      }
    }

    if (photos.length === 0) {
      continue
    }

    group.posts.push({
      postId,
      studentName: (profileRelation?.name ?? '이름 미확인').trim() || '이름 미입력',
      className: classRelation?.name ?? null,
      workbookTitle: workbookRelation?.title ?? null,
      featuredComment: typeof post.featured_comment === 'string' ? post.featured_comment : null,
      mediaAssetId,
      photos: photos.map(({ id, mediaAssetId: photoAssetId, filename, url }) => ({
        id,
        mediaAssetId: photoAssetId,
        filename,
        url,
      })),
      selectedAt,
    })
  }

  return Array.from(monthMap.values()).filter((group) => group.posts.length > 0)
}
