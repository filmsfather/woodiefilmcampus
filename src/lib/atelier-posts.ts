import { createAdminClient } from '@/lib/supabase/admin'
import type { UserRole } from '@/types/user'

interface SyncPostArgs {
  studentTaskId: string
  studentId: string
  taskSubmissionId: string
  mediaAssetId: string
  submittedAt?: string
}

type SubmissionAttachmentOrder = {
  mediaAssetId: string
  order: number
}

async function fetchSubmissionAttachmentOrder(
  admin: ReturnType<typeof createAdminClient>,
  submissionId: string,
  fallbackMediaAssetId: string | null
): Promise<SubmissionAttachmentOrder[]> {
  const { data, error } = await admin
    .from('task_submission_assets')
    .select('media_asset_id, order_index')
    .eq('submission_id', submissionId)
    .order('order_index', { ascending: true })

  if (error) {
    console.error('[atelier] failed to load submission assets', error)
  }

  const attachments = (data ?? [])
    .map((row, index) => {
      const mediaAssetId = typeof row.media_asset_id === 'string' ? row.media_asset_id : null
      if (!mediaAssetId) {
        return null
      }
      const order = typeof row.order_index === 'number' ? row.order_index : index
      return { mediaAssetId, order }
    })
    .filter((row): row is SubmissionAttachmentOrder => Boolean(row))
    .sort((a, b) => a.order - b.order)

  if (attachments.length === 0 && fallbackMediaAssetId) {
    return [{ mediaAssetId: fallbackMediaAssetId, order: 0 }]
  }

  return attachments
}

async function replaceAtelierPostAssets(
  admin: ReturnType<typeof createAdminClient>,
  params: { postId: string; studentId: string; attachments: SubmissionAttachmentOrder[] }
) {
  const { postId, studentId, attachments } = params

  await admin.from('atelier_post_assets').delete().eq('post_id', postId)

  if (attachments.length === 0) {
    return
  }

  const payload = attachments.map((attachment, index) => ({
    post_id: postId,
    media_asset_id: attachment.mediaAssetId,
    order_index: index,
    created_by: studentId,
  }))

  const { error } = await admin.from('atelier_post_assets').insert(payload)

  if (error) {
    console.error('[atelier] failed to sync post assets', error)
  }
}

export async function syncAtelierPostForPdfSubmission({
  studentTaskId,
  studentId,
  taskSubmissionId,
  mediaAssetId,
  submittedAt,
}: SyncPostArgs) {
  const admin = createAdminClient()

  const { data: taskRow, error: taskError } = await admin
    .from('student_tasks')
    .select('id, assignment_id, class_id')
    .eq('id', studentTaskId)
    .maybeSingle()

  if (taskError) {
    console.error('[atelier] failed to load student_task', taskError)
    return
  }

  if (!taskRow) {
    console.warn('[atelier] student_task not found for submission sync', studentTaskId)
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
      console.error('[atelier] failed to load assignment for post sync', assignmentError)
    } else {
      workbookId = (assignmentRow?.workbook_id as string | null) ?? null
    }
  }

  const timestamp = submittedAt ?? new Date().toISOString()

  const attachments = await fetchSubmissionAttachmentOrder(admin, taskSubmissionId, mediaAssetId)

  if (attachments.length === 0) {
    console.warn('[atelier] submission has no attachments; skipping post sync', { taskSubmissionId })
    return
  }

  const primaryAttachmentId = attachments[0]?.mediaAssetId ?? mediaAssetId

  if (!primaryAttachmentId) {
    console.warn('[atelier] unable to determine primary attachment for submission', { taskSubmissionId })
    return
  }

  const updatePayload = {
    task_submission_id: taskSubmissionId,
    media_asset_id: primaryAttachmentId,
    assignment_id: (taskRow.assignment_id as string | null) ?? null,
    class_id: (taskRow.class_id as string | null) ?? null,
    workbook_id: workbookId,
    submitted_at: timestamp,
    hidden_by_student: false,
    hidden_at: null,
    is_deleted: false,
    deleted_at: null,
    deleted_by: null,
  }

  const { data: existingRow, error: existingError } = await admin
    .from('atelier_posts')
    .select('id')
    .eq('student_task_id', studentTaskId)
    .maybeSingle()

  if (existingError) {
    console.error('[atelier] failed to lookup existing post', existingError)
    return
  }

  let postId = existingRow?.id ?? null

  if (postId) {
    const { error: updateError } = await admin
      .from('atelier_posts')
      .update(updatePayload)
      .eq('id', postId)

    if (updateError) {
      console.error('[atelier] failed to update existing post', updateError)
      return
    }
  } else {
    const { data: insertedRow, error: insertError } = await admin
      .from('atelier_posts')
      .insert({
        student_task_id: studentTaskId,
        student_id: studentId,
        ...updatePayload,
      })
      .select('id')
      .single()

    if (insertError || !insertedRow?.id) {
      console.error('[atelier] failed to insert post', insertError)
      return
    }

    postId = insertedRow.id
  }

  if (!postId) {
    console.error('[atelier] missing post id after sync', { studentTaskId, taskSubmissionId })
    return
  }

  await replaceAtelierPostAssets(admin, { postId, studentId, attachments })
}

