import { createAdminClient } from '@/lib/supabase/admin'

export interface ExcellentMonth {
  id: string
  label: string
  year: number
  month: number
}

export interface ExcellentPostItem {
  postId: string
  studentName: string
  workbookTitle: string | null
  featuredComment: string | null
  mediaAssetId: string
  attachments: Array<{ id: string; mediaAssetId: string; filename: string }>
  selectedAt: string
}

export interface ExcellentMonthGroup {
  month: ExcellentMonth
  posts: ExcellentPostItem[]
}

export interface PostExcellenceEntry {
  monthId: string
  monthLabel: string
}

export async function fetchExcellentMonths(): Promise<ExcellentMonth[]> {
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('atelier_excellent_months')
    .select('id, label, year, month')
    .order('year', { ascending: false })
    .order('month', { ascending: false })

  if (error) {
    console.error('[atelier-excellent] failed to fetch months', error)
    return []
  }

  return (data ?? []).map((row) => ({
    id: row.id as string,
    label: row.label as string,
    year: row.year as number,
    month: row.month as number,
  }))
}

export async function addExcellentMonth(
  label: string,
  year: number,
  month: number,
  createdBy: string
): Promise<{ success: true; month: ExcellentMonth } | { success: false; error: string }> {
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('atelier_excellent_months')
    .insert({ label, year, month, created_by: createdBy })
    .select('id, label, year, month')
    .single()

  if (error) {
    if (error.code === '23505') {
      return { success: false, error: '해당 연도/월이 이미 존재합니다.' }
    }
    console.error('[atelier-excellent] failed to add month', error)
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

export async function selectExcellentPost(
  monthId: string,
  postId: string,
  selectedBy: string
): Promise<{ success: true } | { success: false; error: string }> {
  const admin = createAdminClient()

  const { data: post, error: postError } = await admin
    .from('atelier_posts')
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
    .from('atelier_excellent_posts')
    .upsert(
      { month_id: monthId, post_id: postId, selected_by: selectedBy },
      { onConflict: 'month_id,post_id', ignoreDuplicates: true }
    )

  if (error) {
    console.error('[atelier-excellent] failed to select post', error)
    return { success: false, error: '우수작 선정에 실패했습니다.' }
  }

  return { success: true }
}

export async function removeExcellentPost(
  monthId: string,
  postId: string
): Promise<{ success: true } | { success: false; error: string }> {
  const admin = createAdminClient()

  const { error } = await admin
    .from('atelier_excellent_posts')
    .delete()
    .eq('month_id', monthId)
    .eq('post_id', postId)

  if (error) {
    console.error('[atelier-excellent] failed to remove excellent post', error)
    return { success: false, error: '우수작 해제에 실패했습니다.' }
  }

  return { success: true }
}

type JsonRecord = Record<string, unknown>

export async function getPostExcellenceMap(
  postIds: string[]
): Promise<Map<string, PostExcellenceEntry>> {
  if (postIds.length === 0) {
    return new Map()
  }

  const admin = createAdminClient()

  const { data, error } = await admin
    .from('atelier_excellent_posts')
    .select('post_id, month_id, atelier_excellent_months(id, label)')
    .in('post_id', postIds)

  if (error) {
    console.error('[atelier-excellent] failed to load excellence map', error)
    return new Map()
  }

  const map = new Map<string, PostExcellenceEntry>()

  for (const row of data ?? []) {
    const postId = row.post_id as string
    const monthRelation = pickFirstRelation<{ id: string; label: string }>(row.atelier_excellent_months)
    if (!monthRelation) continue

    map.set(postId, {
      monthId: monthRelation.id,
      monthLabel: monthRelation.label,
    })
  }

  return map
}

function pickFirstRelation<T>(value: unknown): T | null {
  if (Array.isArray(value)) {
    return (value[0] as T) ?? null
  }
  if (value && typeof value === 'object') {
    return value as T
  }
  return null
}

export async function fetchExcellentPostsByMonth(): Promise<ExcellentMonthGroup[]> {
  const admin = createAdminClient()

  const { data: months, error: monthsError } = await admin
    .from('atelier_excellent_months')
    .select('id, label, year, month')
    .order('year', { ascending: false })
    .order('month', { ascending: false })

  if (monthsError || !months || months.length === 0) {
    if (monthsError) {
      console.error('[atelier-excellent] failed to fetch months', monthsError)
    }
    return []
  }

  const monthIds = months.map((m) => m.id as string)

  const { data: excellentRows, error: excellentError } = await admin
    .from('atelier_excellent_posts')
    .select(`
      id,
      month_id,
      post_id,
      selected_at,
      atelier_posts!inner(
        id,
        media_asset_id,
        is_featured,
        is_deleted,
        hidden_by_student,
        featured_comment,
        profiles:profiles!atelier_posts_student_id_fkey(id, name),
        workbooks:workbooks!atelier_posts_workbook_id_fkey(id, title),
        atelier_post_assets(id, order_index, media_asset_id)
      )
    `)
    .in('month_id', monthIds)
    .order('selected_at', { ascending: false })

  if (excellentError) {
    console.error('[atelier-excellent] failed to fetch excellent posts', excellentError)
    return []
  }

  const rows = (excellentRows ?? []) as Array<JsonRecord>

  const mediaAssetIds = new Set<string>()
  for (const row of rows) {
    const post = row.atelier_posts as JsonRecord | null
    if (!post) continue
    if (typeof post.media_asset_id === 'string') {
      mediaAssetIds.add(post.media_asset_id)
    }
    const assets = Array.isArray(post.atelier_post_assets) ? post.atelier_post_assets : []
    for (const asset of assets) {
      const a = asset as JsonRecord
      if (typeof a.media_asset_id === 'string') {
        mediaAssetIds.add(a.media_asset_id)
      }
    }
  }

  const assetFilenameLookup = new Map<string, string>()
  const assetIdArray = Array.from(mediaAssetIds)

  if (assetIdArray.length > 0) {
    const { data: assetRows, error: assetError } = await admin
      .from('media_assets')
      .select('id, path, metadata')
      .in('id', assetIdArray)

    if (assetError) {
      console.error('[atelier-excellent] failed to load media assets', assetError)
    } else {
      for (const asset of assetRows ?? []) {
        if (!asset?.id) continue
        const metadata = (asset.metadata as JsonRecord | null) ?? null
        const possibleName = metadata?.originalName || metadata?.original_name || metadata?.filename || metadata?.name
        const fallbackName = typeof asset.path === 'string' ? asset.path.split('/').pop() : null
        const filename = typeof possibleName === 'string' && possibleName.length > 0
          ? possibleName
          : fallbackName ?? '제출 파일'
        assetFilenameLookup.set(asset.id as string, filename)
      }
    }
  }

  const monthMap = new Map<string, ExcellentMonthGroup>()
  for (const m of months) {
    monthMap.set(m.id as string, {
      month: {
        id: m.id as string,
        label: m.label as string,
        year: m.year as number,
        month: m.month as number,
      },
      posts: [],
    })
  }

  for (const row of rows) {
    const monthId = row.month_id as string
    const postId = row.post_id as string
    const selectedAt = row.selected_at as string
    const post = row.atelier_posts as JsonRecord | null
    if (!post) continue

    if (post.is_deleted === true || post.hidden_by_student === true) continue

    const profileRelation = pickFirstRelation<{ id: string; name: string | null }>(post.profiles)
    const workbookRelation = pickFirstRelation<{ id: string; title: string | null }>(post.workbooks)

    const mediaAssetId = typeof post.media_asset_id === 'string' ? post.media_asset_id : ''

    const rawAttachments = Array.isArray(post.atelier_post_assets) ? post.atelier_post_assets : []
    let attachments = rawAttachments
      .map((att, index) => {
        const a = att as JsonRecord
        const attId = typeof a.id === 'string' ? a.id : null
        const attMediaId = typeof a.media_asset_id === 'string' ? a.media_asset_id : null
        if (!attId || !attMediaId) return null
        return {
          id: attId,
          mediaAssetId: attMediaId,
          filename: assetFilenameLookup.get(attMediaId) ?? '제출 파일',
          order: typeof a.order_index === 'number' ? a.order_index : index,
        }
      })
      .filter((att): att is NonNullable<typeof att> => Boolean(att))
      .sort((a, b) => a.order - b.order)

    if (attachments.length === 0 && mediaAssetId) {
      attachments = [{
        id: `${postId}-primary`,
        mediaAssetId,
        filename: assetFilenameLookup.get(mediaAssetId) ?? '제출 파일',
        order: 0,
      }]
    }

    const group = monthMap.get(monthId)
    if (!group) continue

    group.posts.push({
      postId,
      studentName: (profileRelation?.name ?? '이름 미확인').trim() || '이름 미입력',
      workbookTitle: workbookRelation?.title ?? null,
      featuredComment: typeof post.featured_comment === 'string' ? post.featured_comment : null,
      mediaAssetId,
      attachments: attachments.map(({ id, mediaAssetId, filename }) => ({ id, mediaAssetId, filename })),
      selectedAt,
    })
  }

  return Array.from(monthMap.values()).filter((group) => group.posts.length > 0)
}
