'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'

import { getAuthContext } from '@/lib/auth'
import { fetchPracticeProblemDetail } from '@/lib/practice/problems'
import { createAdminClient } from '@/lib/supabase/admin'
import { PRACTICE_ASSETS_BUCKET } from '@/lib/storage/buckets'
import { sanitizeStorageFileName } from '@/lib/storage-upload'
import {
  createPracticeProblemSchema,
  deletePracticeProblemSchema,
  practiceProblemIdSchema,
  togglePracticeProblemSchema,
  updatePracticeProblemSchema,
  type CreatePracticeProblemInput,
  type UpdatePracticeProblemInput,
} from '@/lib/validation/practice'
import type { UserProfile } from '@/lib/supabase'
import type { PracticeProblemDetail } from '@/types/practice'

type ActionResult = {
  success?: boolean
  error?: string
  id?: string
}

const PROBLEMS_BASE_PATH = '/dashboard/teacher/mock-practice/problems'

const STAFF_ROLES = new Set<UserProfile['role']>(['teacher', 'manager', 'principal'])

async function ensureStaffProfile() {
  const { profile } = await getAuthContext()
  if (!profile || !STAFF_ROLES.has(profile.role)) {
    return null
  }
  return profile
}

function revalidateProblems(extraPaths: string[] = []) {
  revalidatePath(PROBLEMS_BASE_PATH)
  for (const path of extraPaths) {
    revalidatePath(path)
  }
}

type ProblemImageInput = CreatePracticeProblemInput['images'][number]

/** pending 경로에 올라온 이미지를 정식 경로로 옮기고 media_assets에 등록한다. */
async function attachProblemImages(params: {
  problemId: string
  ownerId: string
  images: ProblemImageInput[]
}) {
  const { problemId, ownerId, images } = params
  const admin = createAdminClient()

  for (let index = 0; index < images.length; index += 1) {
    const image = images[index]

    let mediaAssetId: string

    if ('mediaAssetId' in image) {
      mediaAssetId = image.mediaAssetId
    } else {
      if (image.bucket !== PRACTICE_ASSETS_BUCKET) {
        throw new Error('허용되지 않은 저장소 경로가 감지되었습니다.')
      }

      const finalPath = `problems/${problemId}/${randomUUID()}-${sanitizeStorageFileName(image.originalName)}`

      if (image.path !== finalPath) {
        const { error: moveError } = await admin.storage
          .from(PRACTICE_ASSETS_BUCKET)
          .move(image.path, finalPath)
        if (moveError) {
          console.error('[practice] failed to move problem image', moveError)
          throw new Error('문제 이미지를 저장하지 못했습니다.')
        }
      }

      const { data: mediaAsset, error: mediaError } = await admin
        .from('media_assets')
        .insert({
          owner_id: ownerId,
          scope: 'practice',
          bucket: PRACTICE_ASSETS_BUCKET,
          path: finalPath,
          mime_type: image.mimeType,
          size: image.size,
          metadata: { originalName: sanitizeStorageFileName(image.originalName) },
        })
        .select('id')
        .single()

      if (mediaError || !mediaAsset?.id) {
        console.error('[practice] failed to insert problem media asset', mediaError)
        throw new Error('문제 이미지 정보를 저장하지 못했습니다.')
      }

      mediaAssetId = mediaAsset.id as string
    }

    const { error: linkError } = await admin.from('practice_problem_assets').insert({
      problem_id: problemId,
      media_asset_id: mediaAssetId,
      order_index: index,
    })

    if (linkError) {
      console.error('[practice] failed to link problem image', linkError)
      throw new Error('문제 이미지 연결에 실패했습니다.')
    }
  }
}

async function insertProblemItems(problemId: string, items: CreatePracticeProblemInput['items']) {
  const admin = createAdminClient()

  const { error } = await admin.from('practice_problem_items').insert(
    items.map((item, index) => ({
      problem_id: problemId,
      order_index: index,
      prompt: item.prompt,
    }))
  )

  if (error) {
    console.error('[practice] failed to insert problem items', error)
    throw new Error('문항 저장에 실패했습니다.')
  }
}

async function insertRubricItems(problemId: string, rubricItems: CreatePracticeProblemInput['rubricItems']) {
  if (rubricItems.length === 0) {
    return
  }

  const admin = createAdminClient()

  const { error } = await admin.from('practice_rubric_items').insert(
    rubricItems.map((item, index) => ({
      problem_id: problemId,
      order_index: index,
      label: item.label,
      max_score: item.maxScore,
      description: item.description ?? null,
    }))
  )

  if (error) {
    console.error('[practice] failed to insert rubric items', error)
    throw new Error('채점표 저장에 실패했습니다.')
  }
}

export async function createPracticeProblemAction(input: CreatePracticeProblemInput): Promise<ActionResult> {
  const profile = await ensureStaffProfile()
  if (!profile) {
    return { error: '모의실기 문제를 만들 권한이 없습니다.' }
  }

  const parsed = createPracticeProblemSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다.' }
  }

  const payload = parsed.data
  const admin = createAdminClient()

  const { data: problemRow, error: problemError } = await admin
    .from('practice_problems')
    .insert({
      university_id: payload.universityId,
      practice_type: payload.practiceType,
      title: payload.title,
      description: payload.description ?? null,
      time_limit_minutes: payload.timeLimitMinutes,
      order_index: payload.orderIndex,
      is_active: payload.isActive,
      created_by: profile.id,
    })
    .select('id')
    .single()

  if (problemError || !problemRow?.id) {
    console.error('[practice] failed to insert problem', problemError)
    return { error: '문제 저장에 실패했습니다.' }
  }

  const problemId = problemRow.id as string

  try {
    await insertProblemItems(problemId, payload.items)
    await attachProblemImages({ problemId, ownerId: profile.id, images: payload.images })
    await insertRubricItems(problemId, payload.rubricItems)
  } catch (error) {
    await admin.from('practice_problems').delete().eq('id', problemId)
    return { error: error instanceof Error ? error.message : '문제 저장에 실패했습니다.' }
  }

  revalidateProblems()
  return { success: true, id: problemId }
}