export async function setAtelierPostHidden({
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
    .from('atelier_posts')
    .select('id, student_id')
    .eq('id', postId)
    .maybeSingle()

  if (fetchError) {
    console.error('[atelier] failed to fetch post for hide toggle', fetchError)
    return { success: false as const, error: '게시물을 찾지 못했습니다.' }
  }

  if (!postRow || postRow.student_id !== studentId) {
    return { success: false as const, error: '본인 게시물만 숨길 수 있습니다.' }
  }

  const { error: updateError } = await admin
    .from('atelier_posts')
    .update({
      hidden_by_student: hidden,
      hidden_at: hidden ? new Date().toISOString() : null,
      is_deleted: false,
      deleted_at: null,
      deleted_by: null,
    })
    .eq('id', postId)

  if (updateError) {
    console.error('[atelier] failed to toggle hidden state', updateError)
    return { success: false as const, error: '숨김 상태를 변경하지 못했습니다.' }
  }

  return { success: true as const }
}

export async function setAtelierPostFeatured({
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
    .from('atelier_posts')
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
    console.error('[atelier] failed to toggle featured state', error)
    return { success: false as const, error: '추천 상태를 변경하지 못했습니다.' }
  }

  return { success: true as const }
}

export async function deleteAtelierPost({
  postId,
  teacherId,
}: {
  postId: string
  teacherId: string
}) {
  const admin = createAdminClient()

  const { error } = await admin
    .from('atelier_posts')
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
    console.error('[atelier] failed to delete post', error)
    return { success: false as const, error: '게시물을 삭제하지 못했습니다.' }
  }

  return { success: true as const }
}

type JsonRecord = Record<string, unknown>

export interface AtelierPostListItem {
  id: string
  studentTaskId: string
  studentId: string
  studentName: string
  classId: string | null
  className: string | null
  assignmentId: string | null
  workbookId: string | null
  workbookTitle: string | null
  workbookSubject: string | null
  weekLabel: string | null
  submittedAt: string
  isFeatured: boolean
  featuredBy: string | null
  featuredAt: string | null
  featuredComment: string | null
  featuredCommentedAt: string | null
  hiddenByStudent: boolean
  mediaAssetId: string
  attachments: Array<{
    id: string
    mediaAssetId: string
    filename: string
    url: string | null
  }>
}

export interface AtelierFilters {
  weekLabels: string[]
  classes: Array<{ id: string; name: string }>
  includesUnassignedClass: boolean
  hasWeeklessWeekLabel: boolean
}

