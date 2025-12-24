'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'

import { getAuthContext } from '@/lib/auth'
import {
  CLASS_MATERIALS_BUCKET,
  type ClassMaterialAssetType,
  type ClassMaterialSubject,
  isClassMaterialAllowedRole,
  isClassMaterialSubject,
} from '@/lib/class-materials'
import { createClient as createServerSupabase } from '@/lib/supabase/server'
import type { UploadedObjectMeta } from '@/lib/storage-upload'

type ActionResult = {
  success?: boolean
  error?: string
  postId?: string
}

type DeleteResult = {
  success?: boolean
  error?: string
}

type PrintRequestResult = {
  success?: boolean
  error?: string
}

const MAX_UPLOAD_SIZE = 50 * 1024 * 1024 // 50MB

function sanitizeFileName(name: string) {
  if (!name) {
    return 'upload.dat'
  }
  return name.replace(/[^a-zA-Z0-9_.-]/g, '_')
}

type UploadedClassMaterialAttachment = UploadedObjectMeta & {
  kind: ClassMaterialAssetType
}

type ClassMaterialPostAssetRow = {
  id: string
  kind: ClassMaterialAssetType
  order_index: number
  media_asset_id: string | null
  media_asset?: {
    id: string
    bucket: string | null
    path: string | null
  } | null
}

function normalizePostAssetRow(row: {
  id: unknown
  kind: unknown
  order_index: unknown
  media_asset_id: unknown
  media_asset?: { id: unknown; bucket: unknown; path: unknown }[] | null
}): ClassMaterialPostAssetRow {
  const mediaRelation = Array.isArray(row.media_asset) ? row.media_asset[0] : row.media_asset
  return {
    id: String(row.id),
    kind: (row.kind ?? 'class_material') as ClassMaterialAssetType,
    order_index: Number(row.order_index ?? 0),
    media_asset_id: row.media_asset_id ? String(row.media_asset_id) : null,
    media_asset: mediaRelation
      ? {
        id: String(mediaRelation.id),
        bucket: mediaRelation.bucket ? String(mediaRelation.bucket) : null,
        path: mediaRelation.path ? String(mediaRelation.path) : null,
      }
      : null,
  }
}

