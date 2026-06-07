'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'

import { ensureManagerProfile } from '@/lib/authz'
import {
  SPECIAL_LECTURE_VIDEOS_BUCKET,
  SPECIAL_LECTURE_MAX_VIDEO_SIZE,
  SPECIAL_LECTURE_DEFAULT_GRANT_HOURS,
  SPECIAL_LECTURE_MAX_GRANT_HOURS,
  type SpecialLectureAudienceMode,
  isSpecialLectureAudienceMode,
} from '@/lib/special-lectures'
import { createClient as createServerSupabase } from '@/lib/supabase/server'
import type { UploadedObjectMeta } from '@/lib/storage-upload'

const MANAGER_PATH = '/dashboard/manager/special-lectures'
const STUDENT_PATH = '/dashboard/student/special-lectures'

type ActionResult = {
  success?: boolean
  error?: string
  lectureId?: string
}

type DeleteResult = {
  success?: boolean
  error?: string
}

type GrantActionResult = {
  success?: boolean
  error?: string
  grantId?: string
}

function sanitizeFileName(name: string) {
  if (!name) return 'video.mp4'
  return name.replace(/[^a-zA-Z0-9_.-]/g, '_')
}

function parseUploadedVideo(value: FormDataEntryValue | null | undefined): UploadedObjectMeta | null {
  if (!value || typeof value !== 'string' || value.trim().length === 0) {
    return null
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch (parseError) {
    console.error('[special-lectures] failed to parse uploaded video payload', parseError)
    throw new Error('영상 파일 정보를 확인하지 못했습니다.')
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('영상 파일 정보 형식이 올바르지 않습니다.')
  }

  const record = parsed as Record<string, unknown>
  const bucket = typeof record.bucket === 'string' ? record.bucket : null
  const path = typeof record.path === 'string' ? record.path : null
  const size = typeof record.size === 'number' ? record.size : Number(record.size)
  const mimeType = typeof record.mimeType === 'string' ? record.mimeType : null
  const originalName = typeof record.originalName === 'string' ? record.originalName : null

  if (!bucket || !path || !Number.isFinite(size) || !mimeType || !originalName) {
    throw new Error('영상 파일 정보가 올바르지 않습니다.')
  }

  if (bucket !== SPECIAL_LECTURE_VIDEOS_BUCKET) {
    throw new Error('허용되지 않은 저장소 경로가 감지되었습니다.')
  }

  if (size > SPECIAL_LECTURE_MAX_VIDEO_SIZE) {
    throw new Error('영상 파일 용량 제한을 초과했습니다.')
  }

  return { bucket, path, size, mimeType, originalName }
}

function collectIds(formData: FormData, key: string): string[] {
  return Array.from(
    new Set(
      formData
        .getAll(key)
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter((value) => value.length > 0)
    )
  )
}

function parseAudienceMode(formData: FormData): SpecialLectureAudienceMode {
  const raw = formData.get('audience_mode')
  if (typeof raw === 'string' && isSpecialLectureAudienceMode(raw)) {
    return raw
  }
  return 'class'
}

function parseExpiresHours(formData: FormData): number {
  const raw = formData.get('expires_hours')
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return SPECIAL_LECTURE_DEFAULT_GRANT_HOURS
  }
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return SPECIAL_LECTURE_DEFAULT_GRANT_HOURS
  }
  if (parsed > SPECIAL_LECTURE_MAX_GRANT_HOURS) {
    return SPECIAL_LECTURE_MAX_GRANT_HOURS
  }
  return parsed
}

function revalidateAll(lectureId?: string) {
  revalidatePath(MANAGER_PATH)
  revalidatePath(STUDENT_PATH)
  if (lectureId) {
    revalidatePath(`${MANAGER_PATH}/${lectureId}/edit`)
    revalidatePath(`${MANAGER_PATH}/${lectureId}/views`)
    revalidatePath(`${STUDENT_PATH}/${lectureId}`)
  }
}

