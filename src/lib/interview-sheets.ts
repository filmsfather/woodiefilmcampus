import { randomUUID } from 'node:crypto'

import { createAdminClient } from '@/lib/supabase/admin'
import { INTERVIEW_ASSETS_BUCKET } from '@/lib/storage/buckets'
import { sanitizeStorageFileName } from '@/lib/storage-upload'
import type { AddInterviewSheetItemAssetInput } from '@/lib/validation/interview-sheet'
import type {
  InterviewSheetDetail,
  InterviewSheetItem,
  InterviewSheetItemAsset,
  InterviewSheetItemSource,
  InterviewSheetOverview,
  InterviewSheetStudentRow,
  InterviewSheetTemplateDetail,
  InterviewSheetTemplateSummary,
} from '@/types/interview-sheet'

const SIGNED_URL_TTL_SECONDS = 60 * 60

type AssetRow = {
  id: string
  bucket: string | null
  path: string | null
}

async function createSignedUrlMap(assetRows: AssetRow[]): Promise<Map<string, string>> {
  const admin = createAdminClient()
  const map = new Map<string, string>()

  const byBucket = new Map<string, AssetRow[]>()
  for (const row of assetRows) {
    if (!row.bucket || !row.path) continue
    const list = byBucket.get(row.bucket) ?? []
    list.push(row)
    byBucket.set(row.bucket, list)
  }

  for (const [bucket, rows] of byBucket) {
    const paths = rows.map((row) => row.path as string)
    const { data, error } = await admin.storage.from(bucket).createSignedUrls(paths, SIGNED_URL_TTL_SECONDS)
    if (error) {
      console.error('[interview-sheets] failed to create signed urls', error)
      continue
    }
    data?.forEach((entry, index) => {
      const row = rows[index]
      if (entry?.signedUrl && row) {
        map.set(row.id, entry.signedUrl)
      }
    })
  }

  return map
}

// 템플릿 ---------------------------------------------------------------------------

export async function fetchInterviewSheetTemplates(): Promise<InterviewSheetTemplateSummary[]> {
  const admin = createAdminClient()

  type Row = {
    id: string
    title: string
    description: string | null
    is_default: boolean
    created_at: string
    profiles: { name: string | null; email: string | null } | { name: string | null; email: string | null }[] | null
    interview_sheet_template_items: Array<{ id: string }> | null
  }

  const { data, error } = await admin
    .from('interview_sheet_templates')
    .select(
      `id, title, description, is_default, created_at,
       profiles:profiles!interview_sheet_templates_created_by_fkey(name, email),
       interview_sheet_template_items(id)`
    )
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[interview-sheets] failed to fetch templates', error)
    return []
  }

  return ((data ?? []) as unknown as Row[]).map((row) => {
    const creator = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      isDefault: row.is_default,
      itemCount: row.interview_sheet_template_items?.length ?? 0,
      createdAt: row.created_at,
      createdByName: creator?.name ?? creator?.email ?? null,
    }
  })
}

export async function fetchInterviewSheetTemplateDetail(
  templateId: string
): Promise<InterviewSheetTemplateDetail | null> {
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('interview_sheet_templates')
    .select('id, title, description, is_default')
    .eq('id', templateId)
    .maybeSingle()

  if (error || !data) {
    if (error) console.error('[interview-sheets] failed to fetch template', error)
    return null
  }

  const { data: itemRows, error: itemError } = await admin
    .from('interview_sheet_template_items')
    .select('id, order_index, prompt')
    .eq('template_id', templateId)
    .order('order_index', { ascending: true })

  if (itemError) {
    console.error('[interview-sheets] failed to fetch template items', itemError)
    return null
  }

  return {
    id: data.id as string,
    title: data.title as string,
    description: (data.description as string | null) ?? null,
    isDefault: Boolean(data.is_default),
    items: (itemRows ?? []).map((row) => ({
      id: row.id as string,
      orderIndex: row.order_index as number,
      prompt: row.prompt as string,
    })),
  }
}

// 면접지 생성/적용 --------------------------------------------------------------------

/**
 * 템플릿 문항을 면접지에 복사한다. 이미 복사된 문항(template_item_id 기준)은 건너뛴다.
 * @returns 추가된 문항 수
 */
