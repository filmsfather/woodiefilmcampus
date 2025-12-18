'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'

import { getAuthContext } from '@/lib/auth'
import {
  ADMISSION_MATERIALS_BUCKET,
  type AdmissionMaterialAssetType,
  type AdmissionMaterialCategory,
  isAdmissionMaterialAllowedRole,
  isAdmissionMaterialCategory,
  getAdmissionCategoryLabel,
} from '@/lib/admission-materials'
import { PAST_EXAM_UNIVERSITIES } from '@/lib/admission-materials-constants'
import DateUtil from '@/lib/date-util'
import { createClient as createServerSupabase } from '@/lib/supabase/server'

const MAX_UPLOAD_SIZE = 50 * 1024 * 1024 // 50MB

export type AdmissionScheduleInput = {
  title: string
  startAt: string
  endAt?: string | null
  location?: string | null
  memo?: string | null
}

type ActionResult = {
  success?: boolean
  error?: string
  postId?: string
}

type DeleteResult = {
  success?: boolean
  error?: string
}

type ScheduleListResult = {
  success: true
  events: AdmissionCalendarEvent[]
} | {
  success: false
  error: string
}

export type AdmissionCalendarEvent = {
  id: string
  postId: string
  category: AdmissionMaterialCategory
  categoryLabel: string
  postTitle: string
  postTargetLevel: string | null
  postUniversity: string | null
  scheduleTitle: string
  startAt: string
  endAt: string | null
  location: string | null
  memo: string | null
}

function normalizeUniversityName(raw: string | null): string | null {
  if (!raw) {
    return null
  }

  const trimmed = raw.trim()
  if (trimmed.length === 0) {
    return null
  }

  for (const name of PAST_EXAM_UNIVERSITIES) {
    if (trimmed === name) {
      return name
    }
  }

  for (const name of PAST_EXAM_UNIVERSITIES) {
    if (trimmed.includes(name)) {
      return name
    }
  }

  return trimmed
}

function sanitizeFileName(name: string) {
  if (!name) {
    return 'upload.dat'
  }
  return name.replace(/[^a-zA-Z0-9_.-]/g, '_')
}

function revalidateAdmissionPaths(category: AdmissionMaterialCategory, postId?: string) {
  revalidatePath('/dashboard/teacher/admission-materials')
  revalidatePath(`/dashboard/teacher/admission-materials/${category}`)
  if (postId) {
    revalidatePath(`/dashboard/teacher/admission-materials/${category}/${postId}`)
    revalidatePath(`/dashboard/teacher/admission-materials/${category}/${postId}/edit`)
  }
  revalidatePath('/dashboard/teacher/admission-materials/calendar')
  revalidatePath('/dashboard/teacher')
  revalidatePath('/dashboard/manager')
  revalidatePath('/dashboard/principal')
}

