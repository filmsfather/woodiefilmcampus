'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'

import { getAuthContext } from '@/lib/auth'
import {
  MAX_NOTICE_ATTACHMENT_SIZE,
  NOTICE_BOARD_BUCKET,
  NOTICE_MEDIA_SCOPE,
  isNoticeBodyEmpty,
  normalizeRichText,
} from '@/lib/notice-board'
import { createClient as createServerSupabase } from '@/lib/supabase/server'

interface ActionResult {
  success?: boolean
  error?: string
  noticeId?: string
}

interface AcknowledgeResult {
  success?: boolean
  error?: string
  acknowledgedAt?: string | null
}

function sanitizeFileName(name: string) {
  if (!name) {
    return 'attachment'
  }
  return name.replace(/[^a-zA-Z0-9_.-]/g, '_')
}

async function deleteMediaAssets(
  supabase: ReturnType<typeof createServerSupabase>,
  assetIds: string[],
  storagePaths: string[]
) {
  if (storagePaths.length > 0) {
    const { error: removeError } = await supabase.storage.from(NOTICE_BOARD_BUCKET).remove(storagePaths)
    if (removeError) {
      console.error('[notice-board] failed to remove storage objects', removeError)
    }
  }

  if (assetIds.length > 0) {
    const { error: deleteAssetsError } = await supabase.from('media_assets').delete().in('id', assetIds)
    if (deleteAssetsError) {
      console.error('[notice-board] failed to delete media assets', deleteAssetsError)
    }
  }
}