async function finalizeVideoAsset(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  params: {
    lectureId: string
    ownerId: string
    upload: UploadedObjectMeta
  }
): Promise<{ mediaAssetId: string; finalPath: string }> {
  const { lectureId, ownerId, upload } = params
  const sanitizedName = sanitizeFileName(upload.originalName)
  const finalPath = `${lectureId}/${randomUUID()}-${sanitizedName}`

  if (upload.path !== finalPath) {
    const { error: moveError } = await supabase.storage
      .from(SPECIAL_LECTURE_VIDEOS_BUCKET)
      .move(upload.path, finalPath)
    if (moveError) {
      console.error('[special-lectures] failed to move video', moveError, {
        from: upload.path,
        to: finalPath,
      })
      throw new Error('영상 파일을 이동하지 못했습니다.')
    }
  }

  const { data: mediaAsset, error: mediaError } = await supabase
    .from('media_assets')
    .insert({
      owner_id: ownerId,
      scope: 'special_lecture',
      bucket: SPECIAL_LECTURE_VIDEOS_BUCKET,
      path: finalPath,
      mime_type: upload.mimeType,
      size: upload.size,
      metadata: { originalName: sanitizedName },
    })
    .select('id')
    .single()

  if (mediaError || !mediaAsset?.id) {
    console.error('[special-lectures] failed to insert media asset', mediaError)
    await supabase.storage.from(SPECIAL_LECTURE_VIDEOS_BUCKET).remove([finalPath])
    throw new Error('영상 정보를 저장하지 못했습니다.')
  }

  return { mediaAssetId: String(mediaAsset.id), finalPath }
}

async function removeMediaAsset(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  mediaAssetId: string | null
) {
  if (!mediaAssetId) return
  const { data, error } = await supabase
    .from('media_assets')
    .select('id, bucket, path')
    .eq('id', mediaAssetId)
    .maybeSingle()

  if (error) {
    console.error('[special-lectures] failed to load media asset for cleanup', error)
    return
  }

  if (data?.bucket && data.path) {
    const { error: removeError } = await supabase.storage
      .from(String(data.bucket))
      .remove([String(data.path)])
    if (removeError) {
      console.error('[special-lectures] failed to remove storage object', removeError)
    }
  }

  const { error: deleteError } = await supabase
    .from('media_assets')
    .delete()
    .eq('id', mediaAssetId)

  if (deleteError) {
    console.error('[special-lectures] failed to delete media asset', deleteError)
  }
}