export interface FetchAtelierOptions {
  viewerId: string
  viewerRole: UserRole
  page?: number
  perPage?: number
  weekLabel?: string | null
  classId?: string | null
  featuredOnly?: boolean
  studentName?: string | null
}

export interface AtelierListResult {
  items: AtelierPostListItem[]
  totalCount: number
  totalPages: number
  page: number
  perPage: number
  filters: AtelierFilters
}

export async function fetchAtelierPosts({
  viewerId,
  viewerRole,
  page = 1,
  perPage = 50,
  weekLabel,
  classId,
  featuredOnly,
  studentName,
}: FetchAtelierOptions): Promise<AtelierListResult> {
  const admin = createAdminClient()

  const safePerPage = Math.min(Math.max(perPage, 1), 100)
  const safePage = Math.max(page, 1)
  const from = (safePage - 1) * safePerPage
  const to = from + safePerPage - 1

  const trimmedStudentName = typeof studentName === 'string' && studentName.trim().length > 0 ? studentName.trim() : null

  const baseSelect = `id,
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
       hidden_at,
       profiles:profiles!atelier_posts_student_id_fkey(id, name),
        classes:classes!atelier_posts_class_id_fkey(id, name),
        workbooks:workbooks!atelier_posts_workbook_id_fkey(id, title, subject, week_label),
        atelier_post_assets(id, order_index, media_asset_id)
      ` as const

  const filteredSelect = `id,
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
       hidden_at,
       profiles:profiles!atelier_posts_student_id_fkey!inner(id, name),
        classes:classes!atelier_posts_class_id_fkey(id, name),
        workbooks:workbooks!atelier_posts_workbook_id_fkey(id, title, subject, week_label),
        atelier_post_assets(id, order_index, media_asset_id)
      ` as const

  const select = trimmedStudentName ? filteredSelect : baseSelect

  let query = admin
    .from('atelier_posts')
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
    const orFilter = `hidden_by_student.eq.false,student_id.eq.${viewerId}`
    query = query.or(orFilter)
  } else {
    query = query.eq('hidden_by_student', false)
  }

  if (trimmedStudentName) {
    const escapedPattern = `%${escapeIlikePattern(trimmedStudentName)}%`
    query = query.ilike('profiles.name', escapedPattern)
  }

  const { data, error, count } = await query

  if (error) {
    console.error('[atelier] failed to fetch posts', error)
    return {
      items: [],
      totalCount: 0,
      totalPages: 0,
      page: safePage,
      perPage: safePerPage,
      filters: { weekLabels: [], classes: [], includesUnassignedClass: false, hasWeeklessWeekLabel: false },
    }
  }

  const rows = (data ?? []) as Array<Record<string, unknown>>

  const mediaAssetIdSet = new Set<string>()

  for (const row of rows) {
    if (typeof row.media_asset_id === 'string') {
      mediaAssetIdSet.add(row.media_asset_id)
    }

    const attachmentRows = Array.isArray(row.atelier_post_assets) ? row.atelier_post_assets : []
    for (const attachment of attachmentRows) {
      const mediaId = typeof (attachment as { media_asset_id?: unknown })?.media_asset_id === 'string'
        ? (attachment as { media_asset_id: string }).media_asset_id
        : null
      if (mediaId) {
        mediaAssetIdSet.add(mediaId)
      }
    }
  }

  const mediaAssetIds = Array.from(mediaAssetIdSet)

  const assetLookup = new Map<string, { bucket: string | null; path: string | null; metadata: JsonRecord | null }>()

  if (mediaAssetIds.length > 0) {
    const { data: assetRows, error: assetError } = await admin
      .from('media_assets')
      .select('id, bucket, path, metadata')
      .in('id', mediaAssetIds)

    if (assetError) {
      console.error('[atelier] failed to load media assets', assetError)
    } else {
      for (const asset of assetRows ?? []) {
        if (!asset?.id) {
          continue
        }
        assetLookup.set(asset.id, {
          bucket: (asset.bucket as string | null) ?? null,
          path: (asset.path as string | null) ?? null,
          metadata: (asset.metadata as JsonRecord | null) ?? null,
        })
      }
    }
  }

  const downloadLookup = new Map<string, { url: string; filename: string }>()

  await Promise.all(
    Array.from(assetLookup.entries()).map(async ([assetId, asset]) => {
      if (!asset.path) {
        return
      }

      const bucketId = asset.bucket ?? 'submissions'
      try {
        const { data: signed, error: signedError } = await admin.storage.from(bucketId).createSignedUrl(asset.path, 60 * 30)

        if (signedError) {
          console.error('[atelier] failed to create signed url', signedError)
          return
        }

        if (signed?.signedUrl) {
          const metadata = asset.metadata ?? {}
          const possibleName = metadata.originalName || metadata.original_name || metadata.filename || metadata.name
          const filename = typeof possibleName === 'string' && possibleName.length > 0
            ? possibleName
            : asset.path.split('/').pop() ?? 'submission.pdf'
          downloadLookup.set(assetId, { url: signed.signedUrl, filename })
        }
      } catch (signedError) {
        console.error('[atelier] unexpected signed url error', signedError)
      }
    })
  )

  const items: AtelierPostListItem[] = rows
    .map((row) => {
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

      const assignmentId = typeof row.assignment_id === 'string' ? row.assignment_id : null
      const classId = typeof row.class_id === 'string' ? row.class_id : null
      const workbookId = typeof row.workbook_id === 'string' ? row.workbook_id : null
      const submittedAt = typeof row.submitted_at === 'string' ? row.submitted_at : new Date().toISOString()
      const isFeatured = typeof row.is_featured === 'boolean' ? row.is_featured : Boolean(row.is_featured)
      const featuredBy = typeof row.featured_by === 'string' ? row.featured_by : null
      const featuredAt = typeof row.featured_at === 'string' ? row.featured_at : null
      const featuredCommentRaw = typeof row.featured_comment === 'string' ? row.featured_comment : null
      const featuredComment = featuredCommentRaw && featuredCommentRaw.trim().length > 0 ? featuredCommentRaw.trim() : null
      const featuredCommentedAt = typeof row.featured_commented_at === 'string' ? row.featured_commented_at : null
      const hiddenByStudent = typeof row.hidden_by_student === 'boolean'
        ? row.hidden_by_student
        : Boolean(row.hidden_by_student)

      const rawAttachments = Array.isArray(row.atelier_post_assets) ? row.atelier_post_assets : []
      let attachments = rawAttachments
        .map((attachment, index) => {
          if (!attachment || typeof attachment !== 'object') {
            return null
          }

          const attachmentId = typeof (attachment as { id?: unknown }).id === 'string'
            ? ((attachment as { id: string }).id)
            : null
          const attachmentMediaId = typeof (attachment as { media_asset_id?: unknown }).media_asset_id === 'string'
            ? ((attachment as { media_asset_id: string }).media_asset_id)
            : null
          const orderIndex = typeof (attachment as { order_index?: unknown }).order_index === 'number'
            ? ((attachment as { order_index: number }).order_index)
            : index

          if (!attachmentId || !attachmentMediaId) {
            return null
          }

          const download = downloadLookup.get(attachmentMediaId) ?? null

          return {
            id: attachmentId,
            mediaAssetId: attachmentMediaId,
            filename: download?.filename ?? '제출 파일',
            url: download?.url ?? null,
            order: orderIndex,
          }
        })
        .filter((attachment): attachment is { id: string; mediaAssetId: string; filename: string; url: string | null; order: number } => Boolean(attachment))
        .sort((a, b) => a.order - b.order)

      if (attachments.length === 0 && mediaAssetId) {
        const fallbackDownload = downloadLookup.get(mediaAssetId) ?? null
        attachments = [
          {
            id: `${id ?? mediaAssetId}-primary`,
            mediaAssetId,
            filename: fallbackDownload?.filename ?? '제출 파일',
            url: fallbackDownload?.url ?? null,
            order: 0,
          },
        ]
      }

      const normalizedAttachments = attachments.map((attachment) => ({
        id: attachment.id,
        mediaAssetId: attachment.mediaAssetId,
        filename: attachment.filename,
        url: attachment.url,
      }))

      return {
        id,
        studentTaskId,
        studentId,
        studentName: (profileRelation?.name ?? '이름 미확인').trim() || '이름 미입력',
        classId,
        className: classRelation?.name ?? null,
        assignmentId,
        workbookId,
        workbookTitle: workbookRelation?.title ?? null,
        workbookSubject: workbookRelation?.subject ?? null,
        weekLabel: workbookRelation?.week_label ?? null,
        submittedAt,
        isFeatured,
        featuredBy,
        featuredAt,
        featuredComment,
        featuredCommentedAt,
        hiddenByStudent,
        mediaAssetId,
        attachments: normalizedAttachments,
      }
    })
    .filter((item): item is AtelierPostListItem => Boolean(item))

  const totalCount = count ?? rows.length
  const totalPages = totalCount === 0 ? 0 : Math.ceil(totalCount / safePerPage)

  const { filters, includesUnassigned, hasWeekless } = await loadAtelierFilters(admin)

  return {
    items,
    totalCount,
    totalPages,
    page: safePage,
    perPage: safePerPage,
    filters: {
      weekLabels: filters.weekLabels,
      classes: filters.classes,
      includesUnassignedClass: includesUnassigned,
      hasWeeklessWeekLabel: hasWeekless,
    },
  }
}

