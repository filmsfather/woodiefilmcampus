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

const MAX_UPLOAD_SIZE = 20 * 1024 * 1024 // 20MB

function sanitizeFileName(name: string) {
  if (!name) {
    return 'upload.dat'
  }
  return name.replace(/[^a-zA-Z0-9_.-]/g, '_')
}

async function uploadMaterialFile(
  file: File,
  subject: ClassMaterialSubject,
  postId: string,
  kind: 'class_material' | 'student_handout',
  supabase: ReturnType<typeof createServerSupabase>,
  ownerId: string
) {
  const sanitizedName = sanitizeFileName(file.name)
  const storagePath = `${subject}/${postId}/${kind}/${randomUUID()}-${sanitizedName}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error: uploadError } = await supabase.storage.from(CLASS_MATERIALS_BUCKET).upload(storagePath, buffer, {
    cacheControl: '3600',
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  })

  if (uploadError) {
    console.error('[class-materials] storage upload failed', uploadError)
    throw new Error('파일 업로드에 실패했습니다.')
  }

  const { data: asset, error: assetError } = await supabase
    .from('media_assets')
    .insert({
      owner_id: ownerId,
      scope: 'class_material',
      bucket: CLASS_MATERIALS_BUCKET,
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
    console.error('[class-materials] media_assets insert failed', assetError)
    await supabase.storage.from(CLASS_MATERIALS_BUCKET).remove([storagePath])
    throw new Error('파일 정보를 저장하지 못했습니다.')
  }

  return {
    assetId: asset.id as string,
    storagePath,
  }
}

async function removeAsset(
  supabase: ReturnType<typeof createServerSupabase>,
  assetId: string | null | undefined,
  storagePath: string | null | undefined
) {
  if (!assetId && !storagePath) {
    return
  }

  if (storagePath) {
    const { error: removeError } = await supabase.storage.from(CLASS_MATERIALS_BUCKET).remove([storagePath])
    if (removeError) {
      console.error('[class-materials] failed to remove storage object', removeError)
    }
  }

  if (assetId) {
    const { error: deleteError } = await supabase.from('media_assets').delete().eq('id', assetId)
    if (deleteError) {
      console.error('[class-materials] failed to delete media asset', deleteError)
    }
  }
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
  const classMaterialFile = formData.get('classMaterialFile')
  const studentHandoutFile = formData.get('studentHandoutFile')

  if (classMaterialFile instanceof File && classMaterialFile.size > MAX_UPLOAD_SIZE) {
    return { error: '수업자료 파일 용량이 제한을 초과했습니다.' }
  }

  if (studentHandoutFile instanceof File && studentHandoutFile.size > MAX_UPLOAD_SIZE) {
    return { error: '학생 유인물 파일 용량이 제한을 초과했습니다.' }
  }

  const supabase = createServerSupabase()
  const postId = randomUUID()

  const uploadedAssets: Array<{ assetId: string; storagePath: string }> = []

  try {
    let classMaterialAssetId: string | null = null
    let studentHandoutAssetId: string | null = null

    if (classMaterialFile instanceof File && classMaterialFile.size > 0) {
      const upload = await uploadMaterialFile(classMaterialFile, subject, postId, 'class_material', supabase, profile.id)
      classMaterialAssetId = upload.assetId
      uploadedAssets.push(upload)
    }

    if (studentHandoutFile instanceof File && studentHandoutFile.size > 0) {
      const upload = await uploadMaterialFile(studentHandoutFile, subject, postId, 'student_handout', supabase, profile.id)
      studentHandoutAssetId = upload.assetId
      uploadedAssets.push(upload)
    }

    const { error: insertError } = await supabase.from('class_material_posts').insert({
      id: postId,
      subject,
      week_label: weekLabel || null,
      title,
      description: description || null,
      class_material_asset_id: classMaterialAssetId,
      student_handout_asset_id: studentHandoutAssetId,
      created_by: profile.id,
    })

    if (insertError) {
      console.error('[class-materials] failed to insert post', insertError)
      throw new Error('수업자료를 저장하지 못했습니다.')
    }

    revalidateMaterialPaths(subject, postId)

    return { success: true, postId }
  } catch (error) {
    console.error('[class-materials] create post error', error)

    for (const asset of uploadedAssets) {
      await removeAsset(supabase, asset.assetId, asset.storagePath)
    }

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
  const removeClassMaterialValue = formData.get('removeClassMaterial')
  const removeStudentHandoutValue = formData.get('removeStudentHandout')
  const weekLabel = typeof weekLabelValue === 'string' ? weekLabelValue.trim() : ''
  const description = typeof descriptionValue === 'string' ? descriptionValue.trim() : ''
  const removeClassMaterial = removeClassMaterialValue === '1'
  const removeStudentHandout = removeStudentHandoutValue === '1'

  const classMaterialFile = formData.get('classMaterialFile')
  const studentHandoutFile = formData.get('studentHandoutFile')

  if (classMaterialFile instanceof File && classMaterialFile.size > MAX_UPLOAD_SIZE) {
    return { error: '수업자료 파일 용량이 제한을 초과했습니다.' }
  }

  if (studentHandoutFile instanceof File && studentHandoutFile.size > MAX_UPLOAD_SIZE) {
    return { error: '학생 유인물 파일 용량이 제한을 초과했습니다.' }
  }

  const supabase = createServerSupabase()

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

  const currentClassMaterialAsset = Array.isArray(existing.class_material_asset)
    ? existing.class_material_asset[0]
    : existing.class_material_asset
  const currentStudentHandoutAsset = Array.isArray(existing.student_handout_asset)
    ? existing.student_handout_asset[0]
    : existing.student_handout_asset

  const uploadedAssets: Array<{ assetId: string; storagePath: string; kind: 'class_material' | 'student_handout' }> = []
  const assetsToRemove: Array<{ assetId: string | null | undefined; storagePath: string | null | undefined }> = []

  try {
    let classMaterialAssetId: string | null = existing.class_material_asset_id as string | null
    let studentHandoutAssetId: string | null = existing.student_handout_asset_id as string | null

    if (classMaterialFile instanceof File && classMaterialFile.size > 0) {
      const upload = await uploadMaterialFile(classMaterialFile, subject, postId, 'class_material', supabase, profile.id)
      uploadedAssets.push({ ...upload, kind: 'class_material' })
      assetsToRemove.push({
        assetId: currentClassMaterialAsset?.id,
        storagePath: currentClassMaterialAsset?.path,
      })
      classMaterialAssetId = upload.assetId
    } else if (removeClassMaterial) {
      assetsToRemove.push({
        assetId: currentClassMaterialAsset?.id,
        storagePath: currentClassMaterialAsset?.path,
      })
      classMaterialAssetId = null
    }

    if (studentHandoutFile instanceof File && studentHandoutFile.size > 0) {
      const upload = await uploadMaterialFile(studentHandoutFile, subject, postId, 'student_handout', supabase, profile.id)
      uploadedAssets.push({ ...upload, kind: 'student_handout' })
      assetsToRemove.push({
        assetId: currentStudentHandoutAsset?.id,
        storagePath: currentStudentHandoutAsset?.path,
      })
      studentHandoutAssetId = upload.assetId
    } else if (removeStudentHandout) {
      assetsToRemove.push({
        assetId: currentStudentHandoutAsset?.id,
        storagePath: currentStudentHandoutAsset?.path,
      })
      studentHandoutAssetId = null
    }

    const { error: updateError } = await supabase
      .from('class_material_posts')
      .update({
        week_label: weekLabel || null,
        title,
        description: description || null,
        class_material_asset_id: classMaterialAssetId,
        student_handout_asset_id: studentHandoutAssetId,
      })
      .eq('id', postId)

    if (updateError) {
      console.error('[class-materials] failed to update post', updateError)
      throw new Error('자료를 수정하지 못했습니다.')
    }

    for (const asset of assetsToRemove) {
      await removeAsset(supabase, asset.assetId ?? null, asset.storagePath ?? null)
    }

    revalidateMaterialPaths(subject, postId)

    return { success: true, postId }
  } catch (error) {
    console.error('[class-materials] update post error', error)

    for (const asset of uploadedAssets) {
      await removeAsset(supabase, asset.assetId, asset.storagePath)
    }

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

  const supabase = createServerSupabase()

  const { data: existing, error: fetchError } = await supabase
    .from('class_material_posts')
    .select(
      `id,
       subject,
       class_material_asset:media_assets!class_material_posts_class_material_asset_id_fkey(id, path),
       student_handout_asset:media_assets!class_material_posts_student_handout_asset_id_fkey(id, path)
      `
    )
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

  const { error: deleteError } = await supabase.from('class_material_posts').delete().eq('id', postId)

  if (deleteError) {
    console.error('[class-materials] failed to delete post', deleteError)
    return { error: '자료 삭제에 실패했습니다.' }
  }

  const currentClassMaterialAsset = Array.isArray(existing.class_material_asset)
    ? existing.class_material_asset[0]
    : existing.class_material_asset
  const currentStudentHandoutAsset = Array.isArray(existing.student_handout_asset)
    ? existing.student_handout_asset[0]
    : existing.student_handout_asset

  await removeAsset(
    supabase,
    currentClassMaterialAsset?.id ?? null,
    currentClassMaterialAsset?.path ?? null
  )
  await removeAsset(
    supabase,
    currentStudentHandoutAsset?.id ?? null,
    currentStudentHandoutAsset?.path ?? null
  )

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
  const selectedAssetsRaw = formData.getAll('selectedAssets')

  if (typeof postIdValue !== 'string' || postIdValue.length === 0) {
    return { error: '자료 정보를 확인할 수 없습니다.' }
  }

  const normalizedSelectedAssets = Array.from(
    new Set(
      selectedAssetsRaw
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter((value): value is ClassMaterialAssetType => value === 'class_material' || value === 'student_handout')
    )
  )

  if (normalizedSelectedAssets.length === 0) {
    return { error: '인쇄할 파일을 선택해주세요.' }
  }

  const supabase = createServerSupabase()

  const { data: post, error: fetchError } = await supabase
    .from('class_material_posts')
    .select(
      `id,
       subject,
       title,
       class_material_asset_id,
       student_handout_asset_id,
       class_material_asset:media_assets!class_material_posts_class_material_asset_id_fkey(id, bucket, path, metadata),
       student_handout_asset:media_assets!class_material_posts_student_handout_asset_id_fkey(id, bucket, path, metadata)
      `
    )
    .eq('id', postIdValue)
    .maybeSingle()

  if (fetchError) {
    console.error('[class-materials] failed to load post for print request', fetchError)
    return { error: '자료 정보를 불러오지 못했습니다.' }
  }

  if (!post) {
    return { error: '자료를 찾을 수 없습니다.' }
  }

  const classMaterialAsset = Array.isArray(post.class_material_asset)
    ? post.class_material_asset[0]
    : post.class_material_asset
  const studentHandoutAsset = Array.isArray(post.student_handout_asset)
    ? post.student_handout_asset[0]
    : post.student_handout_asset

  const assetLookup: Record<ClassMaterialAssetType, { assetId: string | null; filename: string | null }> = {
    class_material: {
      assetId: (post.class_material_asset_id as string | null) ?? (classMaterialAsset?.id ?? null),
      filename:
        ((classMaterialAsset?.metadata as { originalName?: string } | null)?.originalName ?? null) ??
        (classMaterialAsset?.path ? classMaterialAsset.path.split('/').pop() ?? classMaterialAsset.path : null),
    },
    student_handout: {
      assetId: (post.student_handout_asset_id as string | null) ?? (studentHandoutAsset?.id ?? null),
      filename:
        ((studentHandoutAsset?.metadata as { originalName?: string } | null)?.originalName ?? null) ??
        (studentHandoutAsset?.path ? studentHandoutAsset.path.split('/').pop() ?? studentHandoutAsset.path : null),
    },
  }

  for (const assetType of normalizedSelectedAssets) {
    if (!assetLookup[assetType].assetId) {
      return { error: assetType === 'class_material' ? '수업자료 파일이 존재하지 않습니다.' : '학생 유인물 파일이 존재하지 않습니다.' }
    }
  }

  const copies = typeof copiesValue === 'string' ? Number.parseInt(copiesValue, 10) : 1
  const normalizedCopies = Number.isNaN(copies) || copies < 1 ? 1 : Math.min(copies, 100)
  const colorMode = colorModeValue === 'color' ? 'color' : 'bw'
  const desiredDate = typeof desiredDateValue === 'string' && desiredDateValue.length > 0 ? desiredDateValue : null
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

  const itemsPayload = normalizedSelectedAssets.map((assetType) => ({
    request_id: requestRow.id,
    asset_type: assetType,
    media_asset_id: assetLookup[assetType].assetId,
    asset_filename: assetLookup[assetType].filename,
  }))

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

  const supabase = createServerSupabase()

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
