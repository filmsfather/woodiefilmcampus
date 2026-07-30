'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { getAuthContext } from '@/lib/auth'
import {
  deleteWorksheetPost,
  setWorksheetPostFeatured,
  setWorksheetPostHidden,
} from '@/lib/worksheet-posts'
import {
  addWorksheetExcellentMonth,
  fetchWorksheetExcellentMonths,
  removeWorksheetExcellentPost,
  selectWorksheetExcellentPost,
  type WorksheetExcellentMonth,
} from '@/lib/worksheet-excellent'
import { createAdminClient } from '@/lib/supabase/admin'
import { SUBMISSIONS_BUCKET } from '@/lib/storage/buckets'

const STAFF_ROLES = ['teacher', 'manager', 'principal']

function isStaff(role: string): boolean {
  return STAFF_ROLES.includes(role)
}

function revalidateWorksheetPaths() {
  revalidatePath('/dashboard/student/worksheet')
  revalidatePath('/dashboard/teacher/worksheet')
}

const toggleHiddenSchema = z.object({
  postId: z.string().uuid('유효한 게시물 ID가 아닙니다.'),
  hidden: z.boolean(),
})

const toggleFeaturedSchema = z
  .object({
    postId: z.string().uuid('유효한 게시물 ID가 아닙니다.'),
    featured: z.boolean(),
    comment: z.string().trim().max(500, '코멘트는 500자 이하로 입력해주세요.').optional(),
  })
  .superRefine((value, ctx) => {
    if (value.featured) {
      const comment = value.comment?.trim() ?? ''

      if (comment.length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: '추천 코멘트를 입력해주세요.' })
      }
    }
  })

const deleteSchema = z.object({
  postId: z.string().uuid('유효한 게시물 ID가 아닙니다.'),
})

const downloadAttachmentSchema = z.object({
  postId: z.string().uuid('유효한 게시물 ID가 아닙니다.'),
  mediaAssetId: z.string().uuid('유효한 첨부 ID가 아닙니다.'),
})

export async function toggleWorksheetHidden(input: z.infer<typeof toggleHiddenSchema>) {
  const parsed = toggleHiddenSchema.safeParse(input)

  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0]?.message ?? '잘못된 요청입니다.' }
  }

  const { profile } = await getAuthContext()

  if (!profile || profile.role !== 'student') {
    return { success: false as const, error: '학생 계정으로만 숨김을 변경할 수 있습니다.' }
  }

  const result = await setWorksheetPostHidden({
    postId: parsed.data.postId,
    hidden: parsed.data.hidden,
    studentId: profile.id,
  })

  if (result.success) {
    revalidateWorksheetPaths()
  }

  return result
}

export async function toggleWorksheetFeatured(input: z.infer<typeof toggleFeaturedSchema>) {
  const parsed = toggleFeaturedSchema.safeParse(input)

  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0]?.message ?? '잘못된 요청입니다.' }
  }

  const { profile } = await getAuthContext()

  if (!profile || !isStaff(profile.role)) {
    return { success: false as const, error: '추천은 교직원만 가능합니다.' }
  }

  const result = await setWorksheetPostFeatured({
    postId: parsed.data.postId,
    featured: parsed.data.featured,
    teacherId: profile.id,
    comment: parsed.data.comment?.trim() ?? null,
  })

  if (result.success) {
    revalidateWorksheetPaths()
  }

  return result
}

export async function removeWorksheetPost(input: z.infer<typeof deleteSchema>) {
  const parsed = deleteSchema.safeParse(input)

  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0]?.message ?? '잘못된 요청입니다.' }
  }

  const { profile } = await getAuthContext()

  if (!profile || !isStaff(profile.role)) {
    return { success: false as const, error: '삭제는 교직원만 가능합니다.' }
  }

  const result = await deleteWorksheetPost({
    postId: parsed.data.postId,
    teacherId: profile.id,
  })

  if (result.success) {
    revalidateWorksheetPaths()
  }

  return result
}