export async function createSpecialLectureAction(formData: FormData): Promise<ActionResult> {
  const profile = await ensureManagerProfile()
  if (!profile) {
    return { error: '특강을 등록할 권한이 없습니다.' }
  }

  const titleValue = formData.get('title')
  const descriptionValue = formData.get('description')

  if (typeof titleValue !== 'string' || titleValue.trim().length === 0) {
    return { error: '특강 제목을 입력해주세요.' }
  }

  const title = titleValue.trim()
  const description = typeof descriptionValue === 'string' ? descriptionValue.trim() : ''

  let uploadedVideo: UploadedObjectMeta | null = null
  try {
    uploadedVideo = parseUploadedVideo(formData.get('uploadedVideo'))
  } catch (parseError) {
    return {
      error: parseError instanceof Error ? parseError.message : '영상 정보를 확인하지 못했습니다.',
    }
  }

  if (!uploadedVideo) {
    return { error: '영상 파일을 업로드해주세요.' }
  }

  const supabase = await createServerSupabase()

  let createdLectureId: string | null = null
  let createdMediaAssetId: string | null = null

  try {
    const { data: lecture, error: insertError } = await supabase
      .from('special_lectures')
      .insert({
        title,
        description: description || null,
        created_by: profile.id,
      })
      .select('id')
      .single()

    if (insertError || !lecture?.id) {
      console.error('[special-lectures] failed to create lecture', insertError)
      throw new Error('특강을 생성하지 못했습니다.')
    }

    createdLectureId = String(lecture.id)

    const { mediaAssetId } = await finalizeVideoAsset(supabase, {
      lectureId: createdLectureId,
      ownerId: profile.id,
      upload: uploadedVideo,
    })
    createdMediaAssetId = mediaAssetId

    const { error: linkError } = await supabase
      .from('special_lectures')
      .update({ video_asset_id: mediaAssetId })
      .eq('id', createdLectureId)

    if (linkError) {
      console.error('[special-lectures] failed to link video asset', linkError)
      throw new Error('영상 파일을 특강에 연결하지 못했습니다.')
    }

    revalidateAll(createdLectureId)
    return { success: true, lectureId: createdLectureId }
  } catch (error) {
    console.error('[special-lectures] create error', error)
    if (createdMediaAssetId) {
      await removeMediaAsset(supabase, createdMediaAssetId)
    } else if (uploadedVideo) {
      await supabase.storage.from(SPECIAL_LECTURE_VIDEOS_BUCKET).remove([uploadedVideo.path])
    }
    if (createdLectureId) {
      await supabase.from('special_lectures').delete().eq('id', createdLectureId)
    }
    return {
      error: error instanceof Error ? error.message : '특강 등록 중 문제가 발생했습니다.',
    }
  }
}

export async function updateSpecialLectureAction(
  id: string,
  formData: FormData
): Promise<ActionResult> {
  const profile = await ensureManagerProfile()
  if (!profile) {
    return { error: '특강을 수정할 권한이 없습니다.' }
  }
  if (!id) {
    return { error: '특강 정보를 확인할 수 없습니다.' }
  }

  const titleValue = formData.get('title')
  const descriptionValue = formData.get('description')

  if (typeof titleValue !== 'string' || titleValue.trim().length === 0) {
    return { error: '특강 제목을 입력해주세요.' }
  }

  const title = titleValue.trim()
  const description = typeof descriptionValue === 'string' ? descriptionValue.trim() : ''

  let uploadedVideo: UploadedObjectMeta | null = null
  try {
    uploadedVideo = parseUploadedVideo(formData.get('uploadedVideo'))
  } catch (parseError) {
    return {
      error: parseError instanceof Error ? parseError.message : '영상 정보를 확인하지 못했습니다.',
    }
  }

  const supabase = await createServerSupabase()

  const { data: existing, error: fetchError } = await supabase
    .from('special_lectures')
    .select('id, video_asset_id')
    .eq('id', id)
    .maybeSingle()

  if (fetchError || !existing) {
    console.error('[special-lectures] failed to load lecture for update', fetchError)
    return { error: '특강 정보를 불러오지 못했습니다.' }
  }

  let newMediaAssetId: string | null = null

  try {
    if (uploadedVideo) {
      const { mediaAssetId } = await finalizeVideoAsset(supabase, {
        lectureId: id,
        ownerId: profile.id,
        upload: uploadedVideo,
      })
      newMediaAssetId = mediaAssetId
    }

    const updates: Record<string, unknown> = {
      title,
      description: description || null,
    }
    if (newMediaAssetId) {
      updates.video_asset_id = newMediaAssetId
    }

    const { error: updateError } = await supabase
      .from('special_lectures')
      .update(updates)
      .eq('id', id)

    if (updateError) {
      console.error('[special-lectures] failed to update lecture', updateError)
      throw new Error('특강 정보를 저장하지 못했습니다.')
    }

    if (newMediaAssetId && existing.video_asset_id) {
      await removeMediaAsset(supabase, String(existing.video_asset_id))
    }

    revalidateAll(id)
    return { success: true, lectureId: id }
  } catch (error) {
    console.error('[special-lectures] update error', error)
    if (newMediaAssetId) {
      await removeMediaAsset(supabase, newMediaAssetId)
    } else if (uploadedVideo) {
      await supabase.storage.from(SPECIAL_LECTURE_VIDEOS_BUCKET).remove([uploadedVideo.path])
    }
    return {
      error: error instanceof Error ? error.message : '특강 수정 중 문제가 발생했습니다.',
      lectureId: id,
    }
  }
}