export async function applyTemplateItemsToSheet(sheetId: string, templateId: string): Promise<number> {
  const admin = createAdminClient()

  const { data: templateItems, error: templateError } = await admin
    .from('interview_sheet_template_items')
    .select('id, order_index, prompt')
    .eq('template_id', templateId)
    .order('order_index', { ascending: true })

  if (templateError) {
    console.error('[interview-sheets] failed to load template items for apply', templateError)
    throw new Error('템플릿 문항을 불러오지 못했습니다.')
  }

  if (!templateItems || templateItems.length === 0) {
    return 0
  }

  const { data: existingRows, error: existingError } = await admin
    .from('interview_sheet_items')
    .select('template_item_id, order_index')
    .eq('sheet_id', sheetId)

  if (existingError) {
    console.error('[interview-sheets] failed to load existing items', existingError)
    throw new Error('면접지 문항을 불러오지 못했습니다.')
  }

  const existingTemplateItemIds = new Set(
    (existingRows ?? [])
      .map((row) => row.template_item_id as string | null)
      .filter((id): id is string => Boolean(id))
  )
  const maxOrderIndex = (existingRows ?? []).reduce(
    (max, row) => Math.max(max, (row.order_index as number) ?? 0),
    -1
  )

  const newItems = templateItems
    .filter((item) => !existingTemplateItemIds.has(item.id as string))
    .map((item, index) => ({
      sheet_id: sheetId,
      order_index: maxOrderIndex + 1 + index,
      prompt: item.prompt as string,
      source: 'template' as const,
      template_item_id: item.id as string,
    }))

  if (newItems.length === 0) {
    return 0
  }

  const { error: insertError } = await admin.from('interview_sheet_items').insert(newItems)

  if (insertError) {
    console.error('[interview-sheets] failed to copy template items', insertError)
    throw new Error('템플릿 문항 복사에 실패했습니다.')
  }

  return newItems.length
}

/**
 * 학생의 면접지를 조회하고, 없으면 생성한다.
 * 최초 생성 시 기본(is_default) 템플릿 문항을 복사한다.
 */
export async function getOrCreateInterviewSheet(studentId: string): Promise<string | null> {
  const admin = createAdminClient()

  const { data: existing, error: fetchError } = await admin
    .from('interview_sheets')
    .select('id')
    .eq('student_id', studentId)
    .maybeSingle()

  if (fetchError) {
    console.error('[interview-sheets] failed to fetch sheet', fetchError)
    return null
  }

  if (existing?.id) {
    return existing.id as string
  }

  const { data: inserted, error: insertError } = await admin
    .from('interview_sheets')
    .insert({ student_id: studentId })
    .select('id')
    .maybeSingle()

  if (insertError) {
    // 동시 생성으로 unique 충돌이 나면 기존 행을 다시 조회
    const { data: retry } = await admin
      .from('interview_sheets')
      .select('id')
      .eq('student_id', studentId)
      .maybeSingle()

    if (retry?.id) {
      return retry.id as string
    }

    console.error('[interview-sheets] failed to create sheet', insertError)
    return null
  }

  const sheetId = inserted?.id as string | undefined
  if (!sheetId) {
    return null
  }

  const { data: defaultTemplate } = await admin
    .from('interview_sheet_templates')
    .select('id')
    .eq('is_default', true)
    .maybeSingle()

  if (defaultTemplate?.id) {
    try {
      await applyTemplateItemsToSheet(sheetId, defaultTemplate.id as string)
    } catch (err) {
      console.error('[interview-sheets] failed to apply default template', err)
    }
  }

  return sheetId
}

// 면접지 상세 ------------------------------------------------------------------------

type RawItemAssetRow = {
  id: string
  item_id: string
  order_index: number
  kind: string
  external_url: string | null
  title: string | null
  created_by: string | null
  media_assets:
    | { id: string; bucket: string | null; path: string | null; mime_type: string | null }
    | { id: string; bucket: string | null; path: string | null; mime_type: string | null }[]
    | null
}

