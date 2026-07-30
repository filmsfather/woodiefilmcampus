import { createAdminClient } from '@/lib/supabase/admin'
import { SUBMISSIONS_BUCKET } from '@/lib/storage/buckets'
import type { UserRole } from '@/types/user'

type AdminClient = ReturnType<typeof createAdminClient>

type JsonRecord = Record<string, unknown>

interface SyncPostArgs {
  studentTaskId: string
  studentId?: string
  submittedAt?: string
}

type PostAttachment = {
  mediaAssetId: string
  sortKey: number
}

/**
 * 워크시트는 문항별로 task_submissions 행이 나뉘므로, 게시물 하나에 과제 전체의 사진을 모은다.
 * 정렬은 문항 position 우선, 같은 문항 안에서는 업로드 순서를 따른다.
 */
async function collectTaskAttachments(
  admin: AdminClient,
  studentTaskId: string
): Promise<PostAttachment[]> {
  const { data: submissionRows, error: submissionError } = await admin
    .from('task_submissions')
    .select('id, item_id, created_at')
    .eq('student_task_id', studentTaskId)

  if (submissionError) {
    console.error('[worksheet] failed to load task submissions', submissionError)
    return []
  }

  const submissions = (submissionRows ?? [])
    .map((row) => ({
      id: typeof row.id === 'string' ? row.id : null,
      itemId: typeof row.item_id === 'string' ? row.item_id : null,
      createdAt: typeof row.created_at === 'string' ? row.created_at : null,
    }))
    .filter((row): row is { id: string; itemId: string | null; createdAt: string | null } => Boolean(row.id))

  if (submissions.length === 0) {
    return []
  }

  const itemIds = submissions
    .map((submission) => submission.itemId)
    .filter((value): value is string => Boolean(value))

  const positionByItemId = new Map<string, number>()

  if (itemIds.length > 0) {
    const { data: itemRows, error: itemError } = await admin
      .from('workbook_items')
      .select('id, position')
      .in('id', itemIds)

    if (itemError) {
      console.error('[worksheet] failed to load workbook item positions', itemError)
    } else {
      for (const row of itemRows ?? []) {
        if (typeof row.id === 'string' && typeof row.position === 'number') {
          positionByItemId.set(row.id, row.position)
        }
      }
    }
  }

  const orderedSubmissions = [...submissions].sort((a, b) => {
    const positionA = a.itemId ? positionByItemId.get(a.itemId) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER
    const positionB = b.itemId ? positionByItemId.get(b.itemId) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER

    if (positionA !== positionB) {
      return positionA - positionB
    }

    return (a.createdAt ?? '').localeCompare(b.createdAt ?? '')
  })

  const submissionIds = orderedSubmissions.map((submission) => submission.id)

  const { data: assetRows, error: assetError } = await admin
    .from('task_submission_assets')
    .select('submission_id, media_asset_id, order_index, created_at')
    .in('submission_id', submissionIds)
    .order('order_index', { ascending: true })

  if (assetError) {
    console.error('[worksheet] failed to load submission assets', assetError)
    return []
  }

  const assetsBySubmission = new Map<string, Array<{ mediaAssetId: string; orderIndex: number }>>()

  ;(assetRows ?? []).forEach((row, index) => {
    const submissionId = typeof row.submission_id === 'string' ? row.submission_id : null
    const mediaAssetId = typeof row.media_asset_id === 'string' ? row.media_asset_id : null

    if (!submissionId || !mediaAssetId) {
      return
    }

    const orderIndex = typeof row.order_index === 'number' ? row.order_index : index
    const bucket = assetsBySubmission.get(submissionId) ?? []
    bucket.push({ mediaAssetId, orderIndex })
    assetsBySubmission.set(submissionId, bucket)
  })

  const attachments: PostAttachment[] = []

  orderedSubmissions.forEach((submission, submissionIndex) => {
    const position = submission.itemId
      ? positionByItemId.get(submission.itemId) ?? submissionIndex + 1
      : submissionIndex + 1

    const assets = (assetsBySubmission.get(submission.id) ?? []).sort((a, b) => a.orderIndex - b.orderIndex)

    assets.forEach((asset, photoIndex) => {
      attachments.push({
        mediaAssetId: asset.mediaAssetId,
        sortKey: position * 100 + photoIndex,
      })
    })
  })

  const seen = new Set<string>()

  return attachments
    .sort((a, b) => a.sortKey - b.sortKey)
    .filter((attachment) => {
      if (seen.has(attachment.mediaAssetId)) {
        return false
      }
      seen.add(attachment.mediaAssetId)
      return true
    })
}

