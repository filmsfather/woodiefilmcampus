'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'

import { ensureManagerProfile } from '@/lib/authz'
import {
  SPECIAL_LECTURE_VIDEOS_BUCKET,
  SPECIAL_LECTURE_MAX_VIDEO_SIZE,
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

async function syncAudienceMappings(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  lectureId: string,
  classIds: string[],
  studentIds: string[]
) {
  const [{ error: deleteClassesError }, { error: deleteStudentsError }] = await Promise.all([
    supabase.from('special_lecture_classes').delete().eq('special_lecture_id', lectureId),
    supabase.from('special_lecture_students').delete().eq('special_lecture_id', lectureId),
  ])

  if (deleteClassesError) {
    console.error('[special-lectures] failed to clear classes audience', deleteClassesError)
    throw new Error('기존 반 대상을 정리하지 못했습니다.')
  }
  if (deleteStudentsError) {
    console.error('[special-lectures] failed to clear students audience', deleteStudentsError)
    throw new Error('기존 학생 대상을 정리하지 못했습니다.')
  }

  if (classIds.length > 0) {
    const { error } = await supabase.from('special_lecture_classes').insert(
      classIds.map((classId) => ({
        special_lecture_id: lectureId,
        class_id: classId,
      }))
    )
    if (error) {
      console.error('[special-lectures] failed to insert classes audience', error)
      throw new Error('반 대상 정보를 저장하지 못했습니다.')
    }
  }

  if (studentIds.length > 0) {
    const { error } = await supabase.from('special_lecture_students').insert(
      studentIds.map((studentId) => ({
        special_lecture_id: lectureId,
        student_id: studentId,
      }))
    )
    if (error) {
      console.error('[special-lectures] failed to insert students audience', error)
      throw new Error('학생 대상 정보를 저장하지 못했습니다.')
    }
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
  const audienceMode = parseAudienceMode(formData)
  const isPublished = formData.get('is_published') === 'on'

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

  const classIds = audienceMode === 'all_students' ? [] : collectIds(formData, 'classIds')
  const studentIds = audienceMode === 'all_students' ? [] : collectIds(formData, 'studentIds')

  if (audienceMode === 'class' && classIds.length === 0 && studentIds.length === 0) {
    return { error: '특정 반 또는 개별 학생을 1명 이상 선택해주세요.' }
  }
  if (audienceMode === 'student' && studentIds.length === 0 && classIds.length === 0) {
    return { error: '시청 가능한 학생을 1명 이상 선택해주세요.' }
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
        audience_mode: audienceMode,
        is_published: isPublished,
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

    await syncAudienceMappings(supabase, createdLectureId, classIds, studentIds)

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
  const audienceMode = parseAudienceMode(formData)
  const isPublished = formData.get('is_published') === 'on'

  let uploadedVideo: UploadedObjectMeta | null = null
  try {
    uploadedVideo = parseUploadedVideo(formData.get('uploadedVideo'))
  } catch (parseError) {
    return {
      error: parseError instanceof Error ? parseError.message : '영상 정보를 확인하지 못했습니다.',
    }
  }

  const classIds = audienceMode === 'all_students' ? [] : collectIds(formData, 'classIds')
  const studentIds = audienceMode === 'all_students' ? [] : collectIds(formData, 'studentIds')

  if (audienceMode === 'class' && classIds.length === 0 && studentIds.length === 0) {
    return { error: '특정 반 또는 개별 학생을 1명 이상 선택해주세요.' }
  }
  if (audienceMode === 'student' && studentIds.length === 0 && classIds.length === 0) {
    return { error: '시청 가능한 학생을 1명 이상 선택해주세요.' }
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
      audience_mode: audienceMode,
      is_published: isPublished,
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

    await syncAudienceMappings(supabase, id, classIds, studentIds)

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

export async function toggleSpecialLecturePublishAction(
  id: string,
  nextPublished: boolean
): Promise<ActionResult> {
  const profile = await ensureManagerProfile()
  if (!profile) {
    return { error: '특강을 수정할 권한이 없습니다.' }
  }
  if (!id) {
    return { error: '특강 정보를 확인할 수 없습니다.' }
  }

  const supabase = await createServerSupabase()
  const { error } = await supabase
    .from('special_lectures')
    .update({ is_published: nextPublished })
    .eq('id', id)

  if (error) {
    console.error('[special-lectures] toggle publish error', error)
    return { error: '게시 상태를 변경하지 못했습니다.' }
  }

  revalidateAll(id)
  return { success: true, lectureId: id }
}