export async function fetchInterviewSheetDetail(studentId: string): Promise<InterviewSheetDetail | null> {
  const admin = createAdminClient()

  const { data: sheetRow, error: sheetError } = await admin
    .from('interview_sheets')
    .select('id, student_id, updated_at, profiles:profiles!interview_sheets_student_id_fkey(name, email)')
    .eq('student_id', studentId)
    .maybeSingle()

  if (sheetError || !sheetRow) {
    if (sheetError) console.error('[interview-sheets] failed to fetch sheet detail', sheetError)
    return null
  }

  const studentProfile = Array.isArray(sheetRow.profiles) ? sheetRow.profiles[0] : sheetRow.profiles

  const { data: itemRows, error: itemError } = await admin
    .from('interview_sheet_items')
    .select(
      `id, order_index, prompt, answer, source, created_by, answered_at,
       teacher_feedback, feedback_at,
       feedback_profile:profiles!interview_sheet_items_feedback_by_fkey(name, email)`
    )
    .eq('sheet_id', sheetRow.id as string)
    .order('order_index', { ascending: true })

  if (itemError) {
    console.error('[interview-sheets] failed to fetch sheet items', itemError)
    return null
  }

  const items = itemRows ?? []
  const itemIds = items.map((row) => row.id as string)

  let assetRows: RawItemAssetRow[] = []
  if (itemIds.length > 0) {
    const { data, error } = await admin
      .from('interview_sheet_item_assets')
      .select(
        'id, item_id, order_index, kind, external_url, title, created_by, media_assets(id, bucket, path, mime_type)'
      )
      .in('item_id', itemIds)
      .order('order_index', { ascending: true })

    if (error) {
      console.error('[interview-sheets] failed to fetch item assets', error)
    }
    assetRows = (data ?? []) as unknown as RawItemAssetRow[]
  }

  const mediaRows: AssetRow[] = assetRows.map((row) => {
    const media = Array.isArray(row.media_assets) ? row.media_assets[0] : row.media_assets
    return { id: row.id, bucket: media?.bucket ?? null, path: media?.path ?? null }
  })
  const urlMap = await createSignedUrlMap(mediaRows)

  const assetsByItem = new Map<string, InterviewSheetItemAsset[]>()
  for (const row of assetRows) {
    const media = Array.isArray(row.media_assets) ? row.media_assets[0] : row.media_assets
    const list = assetsByItem.get(row.item_id) ?? []
    list.push({
      id: row.id,
      kind: row.kind === 'file' ? 'file' : 'link',
      orderIndex: row.order_index,
      url: urlMap.get(row.id) ?? null,
      mimeType: media?.mime_type ?? null,
      externalUrl: row.external_url,
      title: row.title,
      createdBy: row.created_by,
    })
    assetsByItem.set(row.item_id, list)
  }

  const mappedItems: InterviewSheetItem[] = items.map((row) => {
    const feedbackProfile = Array.isArray(row.feedback_profile) ? row.feedback_profile[0] : row.feedback_profile
    return {
      id: row.id as string,
      orderIndex: row.order_index as number,
      prompt: row.prompt as string,
      answer: (row.answer as string | null) ?? null,
      source: row.source as InterviewSheetItemSource,
      createdBy: (row.created_by as string | null) ?? null,
      answeredAt: (row.answered_at as string | null) ?? null,
      teacherFeedback: (row.teacher_feedback as string | null) ?? null,
      feedbackAt: (row.feedback_at as string | null) ?? null,
      feedbackByName: feedbackProfile?.name ?? feedbackProfile?.email ?? null,
      assets: assetsByItem.get(row.id as string) ?? [],
    }
  })

  return {
    id: sheetRow.id as string,
    studentId: sheetRow.student_id as string,
    studentName: studentProfile?.name ?? studentProfile?.email ?? '이름 없음',
    updatedAt: sheetRow.updated_at as string,
    items: mappedItems,
  }
}

// 첨부 -------------------------------------------------------------------------------

const ALLOWED_ATTACHMENT_MIME_PREFIXES = ['image/']
const ALLOWED_ATTACHMENT_MIME_TYPES = ['application/pdf']

export function isAllowedAttachmentMimeType(mimeType: string): boolean {
  return (
    ALLOWED_ATTACHMENT_MIME_PREFIXES.some((prefix) => mimeType.startsWith(prefix)) ||
    ALLOWED_ATTACHMENT_MIME_TYPES.includes(mimeType)
  )
}

/**
 * 면접지 항목에 파일(이미지/PDF) 또는 링크를 첨부한다.
 * 파일은 pending 경로에서 정식 경로로 이동하고 media_assets에 등록한다.
 */