async function uploadNoticeAttachment(
  supabase: ReturnType<typeof createServerSupabase>,
  file: File,
  noticeId: string,
  ownerId: string,
  position: number
) {
  const sanitizedName = sanitizeFileName(file.name)
  const storagePath = `${ownerId}/${noticeId}/${randomUUID()}-${sanitizedName}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error: uploadError } = await supabase.storage
    .from(NOTICE_BOARD_BUCKET)
    .upload(storagePath, buffer, {
      cacheControl: '3600',
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    })

  if (uploadError) {
    console.error('[notice-board] failed to upload attachment', uploadError)
    throw new Error('이미지 업로드에 실패했습니다.')
  }

  const { data: asset, error: assetError } = await supabase
    .from('media_assets')
    .insert({
      owner_id: ownerId,
      scope: NOTICE_MEDIA_SCOPE,
      bucket: NOTICE_BOARD_BUCKET,
      path: storagePath,
      mime_type: file.type || null,
      size: file.size,
      metadata: {
        originalName: sanitizedName,
      },
    })
    .select('id')
    .single()

  if (assetError || !asset?.id) {
    console.error('[notice-board] failed to insert media asset', assetError)
    await supabase.storage.from(NOTICE_BOARD_BUCKET).remove([storagePath])
    throw new Error('첨부 정보를 저장하지 못했습니다.')
  }

  const { error: linkError } = await supabase.from('notice_post_attachments').insert({
    notice_id: noticeId,
    media_asset_id: asset.id as string,
    position,
  })

  if (linkError) {
    console.error('[notice-board] failed to link attachment', linkError)
    await supabase.storage.from(NOTICE_BOARD_BUCKET).remove([storagePath])
    await supabase.from('media_assets').delete().eq('id', asset.id)
    throw new Error('첨부 정보를 연결하지 못했습니다.')
  }
}

function revalidateNoticePaths(noticeId?: string) {
  revalidatePath('/dashboard/teacher/notices')
  revalidatePath('/dashboard/teacher')
  revalidatePath('/dashboard/manager')
  revalidatePath('/dashboard/principal')
  if (noticeId) {
    revalidatePath(`/dashboard/teacher/notices/${noticeId}`)
  }
}

export async function createNotice(formData: FormData): Promise<ActionResult> {
  const { profile } = await getAuthContext()

  if (!profile?.role || !['teacher', 'manager', 'principal'].includes(profile.role)) {
    return { error: '공지사항을 작성할 권한이 없습니다.' }
  }

  const titleValue = formData.get('title')
  const bodyValue = formData.get('body')
  const recipientValues = formData.getAll('recipientIds')
  const attachmentValues = formData.getAll('attachments')

  if (typeof titleValue !== 'string' || titleValue.trim().length === 0) {
    return { error: '제목을 입력해주세요.' }
  }

  if (typeof bodyValue !== 'string') {
    return { error: '본문을 입력해주세요.' }
  }

  const normalizedBody = normalizeRichText(bodyValue)

  if (isNoticeBodyEmpty(normalizedBody)) {
    return { error: '본문을 입력해주세요.' }
  }

  const uniqueRecipientIds = Array.from(
    new Set(
      recipientValues
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        .map((value) => value.trim())
    )
  ).filter((id) => id !== profile.id)

  if (uniqueRecipientIds.length === 0) {
    return { error: '공유 대상을 한 명 이상 선택해주세요.' }
  }

  const attachments = attachmentValues.filter((value): value is File => value instanceof File && value.size > 0)

  let totalSize = 0
  for (const file of attachments) {
    totalSize += file.size
    if (!file.type || !file.type.startsWith('image/')) {
      return { error: '이미지 파일만 첨부할 수 있습니다.' }
    }
  }

  if (totalSize > MAX_NOTICE_ATTACHMENT_SIZE) {
    return { error: '첨부 파일의 총 용량이 제한(10MB)을 초과했습니다.' }
  }

  const supabase = createServerSupabase()

  const { data: inserted, error: insertError } = await supabase
    .from('notice_posts')
    .insert({
      title: titleValue.trim(),
      body: normalizedBody,
      author_id: profile.id,
    })
    .select('id')
    .single()

  if (insertError || !inserted?.id) {
    console.error('[notice-board] failed to insert notice post', insertError)
    return { error: '공지사항을 저장하지 못했습니다.' }
  }

  const noticeId = inserted.id as string

  const recipientRows = uniqueRecipientIds.map((recipientId) => ({
    notice_id: noticeId,
    recipient_id: recipientId,
  }))

  const { error: recipientError } = await supabase.from('notice_post_recipients').insert(recipientRows)

  if (recipientError) {
    console.error('[notice-board] failed to insert recipients', recipientError)
    await supabase.from('notice_posts').delete().eq('id', noticeId)
    return { error: '공유 대상을 저장하지 못했습니다.' }
  }

  try {
    let position = 0
    for (const file of attachments) {
      await uploadNoticeAttachment(supabase, file, noticeId, profile.id, position)
      position += 1
    }
  } catch (error) {
    console.error('[notice-board] attachment upload failed', error)
    await supabase.from('notice_posts').delete().eq('id', noticeId)
    revalidateNoticePaths()
    return { error: error instanceof Error ? error.message : '첨부 파일을 저장하지 못했습니다.' }
  }

  revalidateNoticePaths(noticeId)

  return { success: true, noticeId }
}

export async function acknowledgeNotice(formData: FormData): Promise<AcknowledgeResult> {
  const { profile } = await getAuthContext()

  if (!profile?.id) {
    return { error: '로그인이 필요합니다.' }
  }

  const noticeIdValue = formData.get('noticeId')

  if (typeof noticeIdValue !== 'string' || noticeIdValue.trim().length === 0) {
    return { error: '공지 정보를 확인하지 못했습니다.' }
  }

  const noticeId = noticeIdValue.trim()

  const supabase = createServerSupabase()

  const { data, error } = await supabase
    .from('notice_post_recipients')
    .update({ acknowledged_at: new Date().toISOString() })
    .eq('notice_id', noticeId)
    .eq('recipient_id', profile.id)
    .is('acknowledged_at', null)
    .select('acknowledged_at')
    .single()

  if (error) {
    console.error('[notice-board] failed to acknowledge notice', error)
    return { error: '공지 확인 처리에 실패했습니다.' }
  }

  revalidateNoticePaths(noticeId)

  return {
    success: true,
    acknowledgedAt: data?.acknowledged_at ?? null,
  }
}

async function removeNoticeAttachments(
  supabase: ReturnType<typeof createServerSupabase>,
  noticeId: string,
  attachmentIds: string[]
) {
  if (attachmentIds.length === 0) {
    return
  }

  const { data: attachments, error: attachmentsError } = await supabase
    .from('notice_post_attachments')
    .select('id, media_asset_id')
    .eq('notice_id', noticeId)
    .in('id', attachmentIds)

  if (attachmentsError) {
    console.error('[notice-board] failed to load attachments for removal', attachmentsError)
    throw new Error('첨부 파일 정보를 불러오지 못했습니다.')
  }

  const assetIds = attachments.map((item) => item.media_asset_id).filter((value): value is string => Boolean(value))

  let storagePaths: string[] = []

  if (assetIds.length > 0) {
    const { data: assets, error: assetsError } = await supabase
      .from('media_assets')
      .select('id, bucket, path')
      .in('id', assetIds)

    if (assetsError) {
      console.error('[notice-board] failed to load media asset metadata', assetsError)
    } else {
      storagePaths = (assets ?? [])
        .filter((asset) => asset.bucket === NOTICE_BOARD_BUCKET && typeof asset.path === 'string')
        .map((asset) => asset.path as string)
    }
  }

  const { error: deleteAttachmentsError } = await supabase
    .from('notice_post_attachments')
    .delete()
    .eq('notice_id', noticeId)
    .in('id', attachmentIds)

  if (deleteAttachmentsError) {
    console.error('[notice-board] failed to delete attachments', deleteAttachmentsError)
    throw new Error('첨부 파일 삭제에 실패했습니다.')
  }

  await deleteMediaAssets(supabase, assetIds, storagePaths)
}

export async function updateNotice(formData: FormData): Promise<ActionResult> {
  const { profile } = await getAuthContext()

  if (!profile?.role || !['teacher', 'manager', 'principal'].includes(profile.role)) {
    return { error: '공지사항을 수정할 권한이 없습니다.' }
  }

  const noticeIdValue = formData.get('noticeId')
  const titleValue = formData.get('title')
  const bodyValue = formData.get('body')
  const recipientValues = formData.getAll('recipientIds')
  const removeAttachmentValues = formData.getAll('removeAttachmentIds')
  const attachmentValues = formData.getAll('attachments')

  if (typeof noticeIdValue !== 'string' || noticeIdValue.trim().length === 0) {
    return { error: '공지 정보를 확인하지 못했습니다.' }
  }

  const noticeId = noticeIdValue.trim()

  if (typeof titleValue !== 'string' || titleValue.trim().length === 0) {
    return { error: '제목을 입력해주세요.' }
  }

  if (typeof bodyValue !== 'string') {
    return { error: '본문을 입력해주세요.' }
  }

  const normalizedBody = normalizeRichText(bodyValue)

  if (isNoticeBodyEmpty(normalizedBody)) {
    return { error: '본문을 입력해주세요.' }
  }

  const supabase = createServerSupabase()

  const { data: noticeRow, error: noticeError } = await supabase
    .from('notice_posts')
    .select('id, author_id')
    .eq('id', noticeId)
    .maybeSingle()

  if (noticeError) {
    console.error('[notice-board] failed to fetch notice for update', noticeError)
    return { error: '공지 정보를 불러오지 못했습니다.' }
  }

  if (!noticeRow) {
    return { error: '삭제되었거나 존재하지 않는 공지입니다.' }
  }

  const isAuthor = noticeRow.author_id === profile.id
  const isPrincipal = profile.role === 'principal'

  if (!isAuthor && !isPrincipal) {
    return { error: '공지 수정 권한이 없습니다.' }
  }

  const uniqueRecipientIds = Array.from(
    new Set(
      recipientValues
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        .map((value) => value.trim())
    )
  ).filter((id) => id !== noticeRow.author_id)

  if (uniqueRecipientIds.length === 0) {
    return { error: '공유 대상을 한 명 이상 선택해주세요.' }
  }

  const attachments = attachmentValues.filter((value): value is File => value instanceof File && value.size > 0)

  let totalSize = 0
  for (const file of attachments) {
    totalSize += file.size
    if (!file.type || !file.type.startsWith('image/')) {
      return { error: '이미지 파일만 첨부할 수 있습니다.' }
    }
  }

  if (totalSize > MAX_NOTICE_ATTACHMENT_SIZE) {
    return { error: '첨부 파일의 총 용량이 제한(10MB)을 초과했습니다.' }
  }

  const { error: updateError } = await supabase
    .from('notice_posts')
    .update({
      title: titleValue.trim(),
      body: normalizedBody,
    })
    .eq('id', noticeId)

  if (updateError) {
    console.error('[notice-board] failed to update notice', updateError)
    return { error: '공지 내용을 수정하지 못했습니다.' }
  }

  const { data: existingRecipients, error: existingRecipientsError } = await supabase
    .from('notice_post_recipients')
    .select('recipient_id')
    .eq('notice_id', noticeId)

  if (existingRecipientsError) {
    console.error('[notice-board] failed to fetch recipients for update', existingRecipientsError)
    return { error: '공유 대상 정보를 불러오지 못했습니다.' }
  }

  const existingRecipientIds = new Set((existingRecipients ?? []).map((item) => item.recipient_id))
  const updatedRecipientIds = new Set(uniqueRecipientIds)

  const recipientsToAdd = uniqueRecipientIds.filter((id) => !existingRecipientIds.has(id))
  const recipientsToRemove = Array.from(existingRecipientIds).filter((id) => !updatedRecipientIds.has(id))

  if (recipientsToRemove.length > 0) {
    const { error: removeRecipientsError } = await supabase
      .from('notice_post_recipients')
      .delete()
      .eq('notice_id', noticeId)
      .in('recipient_id', recipientsToRemove)

    if (removeRecipientsError) {
      console.error('[notice-board] failed to remove recipients', removeRecipientsError)
      return { error: '공유 대상에서 제외하지 못했습니다.' }
    }
  }

  if (recipientsToAdd.length > 0) {
    const { error: addRecipientsError } = await supabase
      .from('notice_post_recipients')
      .insert(
        recipientsToAdd.map((recipientId) => ({
          notice_id: noticeId,
          recipient_id: recipientId,
        }))
      )

    if (addRecipientsError) {
      console.error('[notice-board] failed to add recipients', addRecipientsError)
      return { error: '공유 대상을 추가하지 못했습니다.' }
    }
  }

  const removeAttachmentIds = removeAttachmentValues
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map((value) => value.trim())

  if (removeAttachmentIds.length > 0) {
    try {
      await removeNoticeAttachments(supabase, noticeId, removeAttachmentIds)
    } catch (error) {
      return { error: error instanceof Error ? error.message : '첨부 파일 삭제 중 오류가 발생했습니다.' }
    }
  }

  let nextPosition = 0

  const { data: remainingAttachments, error: remainingError } = await supabase
    .from('notice_post_attachments')
    .select('position')
    .eq('notice_id', noticeId)
    .order('position', { ascending: false })
    .limit(1)

  if (remainingError) {
    console.error('[notice-board] failed to load attachment order', remainingError)
  } else if (remainingAttachments && remainingAttachments.length > 0) {
    nextPosition = (remainingAttachments[0]?.position ?? 0) + 1
  }

  try {
    for (const file of attachments) {
      await uploadNoticeAttachment(supabase, file, noticeId, noticeRow.author_id, nextPosition)
      nextPosition += 1
    }
  } catch (error) {
    console.error('[notice-board] attachment upload failed on update', error)
    return { error: error instanceof Error ? error.message : '첨부 파일을 저장하지 못했습니다.' }
  }

  revalidateNoticePaths(noticeId)

  return { success: true, noticeId }
}

export async function deleteNotice(formData: FormData): Promise<ActionResult> {
  const { profile } = await getAuthContext()

  if (!profile?.role || !['teacher', 'manager', 'principal'].includes(profile.role)) {
    return { error: '공지사항을 삭제할 권한이 없습니다.' }
  }

  const noticeIdValue = formData.get('noticeId')

  if (typeof noticeIdValue !== 'string' || noticeIdValue.trim().length === 0) {
    return { error: '공지 정보를 확인하지 못했습니다.' }
  }

  const noticeId = noticeIdValue.trim()

  const supabase = createServerSupabase()

  const { data: noticeRow, error: noticeError } = await supabase
    .from('notice_posts')
    .select('id, author_id')
    .eq('id', noticeId)
    .maybeSingle()

  if (noticeError) {
    console.error('[notice-board] failed to fetch notice for deletion', noticeError)
    return { error: '공지 정보를 불러오지 못했습니다.' }
  }

  if (!noticeRow) {
    return { error: '이미 삭제되었거나 존재하지 않는 공지입니다.' }
  }

  const isAuthor = noticeRow.author_id === profile.id
  const isPrincipal = profile.role === 'principal'

  if (!isAuthor && !isPrincipal) {
    return { error: '공지 삭제 권한이 없습니다.' }
  }

  const { data: attachmentRows, error: attachmentFetchError } = await supabase
    .from('notice_post_attachments')
    .select('id')
    .eq('notice_id', noticeId)

  if (attachmentFetchError) {
    console.error('[notice-board] failed to fetch attachments before deletion', attachmentFetchError)
    return { error: '첨부 정보를 불러오지 못했습니다.' }
  }

  const attachmentIds = (attachmentRows ?? []).map((row) => row.id as string)

  if (attachmentIds.length > 0) {
    try {
      await removeNoticeAttachments(supabase, noticeId, attachmentIds)
    } catch (error) {
      return { error: error instanceof Error ? error.message : '첨부 파일 삭제 중 오류가 발생했습니다.' }
    }
  }

  const { error: deleteNoticeError } = await supabase
    .from('notice_posts')
    .delete()
    .eq('id', noticeId)

  if (deleteNoticeError) {
    console.error('[notice-board] failed to delete notice', deleteNoticeError)
    return { error: '공지를 삭제하지 못했습니다.' }
  }

  revalidateNoticePaths()

  return { success: true }
}