async function loadAtelierFilters(admin: ReturnType<typeof createAdminClient>) {
  const { data: workbookRows, error: workbookError } = await admin
    .from('atelier_posts')
    .select('workbook_id')
    .eq('is_deleted', false)

  if (workbookError) {
    console.error('[atelier] failed to load workbook ids for filters', workbookError)
  }

  const workbookIds = Array.from(
    new Set(
      (workbookRows ?? [])
        .map((row) => (row?.workbook_id as string | null) ?? null)
        .filter((value): value is string => Boolean(value))
    )
  )

  let weekLabels: string[] = []
  let hasWeekless = false

  if (workbookIds.length > 0) {
    const { data: workbooks, error } = await admin
      .from('workbooks')
      .select('id, week_label')
      .in('id', workbookIds)

    if (error) {
      console.error('[atelier] failed to load workbook week labels', error)
    } else {
      const labelSet = new Set<string>()

      for (const row of workbooks ?? []) {
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

  const { data: classRows, error: classError } = await admin
    .from('atelier_posts')
    .select('class_id')
    .eq('is_deleted', false)

  if (classError) {
    console.error('[atelier] failed to load class ids for filters', classError)
  }

  const classIdSet = new Set<string>()
  let hasUnassigned = false

  for (const row of classRows ?? []) {
    const classId = (row?.class_id as string | null) ?? null
    if (!classId) {
      hasUnassigned = true
      continue
    }
    classIdSet.add(classId)
  }

  let classes: Array<{ id: string; name: string }> = []

  if (classIdSet.size > 0) {
    const { data: classList, error } = await admin
      .from('classes')
      .select('id, name')
      .in('id', Array.from(classIdSet))

    if (error) {
      console.error('[atelier] failed to load class names for filters', error)
    } else {
      classes = (classList ?? [])
        .map((row) => ({
          id: row.id as string,
          name: ((row.name as string | null) ?? '이름 미지정').trim() || '이름 미지정',
        }))
        .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
    }
  }

  return {
    filters: {
      weekLabels,
      classes,
    },
    includesUnassigned: hasUnassigned,
    hasWeekless,
  }
}

function pickFirstRelation<T extends Record<string, unknown>>(value: unknown): T | null {
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