export async function getWorksheetAttachmentDownload(input: z.infer<typeof downloadAttachmentSchema>) {
  const parsed = downloadAttachmentSchema.safeParse(input)

  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0]?.message ?? '잘못된 요청입니다.' }
  }

  const { profile } = await getAuthContext()

  if (!profile) {
    return { success: false as const, error: '로그인이 필요합니다.' }
  }

  const admin = createAdminClient()

  const { data: postRow, error: postError } = await admin
    .from('worksheet_posts')
    .select('id, student_id, hidden_by_student, media_asset_id')
    .eq('id', parsed.data.postId)
    .eq('is_deleted', false)
    .maybeSingle()

  if (postError) {
    console.error('[worksheet] failed to load post for attachment download', postError)
    return { success: false as const, error: '게시물을 찾을 수 없습니다.' }
  }

  if (!postRow) {
    return { success: false as const, error: '게시물을 찾을 수 없습니다.' }
  }

  const viewerIsOwner = postRow.student_id === profile.id
  const viewerIsStaff = profile.role !== 'student'

  if (postRow.hidden_by_student && !viewerIsOwner && !viewerIsStaff) {
    return { success: false as const, error: '접근 권한이 없습니다.' }
  }

  let attachmentFound = postRow.media_asset_id === parsed.data.mediaAssetId

  if (!attachmentFound) {
    const { data: attachmentRow, error: attachmentError } = await admin
      .from('worksheet_post_assets')
      .select('id')
      .eq('post_id', parsed.data.postId)
      .eq('media_asset_id', parsed.data.mediaAssetId)
      .maybeSingle()

    if (attachmentError) {
      console.error('[worksheet] failed to verify attachment ownership', attachmentError)
    }

    attachmentFound = Boolean(attachmentRow)
  }

  if (!attachmentFound) {
    return { success: false as const, error: '첨부파일을 찾을 수 없습니다.' }
  }

  const { data: assetRow, error: assetError } = await admin
    .from('media_assets')
    .select('id, bucket, path, metadata')
    .eq('id', parsed.data.mediaAssetId)
    .maybeSingle()

  if (assetError) {
    console.error('[worksheet] failed to load asset for download', assetError)
    return { success: false as const, error: '파일 정보를 가져오지 못했습니다.' }
  }

  if (!assetRow || typeof assetRow.path !== 'string' || assetRow.path.length === 0) {
    return { success: false as const, error: '파일 경로가 올바르지 않습니다.' }
  }

  const bucketId = (assetRow.bucket as string | null) ?? SUBMISSIONS_BUCKET

  try {
    const { data: signed, error: signedError } = await admin.storage
      .from(bucketId)
      .createSignedUrl(assetRow.path, 60 * 30)

    if (signedError || !signed?.signedUrl) {
      console.error('[worksheet] failed to create signed download url', signedError, {
        bucket: bucketId,
        path: assetRow.path,
      })
      return { success: false as const, error: '다운로드 URL 생성에 실패했습니다.' }
    }

    const metadata = (assetRow.metadata as Record<string, unknown> | null) ?? null
    const possibleName =
      metadata?.originalName || metadata?.original_name || metadata?.filename || metadata?.name
    const fallbackName = assetRow.path.split('/').pop() ?? '제출 사진'
    const filename = typeof possibleName === 'string' && possibleName.length > 0 ? possibleName : fallbackName

    return {
      success: true as const,
      url: signed.signedUrl,
      filename,
    }
  } catch (error) {
    console.error('[worksheet] unexpected signed url error', error)
    return { success: false as const, error: '다운로드 URL 생성 중 오류가 발생했습니다.' }
  }
}

const selectExcellentSchema = z.object({
  postId: z.string().uuid(),
  monthId: z.string().uuid(),
})

export async function selectWorksheetAsExcellent(input: z.infer<typeof selectExcellentSchema>) {
  const parsed = selectExcellentSchema.safeParse(input)

  if (!parsed.success) {
    return { success: false as const, error: '잘못된 요청입니다.' }
  }

  const { profile } = await getAuthContext()

  if (!profile || !isStaff(profile.role)) {
    return { success: false as const, error: '교직원만 우수작을 선정할 수 있습니다.' }
  }

  const result = await selectWorksheetExcellentPost(parsed.data.monthId, parsed.data.postId, profile.id)

  if (result.success) {
    revalidateWorksheetPaths()
  }

  return result
}

const removeExcellentSchema = z.object({
  postId: z.string().uuid(),
  monthId: z.string().uuid(),
})

export async function removeWorksheetFromExcellent(input: z.infer<typeof removeExcellentSchema>) {
  const parsed = removeExcellentSchema.safeParse(input)

  if (!parsed.success) {
    return { success: false as const, error: '잘못된 요청입니다.' }
  }

  const { profile } = await getAuthContext()

  if (!profile || !isStaff(profile.role)) {
    return { success: false as const, error: '교직원만 우수작을 해제할 수 있습니다.' }
  }

  const result = await removeWorksheetExcellentPost(parsed.data.monthId, parsed.data.postId)

  if (result.success) {
    revalidateWorksheetPaths()
  }

  return result
}

const createExcellentMonthSchema = z.object({
  label: z.string().min(1).max(50),
  year: z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12),
})

export async function createWorksheetExcellentMonthAction(
  input: z.infer<typeof createExcellentMonthSchema>
): Promise<{ success: true; month: WorksheetExcellentMonth } | { success: false; error: string }> {
  const parsed = createExcellentMonthSchema.safeParse(input)

  if (!parsed.success) {
    return { success: false, error: '입력값이 올바르지 않습니다.' }
  }

  const { profile } = await getAuthContext()

  if (!profile || !isStaff(profile.role)) {
    return { success: false, error: '교직원만 달을 추가할 수 있습니다.' }
  }

  const result = await addWorksheetExcellentMonth(
    parsed.data.label,
    parsed.data.year,
    parsed.data.month,
    profile.id
  )

  if (result.success) {
    revalidateWorksheetPaths()
  }

  return result
}

export async function fetchWorksheetExcellentMonthsAction(): Promise<WorksheetExcellentMonth[]> {
  const { profile } = await getAuthContext()

  if (!profile) {
    return []
  }

  return fetchWorksheetExcellentMonths()
}