async function replaceWorksheetPostAssets(
  admin: AdminClient,
  params: { postId: string; studentId: string; attachments: PostAttachment[] }
) {
  const { postId, studentId, attachments } = params

  await admin.from('worksheet_post_assets').delete().eq('post_id', postId)

  if (attachments.length === 0) {
    return
  }

  const payload = attachments.map((attachment, index) => ({
    post_id: postId,
    media_asset_id: attachment.mediaAssetId,
    order_index: index,
    created_by: studentId,
  }))

  const { error } = await admin
    .from('worksheet_post_assets')
    .upsert(payload, { onConflict: 'post_id,media_asset_id', ignoreDuplicates: true })

  if (error) {
    console.error('[worksheet] failed to sync post assets', error)
  }
}

export async function syncWorksheetPostForStudentTask({
  studentTaskId,
  studentId,
  submittedAt,
}: SyncPostArgs) {
  const admin = createAdminClient()

  const { data: taskRow, error: taskError } = await admin
    .from('student_tasks')
    .select('id, student_id, assignment_id, class_id')
    .eq('id', studentTaskId)
    .maybeSingle()

  if (taskError) {
    console.error('[worksheet] failed to load student_task', taskError)
    return
  }

  if (!taskRow) {
    console.warn('[worksheet] student_task not found for post sync', studentTaskId)
    return
  }

  const resolvedStudentId = studentId ?? (taskRow.student_id as string | null)

  if (!resolvedStudentId) {
    console.warn('[worksheet] unable to resolve student for post sync', studentTaskId)
    return
  }

  let workbookId: string | null = null

  if (taskRow.assignment_id) {
    const { data: assignmentRow, error: assignmentError } = await admin
      .from('assignments')
      .select('id, workbook_id')
      .eq('id', taskRow.assignment_id)
      .maybeSingle()

    if (assignmentError) {
      console.error('[worksheet] failed to load assignment for post sync', assignmentError)
    } else {
      workbookId = (assignmentRow?.workbook_id as string | null) ?? null
    }
  }

  const attachments = await collectTaskAttachments(admin, studentTaskId)

  if (attachments.length === 0) {
    console.warn('[worksheet] student task has no photos; skipping post sync', { studentTaskId })
    return
  }

  const { data: representativeSubmission } = await admin
    .from('task_submissions')
    .select('id')
    .eq('student_task_id', studentTaskId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  const timestamp = submittedAt ?? new Date().toISOString()

  const upsertPayload = {
    student_task_id: studentTaskId,
    student_id: resolvedStudentId,
    task_submission_id: (representativeSubmission?.id as string | null) ?? null,
    media_asset_id: attachments[0].mediaAssetId,
    assignment_id: (taskRow.assignment_id as string | null) ?? null,
    class_id: (taskRow.class_id as string | null) ?? null,
    workbook_id: workbookId,
    submitted_at: timestamp,
    is_deleted: false,
    deleted_at: null,
    deleted_by: null,
  }

  const { data: postRow, error: upsertError } = await admin
    .from('worksheet_posts')
    .upsert(upsertPayload, { onConflict: 'student_task_id', ignoreDuplicates: false })
    .select('id')
    .single()

  if (upsertError || !postRow?.id) {
    console.error('[worksheet] failed to upsert post', upsertError, { upsertPayload })
    return
  }

  await replaceWorksheetPostAssets(admin, {
    postId: postRow.id,
    studentId: resolvedStudentId,
    attachments,
  })
}

export async function setWorksheetPostHidden({
  postId,
  studentId,
  hidden,
}: {
  postId: string
  studentId: string
  hidden: boolean
}) {
  const admin = createAdminClient()

  const { data: postRow, error: fetchError } = await admin
    .from('worksheet_posts')
    .select('id, student_id')
    .eq('id', postId)
    .maybeSingle()

  if (fetchError) {
    console.error('[worksheet] failed to fetch post for hide toggle', fetchError)
    return { success: false as const, error: '게시물을 찾지 못했습니다.' }
  }

  if (!postRow || postRow.student_id !== studentId) {
    return { success: false as const, error: '본인 게시물만 숨길 수 있습니다.' }
  }

  const { error: updateError } = await admin
    .from('worksheet_posts')
    .update({
      hidden_by_student: hidden,
      hidden_at: hidden ? new Date().toISOString() : null,
    })
    .eq('id', postId)

  if (updateError) {
    console.error('[worksheet] failed to toggle hidden state', updateError)
    return { success: false as const, error: '숨김 상태를 변경하지 못했습니다.' }
  }

  return { success: true as const }
}

export async function setWorksheetPostFeatured({
  postId,
  teacherId,
  featured,
  comment,
}: {
  postId: string
  teacherId: string
  featured: boolean
  comment?: string | null
}) {
  const admin = createAdminClient()

  const trimmedComment = typeof comment === 'string' ? comment.trim() : null
  const now = new Date().toISOString()

  const { error } = await admin
    .from('worksheet_posts')
    .update({
      is_featured: featured,
      featured_by: featured ? teacherId : null,
      featured_at: featured ? now : null,
      featured_comment: featured ? trimmedComment : null,
      featured_commented_at: featured ? now : null,
    })
    .eq('id', postId)
    .eq('is_deleted', false)

  if (error) {
    console.error('[worksheet] failed to toggle featured state', error)
    return { success: false as const, error: '추천 상태를 변경하지 못했습니다.' }
  }

  return { success: true as const }
}

export async function deleteWorksheetPost({
  postId,
  teacherId,
}: {
  postId: string
  teacherId: string
}) {
  const admin = createAdminClient()

  const { error } = await admin
    .from('worksheet_posts')
    .update({
      is_deleted: true,
      deleted_by: teacherId,
      deleted_at: new Date().toISOString(),
      is_featured: false,
      featured_by: null,
      featured_at: null,
      featured_comment: null,
      featured_commented_at: null,
    })
    .eq('id', postId)

  if (error) {
    console.error('[worksheet] failed to delete post', error)
    return { success: false as const, error: '게시물을 삭제하지 못했습니다.' }
  }

  return { success: true as const }
}

export interface WorksheetPhoto {
  id: string
  mediaAssetId: string
  filename: string
  url: string
}

export interface WorksheetPostListItem {
  id: string
  studentTaskId: string
  studentId: string
  studentName: string
  classId: string | null
  className: string | null
  assignmentId: string | null
  workbookId: string | null
  workbookTitle: string | null
  weekLabel: string | null
  submittedAt: string
  isFeatured: boolean
  featuredBy: string | null
  featuredAt: string | null
  featuredComment: string | null
  featuredCommentedAt: string | null
  hiddenByStudent: boolean
  mediaAssetId: string
  photos: WorksheetPhoto[]
}

export interface WorksheetFilters {
  weekLabels: string[]
  classes: Array<{ id: string; name: string }>
  includesUnassignedClass: boolean
  hasWeeklessWeekLabel: boolean
}

export interface FetchWorksheetOptions {
  viewerId: string
  viewerRole: UserRole
  page?: number
  perPage?: number
  weekLabel?: string | null
  classId?: string | null
  featuredOnly?: boolean
  studentName?: string | null
}

export interface WorksheetListResult {
  items: WorksheetPostListItem[]
  totalCount: number
  totalPages: number
  page: number
  perPage: number
  filters: WorksheetFilters
}

const EMPTY_FILTERS: WorksheetFilters = {
  weekLabels: [],
  classes: [],
  includesUnassignedClass: false,
  hasWeeklessWeekLabel: false,
}

export async function fetchWorksheetPosts({
  viewerId,
  viewerRole,
  page = 1,
  perPage = 30,
  weekLabel,
  classId,
  featuredOnly,
  studentName,
}: FetchWorksheetOptions): Promise<WorksheetListResult> {
  const admin = createAdminClient()

  const safePerPage = Math.min(Math.max(perPage, 1), 100)
  const safePage = Math.max(page, 1)
  const from = (safePage - 1) * safePerPage
  const to = from + safePerPage - 1

  const trimmedStudentName =
    typeof studentName === 'string' && studentName.trim().length > 0 ? studentName.trim() : null

  const columns = `id,
       student_task_id,
       student_id,
       class_id,
       assignment_id,
       workbook_id,
       media_asset_id,
       submitted_at,
       is_featured,
       featured_by,
       featured_at,
       featured_comment,
       featured_commented_at,
       hidden_by_student,
       hidden_at,`

  // 임베드 컬럼으로 필터링할 때 부모 행까지 걸러내려면 !inner가 필요하다.
  const hasWeekLabelFilter = typeof weekLabel === 'string' && weekLabel.length > 0
  const profileEmbed = `profiles:profiles!worksheet_posts_student_id_fkey${trimmedStudentName ? '!inner' : ''}(id, name)`
  const workbookEmbed = `workbooks:workbooks!worksheet_posts_workbook_id_fkey${
    hasWeekLabelFilter ? '!inner' : ''
  }(id, title, subject, week_label)`

  const select = `${columns}
       ${profileEmbed},
       classes:classes!worksheet_posts_class_id_fkey(id, name),
       ${workbookEmbed},
       worksheet_post_assets(id, order_index, media_asset_id)`

  let query = admin
    .from('worksheet_posts')
    .select(select, { count: 'exact' })
    .eq('is_deleted', false)
    .not('media_asset_id', 'is', null)
    .order('submitted_at', { ascending: false })
    .range(from, to)

  if (featuredOnly) {
    query = query.eq('is_featured', true)
  }

  if (classId) {
    query = query.eq('class_id', classId)
  } else if (classId === '') {
    query = query.is('class_id', null)
  }

  if (typeof weekLabel === 'string' && weekLabel.length > 0) {
    query = query.eq('workbooks.week_label', weekLabel)
  } else if (weekLabel === '') {
    query = query.is('workbooks.week_label', null)
  }

  if (viewerRole === 'student') {
    query = query.or(`hidden_by_student.eq.false,student_id.eq.${viewerId}`)
  }

  if (trimmedStudentName) {
    query = query.ilike('profiles.name', `%${escapeIlikePattern(trimmedStudentName)}%`)
  }

  const [queryResult, filtersResult] = await Promise.all([query, loadWorksheetFilters(admin)])

  const { data, error, count } = queryResult

  if (error) {
    console.error('[worksheet] failed to fetch posts', error)
    return {
      items: [],
      totalCount: 0,
      totalPages: 0,
      page: safePage,
      perPage: safePerPage,
      filters: EMPTY_FILTERS,
    }
  }

  const rows = (data ?? []) as unknown as Array<Record<string, unknown>>

  const mediaAssetIdSet = new Set<string>()

  for (const row of rows) {
    if (typeof row.media_asset_id === 'string') {
      mediaAssetIdSet.add(row.media_asset_id)
    }

    const attachmentRows = Array.isArray(row.worksheet_post_assets) ? row.worksheet_post_assets : []
    for (const attachment of attachmentRows) {
      const mediaId = (attachment as { media_asset_id?: unknown })?.media_asset_id
      if (typeof mediaId === 'string') {
        mediaAssetIdSet.add(mediaId)
      }
    }
  }

  const assetLookup = await loadMediaAssetLookup(admin, Array.from(mediaAssetIdSet))

  const items = rows
    .map((row) => mapRowToListItem(row, assetLookup))
    .filter((item): item is WorksheetPostListItem => Boolean(item))

  const totalCount = count ?? rows.length
  const totalPages = totalCount === 0 ? 0 : Math.ceil(totalCount / safePerPage)

  return {
    items,
    totalCount,
    totalPages,
    page: safePage,
    perPage: safePerPage,
    filters: filtersResult,
  }
}

interface MediaAssetInfo {
  filename: string
  url: string
}

export async function loadMediaAssetLookup(
  admin: AdminClient,
  mediaAssetIds: string[]
): Promise<Map<string, MediaAssetInfo>> {
  const lookup = new Map<string, MediaAssetInfo>()

  if (mediaAssetIds.length === 0) {
    return lookup
  }

  const { data, error } = await admin
    .from('media_assets')
    .select('id, bucket, path, metadata')
    .in('id', mediaAssetIds)

  if (error) {
    console.error('[worksheet] failed to load media assets', error)
    return lookup
  }

  for (const asset of data ?? []) {
    if (typeof asset?.id !== 'string' || typeof asset.path !== 'string') {
      continue
    }

    const metadata = (asset.metadata as JsonRecord | null) ?? null
    const possibleName =
      metadata?.originalName || metadata?.original_name || metadata?.filename || metadata?.name
    const fallbackName = asset.path.split('/').pop() ?? '제출 사진'
    const bucket = typeof asset.bucket === 'string' && asset.bucket.length > 0 ? asset.bucket : SUBMISSIONS_BUCKET

    lookup.set(asset.id, {
      filename: typeof possibleName === 'string' && possibleName.length > 0 ? possibleName : fallbackName,
      url: `/api/storage/${bucket}/${asset.path}`,
    })
  }

  return lookup
}

export function mapRowToListItem(
  row: Record<string, unknown>,
  assetLookup: Map<string, MediaAssetInfo>
): WorksheetPostListItem | null {
  const id = typeof row.id === 'string' ? row.id : null
  const studentTaskId = typeof row.student_task_id === 'string' ? row.student_task_id : null
  const studentId = typeof row.student_id === 'string' ? row.student_id : null
  const mediaAssetId = typeof row.media_asset_id === 'string' ? row.media_asset_id : null

  if (!id || !studentTaskId || !studentId || !mediaAssetId) {
    return null
  }

  const profileRelation = pickFirstRelation<{ id: string; name: string | null }>(row.profiles)
  const classRelation = pickFirstRelation<{ id: string; name: string | null }>(row.classes)
  const workbookRelation = pickFirstRelation<{
    id: string
    title: string | null
    subject: string | null
    week_label: string | null
  }>(row.workbooks)

  const rawAttachments = Array.isArray(row.worksheet_post_assets) ? row.worksheet_post_assets : []

  let photos = rawAttachments
    .map((attachment, index) => {
      if (!attachment || typeof attachment !== 'object') {
        return null
      }

      const attachmentId = (attachment as { id?: unknown }).id
      const attachmentMediaId = (attachment as { media_asset_id?: unknown }).media_asset_id
      const orderIndexRaw = (attachment as { order_index?: unknown }).order_index

      if (typeof attachmentId !== 'string' || typeof attachmentMediaId !== 'string') {
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
        order: typeof orderIndexRaw === 'number' ? orderIndexRaw : index,
      }
    })
    .filter((photo): photo is WorksheetPhoto & { order: number } => Boolean(photo))
    .sort((a, b) => a.order - b.order)

  if (photos.length === 0) {
    const info = assetLookup.get(mediaAssetId)

    if (!info) {
      return null
    }

    photos = [
      {
        id: `${id}-primary`,
        mediaAssetId,
        filename: info.filename,
        url: info.url,
        order: 0,
      },
    ]
  }

  const featuredCommentRaw = typeof row.featured_comment === 'string' ? row.featured_comment : null

  return {
    id,
    studentTaskId,
    studentId,
    studentName: (profileRelation?.name ?? '이름 미확인').trim() || '이름 미입력',
    classId: typeof row.class_id === 'string' ? row.class_id : null,
    className: classRelation?.name ?? null,
    assignmentId: typeof row.assignment_id === 'string' ? row.assignment_id : null,
    workbookId: typeof row.workbook_id === 'string' ? row.workbook_id : null,
    workbookTitle: workbookRelation?.title ?? null,
    weekLabel: workbookRelation?.week_label ?? null,
    submittedAt: typeof row.submitted_at === 'string' ? row.submitted_at : new Date().toISOString(),
    isFeatured: Boolean(row.is_featured),
    featuredBy: typeof row.featured_by === 'string' ? row.featured_by : null,
    featuredAt: typeof row.featured_at === 'string' ? row.featured_at : null,
    featuredComment: featuredCommentRaw && featuredCommentRaw.trim().length > 0 ? featuredCommentRaw.trim() : null,
    featuredCommentedAt: typeof row.featured_commented_at === 'string' ? row.featured_commented_at : null,
    hiddenByStudent: Boolean(row.hidden_by_student),
    mediaAssetId,
    photos: photos.map((photo) => ({
      id: photo.id,
      mediaAssetId: photo.mediaAssetId,
      filename: photo.filename,
      url: photo.url,
    })),
  }
}

async function loadWorksheetFilters(admin: AdminClient): Promise<WorksheetFilters> {
  const [workbookResult, classesResult, unassignedCheck] = await Promise.all([
    admin
      .from('worksheet_posts')
      .select('workbook_id')
      .eq('is_deleted', false)
      .not('workbook_id', 'is', null)
      .limit(10000),
    admin.from('classes').select('id, name'),
    admin
      .from('worksheet_posts')
      .select('id', { count: 'exact', head: true })
      .eq('is_deleted', false)
      .is('class_id', null),
  ])

  if (workbookResult.error) {
    console.error('[worksheet] failed to load workbook ids for filters', workbookResult.error)
  }

  const workbookIds = Array.from(
    new Set(
      (workbookResult.data ?? [])
        .map((row) => (row?.workbook_id as string | null) ?? null)
        .filter((value): value is string => Boolean(value))
    )
  )

  let weekLabels: string[] = []
  let hasWeekless = false

  if (workbookIds.length > 0) {
    const { data: workbookRows, error: workbookError } = await admin
      .from('workbooks')
      .select('id, week_label')
      .in('id', workbookIds)

    if (workbookError) {
      console.error('[worksheet] failed to load workbook week labels', workbookError)
    } else {
      const labelSet = new Set<string>()

      for (const row of workbookRows ?? []) {
        const label = (row?.week_label as string | null) ?? null

        if (typeof label === 'string' && label.trim().length > 0) {
          labelSet.add(label.trim())
        } else {
          hasWeekless = true
        }
      }

      weekLabels = Array.from(labelSet).sort((a, b) => a.localeCompare(b, 'ko'))
    }
  }

  let classes: Array<{ id: string; name: string }> = []

  if (classesResult.error) {
    console.error('[worksheet] failed to load class names for filters', classesResult.error)
  } else {
    classes = (classesResult.data ?? [])
      .map((row) => ({
        id: row.id as string,
        name: ((row.name as string | null) ?? '이름 미지정').trim() || '이름 미지정',
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  }

  return {
    weekLabels,
    classes,
    includesUnassignedClass: (unassignedCheck.count ?? 0) > 0,
    hasWeeklessWeekLabel: hasWeekless,
  }
}

export function pickFirstRelation<T extends Record<string, unknown>>(value: unknown): T | null {
  if (!value) {
    return null
  }

  if (Array.isArray(value)) {
    const first = value[0]
    return typeof first === 'object' && first !== null ? (first as T) : null
  }

  return typeof value === 'object' && value !== null ? (value as T) : null
}

function escapeIlikePattern(value: string): string {
  return value.replace(/[%_\\]/g, (match) => `\\${match}`)
}