export async function updatePracticeProblemAction(input: UpdatePracticeProblemInput): Promise<ActionResult> {
  const profile = await ensureStaffProfile()
  if (!profile) {
    return { error: '모의실기 문제를 수정할 권한이 없습니다.' }
  }

  const parsed = updatePracticeProblemSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다.' }
  }

  const payload = parsed.data
  const admin = createAdminClient()

  const { data: existing, error: existingError } = await admin
    .from('practice_problems')
    .select('id')
    .eq('id', payload.problemId)
    .maybeSingle()

  if (existingError || !existing) {
    return { error: '문제를 찾을 수 없습니다.' }
  }

  // 이미 배정된 문제라도 오탈자 수정은 가능해야 하므로 수정 자체는 막지 않는다.
  const { error: updateError } = await admin
    .from('practice_problems')
    .update({
      university_id: payload.universityId,
      practice_type: payload.practiceType,
      title: payload.title,
      description: payload.description ?? null,
      time_limit_minutes: payload.timeLimitMinutes,
      order_index: payload.orderIndex,
      is_active: payload.isActive,
    })
    .eq('id', payload.problemId)

  if (updateError) {
    console.error('[practice] failed to update problem', updateError)
    return { error: '문제 수정에 실패했습니다.' }
  }

  // 문항/이미지/채점표는 통째로 교체한다.
  await admin.from('practice_problem_items').delete().eq('problem_id', payload.problemId)
  await admin.from('practice_problem_assets').delete().eq('problem_id', payload.problemId)
  await admin.from('practice_rubric_items').delete().eq('problem_id', payload.problemId)

  try {
    await insertProblemItems(payload.problemId, payload.items)
    await attachProblemImages({ problemId: payload.problemId, ownerId: profile.id, images: payload.images })
    await insertRubricItems(payload.problemId, payload.rubricItems)
  } catch (error) {
    return { error: error instanceof Error ? error.message : '문제 수정에 실패했습니다.' }
  }

  revalidateProblems([`${PROBLEMS_BASE_PATH}/${payload.problemId}/edit`])
  return { success: true, id: payload.problemId }
}

export async function deletePracticeProblemAction(problemId: string): Promise<ActionResult> {
  const profile = await ensureStaffProfile()
  if (!profile) {
    return { error: '모의실기 문제를 삭제할 권한이 없습니다.' }
  }

  const parsed = deletePracticeProblemSchema.safeParse({ problemId })
  if (!parsed.success) {
    return { error: '잘못된 요청입니다.' }
  }

  const admin = createAdminClient()

  const { count, error: countError } = await admin
    .from('practice_bookings')
    .select('id', { count: 'exact', head: true })
    .eq('problem_id', parsed.data.problemId)
    .neq('status', 'canceled')

  if (countError) {
    console.error('[practice] failed to check problem usage', countError)
    return { error: '문제 사용 여부를 확인하지 못했습니다.' }
  }

  if ((count ?? 0) > 0) {
    return { error: '이미 예약에 배정된 문제는 삭제할 수 없습니다. 비활성화를 사용해주세요.' }
  }

  const { error } = await admin.from('practice_problems').delete().eq('id', parsed.data.problemId)

  if (error) {
    console.error('[practice] failed to delete problem', error)
    return { error: '문제 삭제에 실패했습니다.' }
  }

  revalidateProblems()
  return { success: true }
}

/** 목록에서 문제 내용을 확인하기 위한 지연 조회. 이미지 서명 URL 때문에 열 때마다 새로 발급한다. */
export async function getPracticeProblemPreviewAction(problemId: string): Promise<{
  problem?: PracticeProblemDetail
  error?: string
}> {
  const profile = await ensureStaffProfile()
  if (!profile) {
    return { error: '모의실기 문제를 조회할 권한이 없습니다.' }
  }

  const parsed = practiceProblemIdSchema.safeParse({ problemId })
  if (!parsed.success) {
    return { error: '잘못된 요청입니다.' }
  }

  const problem = await fetchPracticeProblemDetail(parsed.data.problemId)
  if (!problem) {
    return { error: '문제를 찾을 수 없습니다.' }
  }

  return { problem }
}

export async function togglePracticeProblemAction(problemId: string, isActive: boolean): Promise<ActionResult> {
  const profile = await ensureStaffProfile()
  if (!profile) {
    return { error: '권한이 없습니다.' }
  }

  const parsed = togglePracticeProblemSchema.safeParse({ problemId, isActive })
  if (!parsed.success) {
    return { error: '잘못된 요청입니다.' }
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('practice_problems')
    .update({ is_active: parsed.data.isActive })
    .eq('id', parsed.data.problemId)

  if (error) {
    console.error('[practice] failed to toggle problem', error)
    return { error: '상태 변경에 실패했습니다.' }
  }

  revalidateProblems()
  return { success: true }
}