function parseUploadedClassMaterialAttachments(value: FormDataEntryValue | null | undefined) {
  if (!value) {
    return [] as UploadedClassMaterialAttachment[]
  }

  if (typeof value !== 'string' || value.trim().length === 0) {
    return [] as UploadedClassMaterialAttachment[]
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch (error) {
    console.error('[class-materials] failed to parse attachment payload', error)
    throw new Error('첨부 파일 정보를 확인하지 못했습니다.')
  }

  if (!Array.isArray(parsed)) {
    throw new Error('첨부 파일 정보 형식이 올바르지 않습니다.')
  }

  return parsed.map((item, index) => {
    if (!item || typeof item !== 'object') {
      throw new Error(`첨부 파일 정보가 손상되었습니다. (index: ${index})`)
    }

    const record = item as Record<string, unknown>
    const bucket = typeof record.bucket === 'string' ? record.bucket : null
    const path = typeof record.path === 'string' ? record.path : null
    const size = typeof record.size === 'number' ? record.size : Number(record.size)
    const mimeType = typeof record.mimeType === 'string' ? record.mimeType : null
    const originalName = typeof record.originalName === 'string' ? record.originalName : null
    const kind = (record.kind as ClassMaterialAssetType | null) ?? null

    if (!bucket || !path || !Number.isFinite(size) || !mimeType || !originalName || !kind) {
      throw new Error('첨부 파일 정보가 올바르지 않습니다.')
    }

    if (bucket !== CLASS_MATERIALS_BUCKET) {
      throw new Error('허용되지 않은 저장소 경로가 감지되었습니다.')
    }

    if (size > MAX_UPLOAD_SIZE) {
      throw new Error('첨부 파일 용량 제한을 초과했습니다.')
    }

    return {
      bucket,
      path,
      size,
      mimeType,
      originalName,
      kind,
    }
  }) as UploadedClassMaterialAttachment[]
}

async function finalizeClassMaterialAttachment(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  params: {
    attachment: UploadedClassMaterialAttachment
    postId: string
    subject: ClassMaterialSubject
    ownerId: string
    orderIndex: number
  }
) {
  const { attachment, postId, subject, ownerId, orderIndex } = params
  const sanitizedName = sanitizeFileName(attachment.originalName)
  const finalPath = `${subject}/${postId}/${attachment.kind}/${randomUUID()}-${sanitizedName}`

  if (attachment.path !== finalPath) {
    const { error: moveError } = await supabase.storage.from(CLASS_MATERIALS_BUCKET).move(attachment.path, finalPath)
    if (moveError) {
      console.error('[class-materials] failed to move attachment', moveError, { from: attachment.path, to: finalPath })
      throw new Error('첨부 파일을 이동하지 못했습니다.')
    }
  }

  const { data: mediaAsset, error: mediaAssetError } = await supabase
    .from('media_assets')
    .insert({
      owner_id: ownerId,
      scope: 'class_material',
      bucket: CLASS_MATERIALS_BUCKET,
      path: finalPath,
      mime_type: attachment.mimeType,
      size: attachment.size,
      metadata: {
        originalName: sanitizedName,
        kind: attachment.kind,
      },
    })
    .select('id')
    .single()

  if (mediaAssetError || !mediaAsset?.id) {
    console.error('[class-materials] failed to insert media asset', mediaAssetError)
    await supabase.storage.from(CLASS_MATERIALS_BUCKET).remove([finalPath])
    throw new Error('첨부 파일 정보를 저장하지 못했습니다.')
  }

  const { data: postAsset, error: postAssetError } = await supabase
    .from('class_material_post_assets')
    .insert({
      post_id: postId,
      kind: attachment.kind,
      media_asset_id: mediaAsset.id as string,
      order_index: orderIndex,
      created_by: ownerId,
    })
    .select('id')
    .single()

  if (postAssetError || !postAsset?.id) {
    console.error('[class-materials] failed to insert post asset', postAssetError)
    await supabase.storage.from(CLASS_MATERIALS_BUCKET).remove([finalPath])
    await supabase.from('media_assets').delete().eq('id', mediaAsset.id)
    throw new Error('첨부 정보를 연결하지 못했습니다.')
  }

  return {
    mediaAssetId: mediaAsset.id as string,
    postAssetId: postAsset.id as string,
    kind: attachment.kind,
    path: finalPath,
  }
}

async function fetchClassMaterialPostAssets(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  postId: string
) {
  const { data, error } = await supabase
    .from('class_material_post_assets')
    .select('id, kind, order_index, media_asset_id, media_asset:media_assets(id, bucket, path)')
    .eq('post_id', postId)
    .order('order_index', { ascending: true })

  if (error) {
    console.error('[class-materials] failed to fetch post assets', error)
    throw new Error('첨부 파일 정보를 불러오지 못했습니다.')
  }

  return (data ?? []).map((row) => normalizePostAssetRow(row))
}

async function deleteClassMaterialPostAssets(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  assetRows: ClassMaterialPostAssetRow[]
) {
  if (!assetRows.length) {
    return
  }

  const mediaAssetIds = assetRows
    .map((row) => row.media_asset_id)
    .filter((value): value is string => Boolean(value))

  const storagePaths = assetRows
    .map((row) => row.media_asset?.path)
    .filter((value): value is string => Boolean(value))

  if (storagePaths.length > 0) {
    const { error: removeError } = await supabase.storage.from(CLASS_MATERIALS_BUCKET).remove(storagePaths)
    if (removeError) {
      console.error('[class-materials] failed to remove attachment objects', removeError)
    }
  }

  const assetIds = assetRows.map((row) => row.id)
  const { error: deleteRowsError } = await supabase
    .from('class_material_post_assets')
    .delete()
    .in('id', assetIds)

  if (deleteRowsError) {
    console.error('[class-materials] failed to delete post assets', deleteRowsError)
  }

  if (mediaAssetIds.length > 0) {
    const { error: deleteMediaAssetsError } = await supabase
      .from('media_assets')
      .delete()
      .in('id', mediaAssetIds)
    if (deleteMediaAssetsError) {
      console.error('[class-materials] failed to delete media asset rows', deleteMediaAssetsError)
    }
  }
}

async function syncPrimaryClassMaterialAssets(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  postId: string
) {
  const assets = await fetchClassMaterialPostAssets(supabase, postId)

  const orderedByKind: Record<ClassMaterialAssetType, ClassMaterialPostAssetRow[]> = {
    class_material: [],
    student_handout: [],
  }

  assets.forEach((asset) => {
    orderedByKind[asset.kind]?.push(asset)
  })

  for (const kind of Object.keys(orderedByKind) as ClassMaterialAssetType[]) {
    const list = orderedByKind[kind]
    list.sort((a, b) => a.order_index - b.order_index)
    for (let index = 0; index < list.length; index += 1) {
      const targetOrder = index
      if (list[index].order_index !== targetOrder) {
        const { error } = await supabase
          .from('class_material_post_assets')
          .update({ order_index: targetOrder })
          .eq('id', list[index].id)
        if (error) {
          console.error('[class-materials] failed to update attachment order', error, { assetId: list[index].id })
        } else {
          list[index].order_index = targetOrder
        }
      }
    }
  }

  const primaryClassMaterial = orderedByKind.class_material[0]?.media_asset_id ?? null
  const primaryHandout = orderedByKind.student_handout[0]?.media_asset_id ?? null

  const { error: primaryUpdateError } = await supabase
    .from('class_material_posts')
    .update({
      class_material_asset_id: primaryClassMaterial,
      student_handout_asset_id: primaryHandout,
    })
    .eq('id', postId)

  if (primaryUpdateError) {
    console.error('[class-materials] failed to sync primary asset columns', primaryUpdateError, { postId })
  }

  return orderedByKind
}

async function cleanupPostAssetsByIds(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  assetIds: string[]
) {
  if (!assetIds.length) {
    return
  }

  const { data, error } = await supabase
    .from('class_material_post_assets')
    .select('id, kind, order_index, media_asset_id, media_asset:media_assets(id, bucket, path)')
    .in('id', assetIds)

  if (error) {
    console.error('[class-materials] failed to load assets for cleanup', error)
    return
  }

  const normalized = (data ?? []).map((row) => normalizePostAssetRow(row))
  await deleteClassMaterialPostAssets(supabase, normalized)
}

function revalidateMaterialPaths(subject: ClassMaterialSubject, postId?: string) {
  revalidatePath('/dashboard/teacher/class-materials')
  revalidatePath(`/dashboard/teacher/class-materials/${subject}`)
  if (postId) {
    revalidatePath(`/dashboard/teacher/class-materials/${subject}/${postId}`)
  }
  revalidatePath('/dashboard/teacher')
  revalidatePath('/dashboard/principal')
  revalidatePath('/dashboard/manager')
}

// 빠른 수업 자료 추가 (파일 없이 제목/설명/주차만)
export type QuickClassMaterialResult = {
  success?: boolean
  error?: string
  material?: {
    id: string
    title: string
    description: string | null
    weekLabel: string | null
    subject: ClassMaterialSubject
  }
}

export async function createQuickClassMaterialAction(
  subject: string,
  title: string,
  description: string,
  weekLabel: string
): Promise<QuickClassMaterialResult> {
  const { profile } = await getAuthContext()

  if (!profile?.role || !isClassMaterialAllowedRole(profile.role)) {
    return { error: '수업자료를 등록할 권한이 없습니다.' }
  }

  if (!isClassMaterialSubject(subject)) {
    return { error: '유효한 과목이 아닙니다.' }
  }

  const trimmedTitle = title.trim()
  if (trimmedTitle.length === 0) {
    return { error: '제목을 입력해주세요.' }
  }

  if (trimmedTitle.length > 200) {
    return { error: '제목은 200자 이하로 입력해주세요.' }
  }

  const trimmedDescription = description.trim()
  if (trimmedDescription.length > 1000) {
    return { error: '설명은 1000자 이하로 입력해주세요.' }
  }

  const trimmedWeekLabel = weekLabel.trim()

  const supabase = await createServerSupabase()
  const postId = randomUUID()

  try {
    const { error: insertError } = await supabase.from('class_material_posts').insert({
      id: postId,
      subject,
      week_label: trimmedWeekLabel || null,
      title: trimmedTitle,
      description: trimmedDescription || null,
      class_material_asset_id: null,
      student_handout_asset_id: null,
      created_by: profile.id,
    })

    if (insertError) {
      console.error('[class-materials] quick create failed', insertError)
      return { error: '수업자료를 저장하지 못했습니다.' }
    }

    revalidateMaterialPaths(subject, postId)

    return {
      success: true,
      material: {
        id: postId,
        title: trimmedTitle,
        description: trimmedDescription || null,
        weekLabel: trimmedWeekLabel || null,
        subject,
      },
    }
  } catch (error) {
    console.error('[class-materials] quick create error', error)
    return { error: '자료 등록 중 문제가 발생했습니다.' }
  }
}

export async function createClassMaterialPost(formData: FormData): Promise<ActionResult> {
  const { profile } = await getAuthContext()

  if (!profile?.role || !isClassMaterialAllowedRole(profile.role)) {
    return { error: '수업자료를 등록할 권한이 없습니다.' }
  }

  const subjectValue = formData.get('subject')
  const titleValue = formData.get('title')

  if (typeof subjectValue !== 'string' || !isClassMaterialSubject(subjectValue)) {
    return { error: '유효한 과목이 아닙니다.' }
  }

  if (typeof titleValue !== 'string' || titleValue.trim().length === 0) {
    return { error: '제목을 입력해주세요.' }
  }

  const subject = subjectValue
  const title = titleValue.trim()
  const weekLabelValue = formData.get('weekLabel')
  const descriptionValue = formData.get('description')
  const weekLabel = typeof weekLabelValue === 'string' ? weekLabelValue.trim() : ''
  const description = typeof descriptionValue === 'string' ? descriptionValue.trim() : ''
  const uploadedAttachmentsValue = formData.get('uploadedAttachments')

  let uploadedAttachments: UploadedClassMaterialAttachment[] = []
  try {
    uploadedAttachments = parseUploadedClassMaterialAttachments(uploadedAttachmentsValue)
  } catch (error) {
    return { error: error instanceof Error ? error.message : '첨부 파일 정보를 확인하지 못했습니다.' }
  }

  const supabase = await createServerSupabase()
  const postId = randomUUID()

  try {
    const { error: insertError } = await supabase.from('class_material_posts').insert({
      id: postId,
      subject,
      week_label: weekLabel || null,
      title,
      description: description || null,
      class_material_asset_id: null,
      student_handout_asset_id: null,
      created_by: profile.id,
    })

    if (insertError) {
      console.error('[class-materials] failed to insert post', insertError)
      throw new Error('수업자료를 저장하지 못했습니다.')
    }

    const attachmentCounters: Record<ClassMaterialAssetType, number> = {
      class_material: 0,
      student_handout: 0,
    }
    const insertedAttachmentIds: string[] = []

    try {
      for (const attachment of uploadedAttachments) {
        const orderIndex = attachmentCounters[attachment.kind] ?? 0
        const created = await finalizeClassMaterialAttachment(supabase, {
          attachment,
          postId,
          subject,
          ownerId: profile.id,
          orderIndex,
        })
        insertedAttachmentIds.push(created.postAssetId)
        attachmentCounters[attachment.kind] = orderIndex + 1
      }

      await syncPrimaryClassMaterialAssets(supabase, postId)
    } catch (attachmentError) {
      await cleanupPostAssetsByIds(supabase, insertedAttachmentIds)
      throw attachmentError
    }

    revalidateMaterialPaths(subject, postId)

    return { success: true, postId }
  } catch (error) {
    console.error('[class-materials] create post error', error)
    await supabase.from('class_material_posts').delete().eq('id', postId)

    return {
      error: error instanceof Error ? error.message : '자료 등록 중 문제가 발생했습니다.',
    }
  }
}

export async function updateClassMaterialPost(formData: FormData): Promise<ActionResult> {
  const { profile } = await getAuthContext()

  if (!profile?.role || !isClassMaterialAllowedRole(profile.role)) {
    return { error: '수업자료를 수정할 권한이 없습니다.' }
  }

  const subjectValue = formData.get('subject')
  const postIdValue = formData.get('postId')
  const titleValue = formData.get('title')

  if (typeof subjectValue !== 'string' || !isClassMaterialSubject(subjectValue)) {
    return { error: '유효한 과목이 아닙니다.' }
  }

  if (typeof postIdValue !== 'string' || postIdValue.length === 0) {
    return { error: '자료 정보를 확인할 수 없습니다.' }
  }

  if (typeof titleValue !== 'string' || titleValue.trim().length === 0) {
    return { error: '제목을 입력해주세요.' }
  }

  const subject = subjectValue
  const postId = postIdValue
  const title = titleValue.trim()
  const weekLabelValue = formData.get('weekLabel')
  const descriptionValue = formData.get('description')
  const weekLabel = typeof weekLabelValue === 'string' ? weekLabelValue.trim() : ''
  const description = typeof descriptionValue === 'string' ? descriptionValue.trim() : ''
  const uploadedAttachmentsValue = formData.get('uploadedAttachments')
  const removedAttachmentValues = formData.getAll('removedAttachmentIds')

  let uploadedAttachments: UploadedClassMaterialAttachment[] = []
  try {
    uploadedAttachments = parseUploadedClassMaterialAttachments(uploadedAttachmentsValue)
  } catch (error) {
    return { error: error instanceof Error ? error.message : '첨부 파일 정보를 확인하지 못했습니다.' }
  }

  const removedAttachmentIds = new Set(
    removedAttachmentValues
      .map((value) => (typeof value === 'string' ? value.trim() : ''))
      .filter((value): value is string => value.length > 0)
  )

  const supabase = await createServerSupabase()

  const { data: existing, error: fetchError } = await supabase
    .from('class_material_posts')
    .select(
      `id,
       subject,
       class_material_asset_id,
       student_handout_asset_id,
       class_material_asset:media_assets!class_material_posts_class_material_asset_id_fkey(id, path),
       student_handout_asset:media_assets!class_material_posts_student_handout_asset_id_fkey(id, path)
      `
    )
    .eq('id', postId)
    .maybeSingle()

  if (fetchError) {
    console.error('[class-materials] failed to load post for update', fetchError)
    return { error: '자료 정보를 불러오지 못했습니다.' }
  }

  if (!existing) {
    return { error: '자료를 찾을 수 없습니다.' }
  }

  if (existing.subject !== subject) {
    return { error: '과목 정보가 일치하지 않습니다.' }
  }

  const existingAttachments = await fetchClassMaterialPostAssets(supabase, postId)
  const attachmentMap = new Map(existingAttachments.map((asset) => [asset.id, asset]))
  const attachmentsMarkedForRemoval = Array.from(removedAttachmentIds)
    .map((id) => attachmentMap.get(id))
    .filter((asset): asset is ClassMaterialPostAssetRow => Boolean(asset))

  const insertedAttachmentIds: string[] = []

  try {
    if (attachmentsMarkedForRemoval.length > 0) {
      await deleteClassMaterialPostAssets(supabase, attachmentsMarkedForRemoval)
    }

    const remainingAttachments = existingAttachments.filter((asset) => !removedAttachmentIds.has(asset.id))
    const attachmentCounters: Record<ClassMaterialAssetType, number> = {
      class_material: remainingAttachments.filter((asset) => asset.kind === 'class_material').length,
      student_handout: remainingAttachments.filter((asset) => asset.kind === 'student_handout').length,
    }

    for (const attachment of uploadedAttachments) {
      const orderIndex = attachmentCounters[attachment.kind] ?? 0
      const created = await finalizeClassMaterialAttachment(supabase, {
        attachment,
        postId,
        subject,
        ownerId: profile.id,
        orderIndex,
      })
      insertedAttachmentIds.push(created.postAssetId)
      attachmentCounters[attachment.kind] = orderIndex + 1
    }

    await syncPrimaryClassMaterialAssets(supabase, postId)

    const { error: updateError } = await supabase
      .from('class_material_posts')
      .update({
        week_label: weekLabel || null,
        title,
        description: description || null,
      })
      .eq('id', postId)

    if (updateError) {
      console.error('[class-materials] failed to update post', updateError)
      throw new Error('자료를 수정하지 못했습니다.')
    }

    revalidateMaterialPaths(subject, postId)

    return { success: true, postId }
  } catch (error) {
    console.error('[class-materials] update post error', error)
    await cleanupPostAssetsByIds(supabase, insertedAttachmentIds)

    return {
      error: error instanceof Error ? error.message : '자료 수정 중 오류가 발생했습니다.',
      postId,
    }
  }
}

export async function deleteClassMaterialPost(postId: string): Promise<DeleteResult> {
  const { profile } = await getAuthContext()

  if (!profile?.role || !isClassMaterialAllowedRole(profile.role)) {
    return { error: '자료를 삭제할 권한이 없습니다.' }
  }

  if (!postId) {
    return { error: '자료 정보를 확인할 수 없습니다.' }
  }

  const supabase = await createServerSupabase()

  const { data: existing, error: fetchError } = await supabase
    .from('class_material_posts')
    .select('id, subject')
    .eq('id', postId)
    .maybeSingle()

  if (fetchError) {
    console.error('[class-materials] failed to load post for delete', fetchError)
    return { error: '자료 정보를 불러오지 못했습니다.' }
  }

  if (!existing) {
    return { error: '자료를 찾을 수 없습니다.' }
  }

  const subject = existing.subject as ClassMaterialSubject
  const attachments = await fetchClassMaterialPostAssets(supabase, postId)
  await deleteClassMaterialPostAssets(supabase, attachments)

  const { error: deleteError } = await supabase.from('class_material_posts').delete().eq('id', postId)

  if (deleteError) {
    console.error('[class-materials] failed to delete post', deleteError)
    return { error: '자료 삭제에 실패했습니다.' }
  }

  revalidateMaterialPaths(subject)

  return { success: true }
}

export async function createClassMaterialPrintRequest(formData: FormData): Promise<PrintRequestResult> {
  const { profile } = await getAuthContext()

  if (!profile?.role || !isClassMaterialAllowedRole(profile.role)) {
    return { error: '인쇄 요청을 등록할 권한이 없습니다.' }
  }

  const postIdValue = formData.get('postId')
  const copiesValue = formData.get('copies')
  const colorModeValue = formData.get('colorMode')
  const desiredDateValue = formData.get('desiredDate')
  const desiredPeriodValue = formData.get('desiredPeriod')
  const notesValue = formData.get('notes')
  const selectedAttachmentValues = formData.getAll('selectedAttachmentIds')

  if (typeof postIdValue !== 'string' || postIdValue.length === 0) {
    return { error: '자료 정보를 확인할 수 없습니다.' }
  }

  const selectedAttachmentIds = Array.from(
    new Set(
      selectedAttachmentValues
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter((value): value is string => value.length > 0)
    )
  )

  if (selectedAttachmentIds.length === 0) {
    return { error: '인쇄할 파일을 선택해주세요.' }
  }

  const supabase = await createServerSupabase()

  const { data: post, error: fetchError } = await supabase
    .from('class_material_posts')
    .select('id, subject, title')
    .eq('id', postIdValue)
    .maybeSingle()

  if (fetchError) {
    console.error('[class-materials] failed to load post for print request', fetchError)
    return { error: '자료 정보를 불러오지 못했습니다.' }
  }

  if (!post) {
    return { error: '자료를 찾을 수 없습니다.' }
  }

  const { data: attachments, error: attachmentsError } = await supabase
    .from('class_material_post_assets')
    .select('id, kind, media_asset_id, media_asset:media_assets(id, metadata)')
    .eq('post_id', postIdValue)
    .in('id', selectedAttachmentIds)

  if (attachmentsError) {
    console.error('[class-materials] failed to load attachments for print request', attachmentsError)
    return { error: '첨부 파일 정보를 불러오지 못했습니다.' }
  }

  const normalizedAttachments = (attachments ?? []) as Array<{
    id: string
    kind: ClassMaterialAssetType
    media_asset_id: string | null
    media_asset?: { metadata?: Record<string, unknown> | null } | null
  }>

  if (normalizedAttachments.length !== selectedAttachmentIds.length) {
    return { error: '선택한 첨부 파일을 찾을 수 없습니다. 새로고침 후 다시 시도해주세요.' }
  }

  const copies = typeof copiesValue === 'string' ? Number.parseInt(copiesValue, 10) : 1
  const normalizedCopies = Number.isNaN(copies) || copies < 1 ? 1 : Math.min(copies, 100)
  const colorMode = colorModeValue === 'color' ? 'color' : 'bw'
  const desiredDateInput = typeof desiredDateValue === 'string' ? desiredDateValue.trim() : ''
  if (!desiredDateInput) {
    return { error: '희망일을 입력해주세요.' }
  }
  const desiredDateCandidate = new Date(`${desiredDateInput}T00:00:00`)
  if (Number.isNaN(desiredDateCandidate.getTime())) {
    return { error: '유효한 희망일을 입력해주세요.' }
  }
  const desiredDate = desiredDateInput
  const desiredPeriod = typeof desiredPeriodValue === 'string' && desiredPeriodValue.length > 0 ? desiredPeriodValue : null
  const notes = typeof notesValue === 'string' && notesValue.trim().length > 0 ? notesValue.trim() : null

  const { data: requestRow, error: insertError } = await supabase
    .from('class_material_print_requests')
    .insert({
      post_id: postIdValue,
      requested_by: profile.id,
      copies: normalizedCopies,
      color_mode: colorMode,
      desired_date: desiredDate,
      desired_period: desiredPeriod,
      notes,
      status: 'requested',
    })
    .select('id')
    .single()

  if (insertError || !requestRow?.id) {
    console.error('[class-materials] failed to insert print request', insertError)
    return { error: '인쇄 요청을 저장하지 못했습니다.' }
  }

  const itemsPayload = normalizedAttachments.map((attachment) => {
    if (!attachment.media_asset_id) {
      throw new Error('첨부 파일 정보가 손상되었습니다.')
    }

    const metadata = (attachment.media_asset?.metadata as { originalName?: string } | null) ?? null

    return {
      request_id: requestRow.id,
      asset_type: attachment.kind,
      media_asset_id: attachment.media_asset_id,
      asset_filename: metadata?.originalName ?? null,
    }
  })

  const { error: itemsError } = await supabase.from('class_material_print_request_items').insert(itemsPayload)

  if (itemsError) {
    console.error('[class-materials] failed to insert print request items', itemsError)
    await supabase.from('class_material_print_requests').delete().eq('id', requestRow.id)
    return { error: '인쇄 요청 파일 정보를 저장하지 못했습니다.' }
  }

  revalidateMaterialPaths(post.subject as ClassMaterialSubject, post.id)

  return { success: true }
}

export async function cancelClassMaterialPrintRequest(formData: FormData): Promise<void> {
  const { profile } = await getAuthContext()

  if (!profile?.role || !isClassMaterialAllowedRole(profile.role)) {
    throw new Error('인쇄 요청을 취소할 권한이 없습니다.')
  }

  const requestIdValue = formData.get('requestId')

  if (typeof requestIdValue !== 'string' || requestIdValue.length === 0) {
    throw new Error('인쇄 요청 정보를 확인할 수 없습니다.')
  }

  const supabase = await createServerSupabase()

  const { data: requestRow, error: fetchError } = await supabase
    .from('class_material_print_requests')
    .select('id, post_id, requested_by, status')
    .eq('id', requestIdValue)
    .maybeSingle()

  if (fetchError) {
    console.error('[class-materials] failed to load print request', fetchError)
    throw new Error('인쇄 요청 정보를 불러오지 못했습니다.')
  }

  if (!requestRow) {
    throw new Error('인쇄 요청을 찾을 수 없습니다.')
  }

  if (requestRow.status !== 'requested') {
    throw new Error('처리 중이거나 완료된 요청은 취소할 수 없습니다.')
  }

  const isOwner = requestRow.requested_by === profile.id
  const isSupervisor = profile.role === 'principal' || profile.role === 'manager'

  if (!isOwner && !isSupervisor) {
    throw new Error('해당 인쇄 요청을 취소할 권한이 없습니다.')
  }

  const now = new Date().toISOString()

  const { error: cancelError } = await supabase
    .from('class_material_print_requests')
    .update({ status: 'canceled', updated_at: now })
    .eq('id', requestRow.id)

  if (cancelError) {
    console.error('[class-materials] failed to cancel print request', cancelError)
    throw new Error('인쇄 요청 취소 중 오류가 발생했습니다.')
  }

  const { data: postRow, error: postError } = await supabase
    .from('class_material_posts')
    .select('id, subject')
    .eq('id', requestRow.post_id)
    .maybeSingle()

  if (postError) {
    console.error('[class-materials] failed to load post for revalidate', postError)
  }

  if (postRow?.subject) {
    revalidateMaterialPaths(postRow.subject as ClassMaterialSubject, postRow.id)
  } else {
    revalidatePath('/dashboard/teacher/class-materials')
    revalidatePath('/dashboard/teacher')
    revalidatePath('/dashboard/principal')
    revalidatePath('/dashboard/manager')
  }

  return
}