export async function deleteSpecialLectureAction(id: string): Promise<DeleteResult> {
  const profile = await ensureManagerProfile()
  if (!profile) {
    return { error: '특강을 삭제할 권한이 없습니다.' }
  }
  if (!id) {
    return { error: '특강 정보를 확인할 수 없습니다.' }
  }

  const supabase = await createServerSupabase()

  const { data: existing, error: fetchError } = await supabase
    .from('special_lectures')
    .select('id, video_asset_id')
    .eq('id', id)
    .maybeSingle()

  if (fetchError) {
    console.error('[special-lectures] failed to load lecture for delete', fetchError)
    return { error: '특강 정보를 불러오지 못했습니다.' }
  }

  try {
    const { error: deleteError } = await supabase.from('special_lectures').delete().eq('id', id)
    if (deleteError) {
      console.error('[special-lectures] failed to delete lecture', deleteError)
      throw new Error('특강을 삭제하지 못했습니다.')
    }

    if (existing?.video_asset_id) {
      await removeMediaAsset(supabase, String(existing.video_asset_id))
    }

    revalidateAll(id)
    return { success: true }
  } catch (error) {
    console.error('[special-lectures] delete error', error)
    return {
      error: error instanceof Error ? error.message : '특강 삭제 중 문제가 발생했습니다.',
    }
  }
}

// ----- Grant 액션 ---------------------------------------------------------

export async function createSpecialLectureGrantAction(
  lectureId: string,
  formData: FormData
): Promise<GrantActionResult> {
  const profile = await ensureManagerProfile()
  if (!profile) {
    return { error: '영상을 공개할 권한이 없습니다.' }
  }
  if (!lectureId) {
    return { error: '특강 정보를 확인할 수 없습니다.' }
  }

  const audienceMode = parseAudienceMode(formData)
  const classIds = audienceMode === 'all_students' ? [] : collectIds(formData, 'classIds')
  const studentIds = audienceMode === 'all_students' ? [] : collectIds(formData, 'studentIds')

  if (audienceMode === 'class' && classIds.length === 0 && studentIds.length === 0) {
    return { error: '공개할 반 또는 개별 학생을 1명 이상 선택해주세요.' }
  }
  if (audienceMode === 'student' && studentIds.length === 0 && classIds.length === 0) {
    return { error: '공개할 학생을 1명 이상 선택해주세요.' }
  }

  const expiresHours = parseExpiresHours(formData)
  const expiresAt = new Date(Date.now() + expiresHours * 60 * 60 * 1000).toISOString()

  const supabase = await createServerSupabase()

  const { data: lecture, error: lectureError } = await supabase
    .from('special_lectures')
    .select('id')
    .eq('id', lectureId)
    .maybeSingle()

  if (lectureError || !lecture) {
    console.error('[special-lectures] failed to load lecture for grant', lectureError)
    return { error: '특강 정보를 불러오지 못했습니다.' }
  }

  const { data: grant, error: grantError } = await supabase
    .from('special_lecture_grants')
    .insert({
      special_lecture_id: lectureId,
      audience_mode: audienceMode,
      expires_at: expiresAt,
      created_by: profile.id,
    })
    .select('id')
    .single()

  if (grantError || !grant?.id) {
    console.error('[special-lectures] failed to create grant', grantError)
    return { error: '영상 공개 기록을 생성하지 못했습니다.' }
  }

  const grantId = String(grant.id)

  try {
    if (classIds.length > 0) {
      const { error: classInsertError } = await supabase
        .from('special_lecture_grant_classes')
        .insert(
          classIds.map((classId) => ({
            grant_id: grantId,
            class_id: classId,
          }))
        )
      if (classInsertError) {
        console.error('[special-lectures] failed to insert grant classes', classInsertError)
        throw new Error('공개 반 정보를 저장하지 못했습니다.')
      }
    }

    if (studentIds.length > 0) {
      const { error: studentInsertError } = await supabase
        .from('special_lecture_grant_students')
        .insert(
          studentIds.map((studentId) => ({
            grant_id: grantId,
            student_id: studentId,
          }))
        )
      if (studentInsertError) {
        console.error('[special-lectures] failed to insert grant students', studentInsertError)
        throw new Error('공개 학생 정보를 저장하지 못했습니다.')
      }
    }

    revalidateAll(lectureId)
    return { success: true, grantId }
  } catch (error) {
    console.error('[special-lectures] grant create cleanup', error)
    await supabase.from('special_lecture_grants').delete().eq('id', grantId)
    return {
      error: error instanceof Error ? error.message : '영상 공개 처리 중 문제가 발생했습니다.',
    }
  }
}