export async function attachAssetToInterviewSheetItem(params: {
  itemId: string
  sheetId: string
  ownerId: string
  asset: AddInterviewSheetItemAssetInput['asset']
}): Promise<void> {
  const { itemId, sheetId, ownerId, asset } = params
  const admin = createAdminClient()

  const { data: lastAsset } = await admin
    .from('interview_sheet_item_assets')
    .select('order_index')
    .eq('item_id', itemId)
    .order('order_index', { ascending: false })
    .limit(1)
    .maybeSingle()

  const nextOrderIndex = ((lastAsset?.order_index as number | null) ?? -1) + 1

  if (asset.kind === 'link') {
    const { error } = await admin.from('interview_sheet_item_assets').insert({
      item_id: itemId,
      order_index: nextOrderIndex,
      kind: 'link',
      external_url: asset.url,
      title: asset.title || null,
      created_by: ownerId,
    })

    if (error) {
      console.error('[interview-sheets] failed to insert link asset', error)
      throw new Error('링크 첨부에 실패했습니다.')
    }
    return
  }

  const file = asset.file

  if (file.bucket !== INTERVIEW_ASSETS_BUCKET) {
    throw new Error('허용되지 않은 저장소 경로가 감지되었습니다.')
  }

  if (!isAllowedAttachmentMimeType(file.mimeType)) {
    throw new Error('이미지 또는 PDF 파일만 첨부할 수 있습니다.')
  }

  const finalPath = `sheets/${sheetId}/items/${itemId}/${randomUUID()}-${sanitizeStorageFileName(file.originalName)}`

  if (file.path !== finalPath) {
    const { error: moveError } = await admin.storage.from(INTERVIEW_ASSETS_BUCKET).move(file.path, finalPath)
    if (moveError) {
      console.error('[interview-sheets] failed to move attachment', moveError)
      throw new Error('첨부 파일을 저장하지 못했습니다.')
    }
  }

  const { data: mediaAsset, error: mediaError } = await admin
    .from('media_assets')
    .insert({
      owner_id: ownerId,
      scope: 'interview_sheet',
      bucket: INTERVIEW_ASSETS_BUCKET,
      path: finalPath,
      mime_type: file.mimeType,
      size: file.size,
      metadata: { originalName: sanitizeStorageFileName(file.originalName) },
    })
    .select('id')
    .single()

  if (mediaError || !mediaAsset?.id) {
    console.error('[interview-sheets] failed to insert attachment media asset', mediaError)
    throw new Error('첨부 파일 정보를 저장하지 못했습니다.')
  }

  const { error: linkError } = await admin.from('interview_sheet_item_assets').insert({
    item_id: itemId,
    order_index: nextOrderIndex,
    kind: 'file',
    media_asset_id: mediaAsset.id as string,
    created_by: ownerId,
  })

  if (linkError) {
    console.error('[interview-sheets] failed to link attachment', linkError)
    throw new Error('첨부 연결에 실패했습니다.')
  }
}

/** 면접지 항목의 다음 order_index를 계산한다. */
export async function nextItemOrderIndex(sheetId: string): Promise<number> {
  const admin = createAdminClient()

  const { data: lastItem } = await admin
    .from('interview_sheet_items')
    .select('order_index')
    .eq('sheet_id', sheetId)
    .order('order_index', { ascending: false })
    .limit(1)
    .maybeSingle()

  return ((lastItem?.order_index as number | null) ?? -1) + 1
}

// 면접지 요약 (다른 화면에 곁들여 표시) -------------------------------------------------