async function uploadAdmissionFile(
  file: File,
  category: AdmissionMaterialCategory,
  postId: string,
  kind: AdmissionMaterialAssetType,
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  ownerId: string
) {
  const sanitizedName = sanitizeFileName(file.name)
  const storagePath = `${category}/${postId}/${kind}/${randomUUID()}-${sanitizedName}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error: uploadError } = await supabase.storage.from(ADMISSION_MATERIALS_BUCKET).upload(storagePath, buffer, {
    cacheControl: '3600',
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  })

  if (uploadError) {
    console.error('[admission-materials] storage upload failed', uploadError)
    throw new Error('파일 업로드에 실패했습니다.')
  }

  const { data: asset, error: assetError } = await supabase
    .from('media_assets')
    .insert({
      owner_id: ownerId,
      scope: 'admission_material',
      bucket: ADMISSION_MATERIALS_BUCKET,
      path: storagePath,
      mime_type: file.type || null,
      size: file.size,
      metadata: {
        originalName: sanitizedName,
        kind,
      },
    })
    .select('id')
    .single()

  if (assetError || !asset?.id) {
    console.error('[admission-materials] media_assets insert failed', assetError)
    await supabase.storage.from(ADMISSION_MATERIALS_BUCKET).remove([storagePath])
    throw new Error('파일 정보를 저장하지 못했습니다.')
  }

  return {
    assetId: asset.id as string,
    storagePath,
  }
}

async function removeAdmissionAsset(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  assetId: string | null | undefined,
  storagePath: string | null | undefined
) {
  if (storagePath) {
    const { error: removeError } = await supabase.storage.from(ADMISSION_MATERIALS_BUCKET).remove([storagePath])
    if (removeError) {
      console.error('[admission-materials] failed to remove storage object', removeError)
    }
  }

  if (assetId) {
    const { error: deleteError } = await supabase.from('media_assets').delete().eq('id', assetId)
    if (deleteError) {
      console.error('[admission-materials] failed to delete media asset', deleteError)
    }
  }
}

function parseSchedulePayload(raw: unknown): AdmissionScheduleInput[] {
  if (!raw) {
    return []
  }

  if (typeof raw !== 'string') {
    throw new Error('일정 데이터 형식이 올바르지 않습니다.')
  }

  if (raw.trim().length === 0) {
    return []
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    console.error('[admission-materials] schedule parse error', error)
    throw new Error('일정 데이터를 해석하지 못했습니다.')
  }

  if (!Array.isArray(parsed)) {
    throw new Error('일정 데이터 형식이 올바르지 않습니다.')
  }

  const schedules: AdmissionScheduleInput[] = []

  for (const item of parsed) {
    if (!item || typeof item !== 'object') {
      continue
    }

    const data = item as Record<string, unknown>
    const title = typeof data.title === 'string' ? data.title.trim() : ''
    const startAt = typeof data.startAt === 'string' ? data.startAt.trim() : ''
    const endAtRaw = typeof data.endAt === 'string' ? data.endAt.trim() : ''
    const location = typeof data.location === 'string' ? data.location.trim() : ''
    const memo = typeof data.memo === 'string' ? data.memo.trim() : ''

    if (!title) {
      throw new Error('일정 제목을 입력해주세요.')
    }

    if (!startAt) {
      throw new Error('일정 시작 시각을 입력해주세요.')
    }

    const startDate = new Date(startAt)
    if (Number.isNaN(startDate.getTime())) {
      throw new Error('일정 시작 시각 형식이 올바르지 않습니다.')
    }

    let endAt: string | null = null
    if (endAtRaw) {
      const endDate = new Date(endAtRaw)
      if (Number.isNaN(endDate.getTime())) {
        throw new Error('일정 종료 시각 형식이 올바르지 않습니다.')
      }
      endAt = endDate.toISOString()
    }

    schedules.push({
      title,
      startAt: startDate.toISOString(),
      endAt,
      location: location || null,
      memo: memo || null,
    })
  }

  return schedules
}

export async function createAdmissionMaterialPost(formData: FormData): Promise<ActionResult> {
  const { profile } = await getAuthContext()

  if (!profile?.role || !isAdmissionMaterialAllowedRole(profile.role)) {
    return { error: '입시 자료를 등록할 권한이 없습니다.' }
  }

  const categoryValue = formData.get('category')
  const titleValue = formData.get('title')

  if (typeof categoryValue !== 'string' || !isAdmissionMaterialCategory(categoryValue)) {
    return { error: '유효한 카테고리가 아닙니다.' }
  }

  if (typeof titleValue !== 'string' || titleValue.trim().length === 0) {
    return { error: '제목을 입력해주세요.' }
  }

  const category = categoryValue
  const title = titleValue.trim()
  const targetLevelValue = formData.get('targetLevel')
  const descriptionValue = formData.get('description')
  const schedulesRaw = formData.get('schedules')
  const guideFile = formData.get('guideFile')
  const resourceFile = formData.get('resourceFile')
  const pastExamYearValue = formData.get('pastExamYear')
  const pastExamUniversityValue = formData.get('pastExamUniversity')
  const pastExamAdmissionTypesValue = formData.get('pastExamAdmissionTypes')

  if (guideFile instanceof File && guideFile.size > MAX_UPLOAD_SIZE) {
    return { error: '가이드 파일 용량이 제한을 초과했습니다.' }
  }

  if (resourceFile instanceof File && resourceFile.size > MAX_UPLOAD_SIZE) {
    return { error: '참고 자료 파일 용량이 제한을 초과했습니다.' }
  }

  const trimmedTargetLevel =
    typeof targetLevelValue === 'string' && targetLevelValue.trim().length > 0 ? targetLevelValue.trim() : null

  let pastExamYear: number | null = null
  let pastExamUniversity: string | null = null
  let pastExamAdmissionTypes: string[] | null = null

  const isPastExamLike = category === 'past_exam' || category === 'success_review'

  if (isPastExamLike) {
    if (typeof pastExamYearValue !== 'string' || pastExamYearValue.trim().length === 0) {
      return { error: '연도를 선택해주세요.' }
    }

    const parsedYear = Number.parseInt(pastExamYearValue, 10)
    if (!Number.isFinite(parsedYear) || parsedYear < 2000 || parsedYear > 2100) {
      return { error: '연도를 다시 확인해주세요.' }
    }

    if (typeof pastExamUniversityValue !== 'string' || pastExamUniversityValue.trim().length === 0) {
      return { error: '대학교를 선택해주세요.' }
    }

    if (typeof pastExamAdmissionTypesValue !== 'string' || pastExamAdmissionTypesValue.trim().length === 0) {
      return { error: '수시 또는 정시를 최소 한 개 이상 선택해주세요.' }
    }

    let parsedAdmissionTypes: unknown
    try {
      parsedAdmissionTypes = JSON.parse(pastExamAdmissionTypesValue)
    } catch (error) {
      console.error('[admission-materials] failed to parse past exam admission types', error)
      return { error: '전형 정보를 처리하지 못했습니다.' }
    }

    if (!Array.isArray(parsedAdmissionTypes) || parsedAdmissionTypes.length === 0) {
      return { error: '수시 또는 정시를 최소 한 개 이상 선택해주세요.' }
    }

    const normalizedAdmissions = parsedAdmissionTypes
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter((item) => item.length > 0)

    const isValidAdmissions =
      normalizedAdmissions.length > 0 &&
      normalizedAdmissions.every((item) => item === '수시' || item === '정시')

    if (!isValidAdmissions) {
      return { error: '전형 정보가 올바르지 않습니다.' }
    }

    pastExamYear = parsedYear
    pastExamUniversity = pastExamUniversityValue.trim()
    pastExamAdmissionTypes = normalizedAdmissions
  }

  if (category === 'guideline' && !trimmedTargetLevel) {
    return { error: '대학교 이름을 입력해주세요.' }
  }

  let schedules: AdmissionScheduleInput[] = []
  try {
    schedules = parseSchedulePayload(schedulesRaw)
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : '일정 정보를 처리하지 못했습니다.',
    }
  }

  const supabase = await createServerSupabase()
  const postId = randomUUID()
  const uploadedAssets: Array<{ assetId: string; storagePath: string }> = []

  try {
    let guideAssetId: string | null = null
    let resourceAssetId: string | null = null

    if (guideFile instanceof File && guideFile.size > 0) {
      const upload = await uploadAdmissionFile(guideFile, category, postId, 'guide', supabase, profile.id)
      guideAssetId = upload.assetId
      uploadedAssets.push(upload)
    }

    if (resourceFile instanceof File && resourceFile.size > 0) {
      const upload = await uploadAdmissionFile(resourceFile, category, postId, 'resource', supabase, profile.id)
      resourceAssetId = upload.assetId
      uploadedAssets.push(upload)
    }

    const { error: insertError } = await supabase.from('admission_material_posts').insert({
      id: postId,
      category,
      target_level: trimmedTargetLevel,
      title,
      description: typeof descriptionValue === 'string' && descriptionValue.trim().length > 0 ? descriptionValue.trim() : null,
      past_exam_year: pastExamYear,
      past_exam_university: pastExamUniversity,
      past_exam_admission_types: pastExamAdmissionTypes,
      guide_asset_id: guideAssetId,
      resource_asset_id: resourceAssetId,
      created_by: profile.id,
    })

    if (insertError) {
      console.error('[admission-materials] failed to insert post', insertError, { category, postId })
      throw new Error('입시 자료를 저장하지 못했습니다.')
    }

    if (schedules.length > 0) {
      const schedulePayload = schedules.map((schedule) => ({
        post_id: postId,
        title: schedule.title,
        start_at: schedule.startAt,
        end_at: schedule.endAt ?? null,
        location: schedule.location ?? null,
        memo: schedule.memo ?? null,
      }))

      const { error: scheduleError } = await supabase.from('admission_material_schedules').insert(schedulePayload)

      if (scheduleError) {
        console.error('[admission-materials] failed to insert schedules', scheduleError)
        throw new Error('일정 정보를 저장하지 못했습니다.')
      }
    }

    revalidateAdmissionPaths(category, postId)

    return { success: true, postId }
  } catch (error) {
    console.error('[admission-materials] create post error', error)

    for (const asset of uploadedAssets) {
      await removeAdmissionAsset(supabase, asset.assetId, asset.storagePath)
    }

    return {
      error: error instanceof Error ? error.message : '자료 등록 중 문제가 발생했습니다.',
    }
  }
}

export async function updateAdmissionMaterialPost(formData: FormData): Promise<ActionResult> {
  const { profile } = await getAuthContext()

  if (!profile?.role || !isAdmissionMaterialAllowedRole(profile.role)) {
    return { error: '입시 자료를 수정할 권한이 없습니다.' }
  }

  const categoryValue = formData.get('category')
  const postIdValue = formData.get('postId')
  const titleValue = formData.get('title')

  if (typeof categoryValue !== 'string' || !isAdmissionMaterialCategory(categoryValue)) {
    return { error: '유효한 카테고리가 아닙니다.' }
  }

  if (typeof postIdValue !== 'string' || postIdValue.length === 0) {
    return { error: '자료 정보를 확인할 수 없습니다.' }
  }

  if (typeof titleValue !== 'string' || titleValue.trim().length === 0) {
    return { error: '제목을 입력해주세요.' }
  }

  const category = categoryValue
  const postId = postIdValue
  const title = titleValue.trim()
  const targetLevelValue = formData.get('targetLevel')
  const descriptionValue = formData.get('description')
  const removeGuideValue = formData.get('removeGuide')
  const removeResourceValue = formData.get('removeResource')
  const guideFile = formData.get('guideFile')
  const resourceFile = formData.get('resourceFile')
  const schedulesRaw = formData.get('schedules')
  const pastExamYearValue = formData.get('pastExamYear')
  const pastExamUniversityValue = formData.get('pastExamUniversity')
  const pastExamAdmissionTypesValue = formData.get('pastExamAdmissionTypes')

  if (guideFile instanceof File && guideFile.size > MAX_UPLOAD_SIZE) {
    return { error: '가이드 파일 용량이 제한을 초과했습니다.' }
  }

  if (resourceFile instanceof File && resourceFile.size > MAX_UPLOAD_SIZE) {
    return { error: '참고 자료 파일 용량이 제한을 초과했습니다.' }
  }

  const trimmedTargetLevel =
    typeof targetLevelValue === 'string' && targetLevelValue.trim().length > 0 ? targetLevelValue.trim() : null

  let pastExamYear: number | null = null
  let pastExamUniversity: string | null = null
  let pastExamAdmissionTypes: string[] | null = null

  const isPastExamLike = category === 'past_exam' || category === 'success_review'

  if (isPastExamLike) {
    if (typeof pastExamYearValue !== 'string' || pastExamYearValue.trim().length === 0) {
      return { error: '연도를 선택해주세요.', postId }
    }

    const parsedYear = Number.parseInt(pastExamYearValue, 10)
    if (!Number.isFinite(parsedYear) || parsedYear < 2000 || parsedYear > 2100) {
      return { error: '연도를 다시 확인해주세요.', postId }
    }

    if (typeof pastExamUniversityValue !== 'string' || pastExamUniversityValue.trim().length === 0) {
      return { error: '대학교를 선택해주세요.', postId }
    }

    if (typeof pastExamAdmissionTypesValue !== 'string' || pastExamAdmissionTypesValue.trim().length === 0) {
      return { error: '수시 또는 정시를 최소 한 개 이상 선택해주세요.', postId }
    }

    let parsedAdmissionTypes: unknown
    try {
      parsedAdmissionTypes = JSON.parse(pastExamAdmissionTypesValue)
    } catch (error) {
      console.error('[admission-materials] failed to parse past exam admission types', error, { postId })
      return { error: '전형 정보를 처리하지 못했습니다.', postId }
    }

    if (!Array.isArray(parsedAdmissionTypes) || parsedAdmissionTypes.length === 0) {
      return { error: '수시 또는 정시를 최소 한 개 이상 선택해주세요.', postId }
    }

    const normalizedAdmissions = parsedAdmissionTypes
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter((item) => item.length > 0)

    const isValidAdmissions =
      normalizedAdmissions.length > 0 &&
      normalizedAdmissions.every((item) => item === '수시' || item === '정시')

    if (!isValidAdmissions) {
      return { error: '전형 정보가 올바르지 않습니다.', postId }
    }

    pastExamYear = parsedYear
    pastExamUniversity = pastExamUniversityValue.trim()
    pastExamAdmissionTypes = normalizedAdmissions
  }

  if (category === 'guideline' && !trimmedTargetLevel) {
    return { error: '대학교 이름을 입력해주세요.', postId }
  }

  let schedules: AdmissionScheduleInput[] = []
  try {
    schedules = parseSchedulePayload(schedulesRaw)
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : '일정 정보를 처리하지 못했습니다.',
      postId,
    }
  }

  const supabase = await createServerSupabase()

  const { data: existing, error: fetchError } = await supabase
    .from('admission_material_posts')
    .select(
      `id,
       category,
       guide_asset_id,
       resource_asset_id,
       guide_asset:media_assets!admission_material_posts_guide_asset_id_fkey(id, path),
       resource_asset:media_assets!admission_material_posts_resource_asset_id_fkey(id, path)
      `
    )
    .eq('id', postId)
    .maybeSingle()

  if (fetchError) {
    console.error('[admission-materials] failed to load post for update', fetchError)
    return { error: '자료 정보를 불러오지 못했습니다.' }
  }

  if (!existing) {
    return { error: '자료를 찾을 수 없습니다.' }
  }

  if (existing.category !== category) {
    return { error: '카테고리 정보가 일치하지 않습니다.' }
  }

  const currentGuideAsset = Array.isArray(existing.guide_asset) ? existing.guide_asset[0] : existing.guide_asset
  const currentResourceAsset = Array.isArray(existing.resource_asset) ? existing.resource_asset[0] : existing.resource_asset

  const uploadedAssets: Array<{ assetId: string; storagePath: string; kind: AdmissionMaterialAssetType }> = []
  const assetsToRemove: Array<{ assetId: string | null | undefined; storagePath: string | null | undefined }> = []

  try {
    let guideAssetId: string | null = existing.guide_asset_id as string | null
    let resourceAssetId: string | null = existing.resource_asset_id as string | null

    if (guideFile instanceof File && guideFile.size > 0) {
      const upload = await uploadAdmissionFile(guideFile, category, postId, 'guide', supabase, profile.id)
      uploadedAssets.push({ ...upload, kind: 'guide' })
      assetsToRemove.push({ assetId: currentGuideAsset?.id, storagePath: currentGuideAsset?.path })
      guideAssetId = upload.assetId
    } else if (removeGuideValue === '1') {
      assetsToRemove.push({ assetId: currentGuideAsset?.id, storagePath: currentGuideAsset?.path })
      guideAssetId = null
    }

    if (resourceFile instanceof File && resourceFile.size > 0) {
      const upload = await uploadAdmissionFile(resourceFile, category, postId, 'resource', supabase, profile.id)
      uploadedAssets.push({ ...upload, kind: 'resource' })
      assetsToRemove.push({ assetId: currentResourceAsset?.id, storagePath: currentResourceAsset?.path })
      resourceAssetId = upload.assetId
    } else if (removeResourceValue === '1') {
      assetsToRemove.push({ assetId: currentResourceAsset?.id, storagePath: currentResourceAsset?.path })
      resourceAssetId = null
    }

    const { error: updateError } = await supabase
      .from('admission_material_posts')
      .update({
        target_level: trimmedTargetLevel,
        title,
        description: typeof descriptionValue === 'string' && descriptionValue.trim().length > 0 ? descriptionValue.trim() : null,
        guide_asset_id: guideAssetId,
        resource_asset_id: resourceAssetId,
        past_exam_year: pastExamYear,
        past_exam_university: pastExamUniversity,
        past_exam_admission_types: pastExamAdmissionTypes,
        updated_at: DateUtil.nowUTC().toISOString(),
      })
      .eq('id', postId)

    if (updateError) {
      console.error('[admission-materials] failed to update post', updateError)
      throw new Error('자료를 수정하지 못했습니다.')
    }

    for (const asset of assetsToRemove) {
      await removeAdmissionAsset(supabase, asset.assetId ?? null, asset.storagePath ?? null)
    }

    const { error: deleteExistingSchedulesError } = await supabase
      .from('admission_material_schedules')
      .delete()
      .eq('post_id', postId)

    if (deleteExistingSchedulesError) {
      console.error('[admission-materials] failed to clear schedules', deleteExistingSchedulesError)
      throw new Error('기존 일정 정보를 갱신하지 못했습니다.')
    }

    if (schedules.length > 0) {
      const schedulePayload = schedules.map((schedule) => ({
        post_id: postId,
        title: schedule.title,
        start_at: schedule.startAt,
        end_at: schedule.endAt ?? null,
        location: schedule.location ?? null,
        memo: schedule.memo ?? null,
      }))

      const { error: insertSchedulesError } = await supabase
        .from('admission_material_schedules')
        .insert(schedulePayload)

      if (insertSchedulesError) {
        console.error('[admission-materials] failed to insert schedules', insertSchedulesError)
        throw new Error('일정 정보를 저장하지 못했습니다.')
      }
    }

    revalidateAdmissionPaths(category, postId)

    return { success: true, postId }
  } catch (error) {
    console.error('[admission-materials] update post error', error)

    for (const asset of uploadedAssets) {
      await removeAdmissionAsset(supabase, asset.assetId, asset.storagePath)
    }

    return {
      error: error instanceof Error ? error.message : '자료 수정 중 오류가 발생했습니다.',
      postId,
    }
  }
}

export async function deleteAdmissionMaterialPost(postId: string): Promise<DeleteResult> {
  const { profile } = await getAuthContext()

  if (!profile?.role || !isAdmissionMaterialAllowedRole(profile.role)) {
    return { error: '자료를 삭제할 권한이 없습니다.' }
  }

  if (!postId) {
    return { error: '자료 정보를 확인할 수 없습니다.' }
  }

  const supabase = await createServerSupabase()

  const { data: existing, error: fetchError } = await supabase
    .from('admission_material_posts')
    .select(
      `id,
       category,
       guide_asset:media_assets!admission_material_posts_guide_asset_id_fkey(id, path),
       resource_asset:media_assets!admission_material_posts_resource_asset_id_fkey(id, path)
      `
    )
    .eq('id', postId)
    .maybeSingle()

  if (fetchError) {
    console.error('[admission-materials] failed to load post for delete', fetchError)
    return { error: '자료 정보를 불러오지 못했습니다.' }
  }

  if (!existing) {
    return { error: '자료를 찾을 수 없습니다.' }
  }

  const category = existing.category as AdmissionMaterialCategory
  const guideAsset = Array.isArray(existing.guide_asset) ? existing.guide_asset[0] : existing.guide_asset
  const resourceAsset = Array.isArray(existing.resource_asset) ? existing.resource_asset[0] : existing.resource_asset

  const { error: deleteError } = await supabase.from('admission_material_posts').delete().eq('id', postId)

  if (deleteError) {
    console.error('[admission-materials] failed to delete post', deleteError)
    return { error: '자료 삭제에 실패했습니다.' }
  }

  await removeAdmissionAsset(supabase, guideAsset?.id ?? null, guideAsset?.path ?? null)
  await removeAdmissionAsset(supabase, resourceAsset?.id ?? null, resourceAsset?.path ?? null)

  revalidateAdmissionPaths(category)

  return { success: true }
}

export async function listAdmissionScheduleEvents(params: {
  start?: string
  end?: string
}): Promise<ScheduleListResult> {
  const { profile } = await getAuthContext()

  if (!profile?.role || !isAdmissionMaterialAllowedRole(profile.role)) {
    return { success: false, error: '일정을 조회할 권한이 없습니다.' }
  }

  const supabase = await createServerSupabase()
  let query = supabase
    .from('admission_material_schedules')
    .select(
      `id,
       post_id,
       title,
       start_at,
       end_at,
       location,
       memo,
       admission_material_posts!inner (
         id,
         category,
         title,
         target_level,
         past_exam_university
       )
      `
    )

  if (params.start) {
    query = query.gte('start_at', params.start)
  }

  if (params.end) {
    query = query.lte('start_at', params.end)
  }

  query = query.order('start_at', { ascending: true })

  const { data, error } = await query

  if (error) {
    console.error('[admission-materials] failed to load schedule events', error)
    return { success: false, error: '일정 정보를 불러오지 못했습니다.' }
  }

  const events: AdmissionCalendarEvent[] = (data ?? []).map((row) => {
    const postRelation = Array.isArray(row.admission_material_posts)
      ? row.admission_material_posts[0]
      : row.admission_material_posts

    const category = String(postRelation?.category ?? 'notice') as AdmissionMaterialCategory
    const postRecord =
      postRelation && typeof postRelation === 'object' ? (postRelation as Record<string, unknown>) : null
    const rawTargetLevel =
      postRecord && postRecord.target_level !== undefined
        ? (postRecord.target_level === null ? null : String(postRecord.target_level))
        : null
    const rawPastExamUniversity =
      postRecord && postRecord.past_exam_university !== undefined
        ? (postRecord.past_exam_university === null ? null : String(postRecord.past_exam_university))
        : null
    const postUniversity = normalizeUniversityName(
      category === 'guideline' ? rawTargetLevel : rawPastExamUniversity ?? rawTargetLevel
    )

    return {
      id: String(row.id),
      postId: String(row.post_id),
      category,
      categoryLabel: getAdmissionCategoryLabel(category),
      postTitle: postRelation?.title ? String(postRelation.title) : '입시 자료',
      postTargetLevel: rawTargetLevel,
      postUniversity,
      scheduleTitle: String(row.title),
      startAt: String(row.start_at),
      endAt: row.end_at ? String(row.end_at) : null,
      location: row.location ? String(row.location) : null,
      memo: row.memo ? String(row.memo) : null,
    }
  })

  return { success: true, events }
}