export async function revokeSpecialLectureGrantAction(
  grantId: string
): Promise<GrantActionResult> {
  const profile = await ensureManagerProfile()
  if (!profile) {
    return { error: '공개를 종료할 권한이 없습니다.' }
  }
  if (!grantId) {
    return { error: '공개 정보를 확인할 수 없습니다.' }
  }

  const supabase = await createServerSupabase()

  const { data: existing, error: fetchError } = await supabase
    .from('special_lecture_grants')
    .select('id, special_lecture_id, revoked_at')
    .eq('id', grantId)
    .maybeSingle()

  if (fetchError || !existing) {
    console.error('[special-lectures] failed to load grant for revoke', fetchError)
    return { error: '공개 정보를 불러오지 못했습니다.' }
  }

  if (existing.revoked_at) {
    return { success: true, grantId }
  }

  const { error: updateError } = await supabase
    .from('special_lecture_grants')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', grantId)

  if (updateError) {
    console.error('[special-lectures] failed to revoke grant', updateError)
    return { error: '공개를 종료하지 못했습니다.' }
  }

  revalidateAll(String(existing.special_lecture_id))
  return { success: true, grantId }
}

export async function extendSpecialLectureGrantAction(
  grantId: string,
  expiresAtIso: string
): Promise<GrantActionResult> {
  const profile = await ensureManagerProfile()
  if (!profile) {
    return { error: '공개 기간을 수정할 권한이 없습니다.' }
  }
  if (!grantId) {
    return { error: '공개 정보를 확인할 수 없습니다.' }
  }

  const expiresDate = new Date(expiresAtIso)
  if (Number.isNaN(expiresDate.getTime())) {
    return { error: '만료 시각이 올바르지 않습니다.' }
  }
  if (expiresDate.getTime() <= Date.now()) {
    return { error: '만료 시각은 현재 시각보다 이후여야 합니다.' }
  }

  const supabase = await createServerSupabase()

  const { data: existing, error: fetchError } = await supabase
    .from('special_lecture_grants')
    .select('id, special_lecture_id')
    .eq('id', grantId)
    .maybeSingle()

  if (fetchError || !existing) {
    console.error('[special-lectures] failed to load grant for extend', fetchError)
    return { error: '공개 정보를 불러오지 못했습니다.' }
  }

  const { error: updateError } = await supabase
    .from('special_lecture_grants')
    .update({ expires_at: expiresDate.toISOString(), revoked_at: null })
    .eq('id', grantId)

  if (updateError) {
    console.error('[special-lectures] failed to extend grant', updateError)
    return { error: '공개 기간을 수정하지 못했습니다.' }
  }

  revalidateAll(String(existing.special_lecture_id))
  return { success: true, grantId }
}