/** 여러 학생의 면접지 문항/답변 요약을 한 번에 조회한다. 면접지가 없는 학생은 결과에 없다. */
export async function fetchInterviewSheetOverviews(
  studentIds: string[]
): Promise<Record<string, InterviewSheetOverview>> {
  const result: Record<string, InterviewSheetOverview> = {}
  if (studentIds.length === 0) {
    return result
  }

  const admin = createAdminClient()

  type Row = {
    id: string
    student_id: string
    interview_sheet_items: Array<{
      id: string
      order_index: number
      prompt: string
      answer: string | null
      source: string
    }> | null
  }

  const { data, error } = await admin
    .from('interview_sheets')
    .select('id, student_id, interview_sheet_items(id, order_index, prompt, answer, source)')
    .in('student_id', studentIds)

  if (error) {
    console.error('[interview-sheets] failed to fetch sheet overviews', error)
    return result
  }

  for (const row of (data ?? []) as unknown as Row[]) {
    result[row.student_id] = {
      sheetId: row.id,
      items: (row.interview_sheet_items ?? [])
        .slice()
        .sort((a, b) => a.order_index - b.order_index)
        .map((item) => ({
          id: item.id,
          orderIndex: item.order_index,
          prompt: item.prompt,
          answer: item.answer,
          source: item.source as InterviewSheetItemSource,
        })),
    }
  }

  return result
}

// 교사용 학생 목록 --------------------------------------------------------------------

export async function fetchInterviewSheetStudentRows(
  viewerId: string,
  role: string
): Promise<InterviewSheetStudentRow[]> {
  const admin = createAdminClient()

  let classIds: string[] | null = null

  if (role === 'teacher') {
    const { data: teacherClassRows, error: teacherClassError } = await admin
      .from('class_teachers')
      .select('class_id')
      .eq('teacher_id', viewerId)

    if (teacherClassError) {
      console.error('[interview-sheets] failed to fetch teacher classes', teacherClassError)
      return []
    }

    classIds = Array.from(
      new Set((teacherClassRows ?? []).map((row) => row.class_id).filter((id): id is string => Boolean(id)))
    )

    if (classIds.length === 0) {
      return []
    }
  }

  type ClassRow = {
    id: string
    name: string | null
    class_students: Array<{
      student_id: string
      profiles:
        | { id: string; name: string | null; email: string | null }
        | { id: string; name: string | null; email: string | null }[]
        | null
    }> | null
  }

  let query = admin
    .from('classes')
    .select('id, name, class_students(student_id, profiles:profiles!class_students_student_id_fkey(id, name, email))')
    .order('name', { ascending: true })

  if (classIds) {
    query = query.in('id', classIds)
  }

  const { data: classRows, error: classError } = await query

  if (classError) {
    console.error('[interview-sheets] failed to fetch classes', classError)
    return []
  }

  const studentMap = new Map<string, { name: string; classes: Array<{ id: string; name: string }> }>()

  for (const classRow of (classRows ?? []) as unknown as ClassRow[]) {
    const classInfo = { id: classRow.id, name: classRow.name ?? '이름 없는 반' }
    for (const member of classRow.class_students ?? []) {
      const profile = Array.isArray(member.profiles) ? member.profiles[0] : member.profiles
      const entry = studentMap.get(member.student_id)
      if (entry) {
        entry.classes.push(classInfo)
      } else {
        studentMap.set(member.student_id, {
          name: profile?.name ?? profile?.email ?? '이름 없음',
          classes: [classInfo],
        })
      }
    }
  }

  const studentIds = Array.from(studentMap.keys())
  if (studentIds.length === 0) {
    return []
  }

  type SheetRow = {
    id: string
    student_id: string
    updated_at: string
    interview_sheet_items: Array<{ id: string; answer: string | null }> | null
  }

  const { data: sheetRows, error: sheetError } = await admin
    .from('interview_sheets')
    .select('id, student_id, updated_at, interview_sheet_items(id, answer)')
    .in('student_id', studentIds)

  if (sheetError) {
    console.error('[interview-sheets] failed to fetch sheets for list', sheetError)
  }

  const sheetByStudent = new Map<string, SheetRow>()
  for (const row of (sheetRows ?? []) as unknown as SheetRow[]) {
    sheetByStudent.set(row.student_id, row)
  }

  return studentIds
    .map((studentId) => {
      const info = studentMap.get(studentId)!
      const sheet = sheetByStudent.get(studentId)
      const sheetItems = sheet?.interview_sheet_items ?? []
      return {
        studentId,
        studentName: info.name,
        classes: info.classes,
        sheetId: sheet?.id ?? null,
        itemCount: sheetItems.length,
        answeredCount: sheetItems.filter((item) => Boolean(item.answer?.trim())).length,
        updatedAt: sheet?.updated_at ?? null,
      }
    })
    .sort((a, b) => a.studentName.localeCompare(b.studentName, 'ko'))
}
