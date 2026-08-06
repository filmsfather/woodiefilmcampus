'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'

import { getAuthContext } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { PRACTICE_SUBMISSIONS_BUCKET } from '@/lib/storage/buckets'
import { sanitizeStorageFileName } from '@/lib/storage-upload'
import { runPracticeOcrForAttempt } from '@/lib/practice/ocr'
import { PRACTICE_SUBMISSION_GRACE_MS } from '@/lib/practice/shared'
import {
  openPracticeAttemptSchema,
  savePracticeInterviewAnswersSchema,
  submitPracticeInterviewSchema,
  submitPracticeWritingSchema,
} from '@/lib/validation/practice'

type ActionResult = { success?: true; error?: string }

async function ensureStudentProfile() {
  const { profile } = await getAuthContext()
  if (!profile || profile.role !== 'student') {
    return null
  }
  return profile
}

function revalidateAttempt(attemptId: string) {
  revalidatePath('/dashboard/student/practice-feedback')
  revalidatePath('/dashboard/student/practice-feedback/archive')
  revalidatePath(`/dashboard/student/practice-feedback/attempts/${attemptId}`)
  revalidatePath(`/dashboard/teacher/practice-feedback/sessions/${attemptId}`)
  revalidatePath('/dashboard/teacher/practice-feedback/today')
}

type AttemptRow = {
  id: string
  student_id: string
  practice_type: 'writing' | 'interview'
  status: string
  opens_at: string
  deadline_at: string
  started_at: string | null
  submitted_at: string | null
}

async function loadOwnAttempt(attemptId: string, studentId: string) {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('practice_attempts')
    .select('id, student_id, practice_type, status, opens_at, deadline_at, started_at, submitted_at')
    .eq('id', attemptId)
    .maybeSingle()

  if (error || !data) {
    if (error) console.error('[practice] failed to fetch attempt', error)
    return { error: '응시 정보를 찾을 수 없습니다.' as const }
  }

  const attempt = data as AttemptRow

  if (attempt.student_id !== studentId) {
    return { error: '본인의 응시만 진행할 수 있습니다.' as const }
  }

  return { attempt }
}

/** 학생이 문제를 처음 열람한 시점을 기록한다. 타이머 기준은 opens_at이므로 시작 시각과 무관하다. */
export async function openPracticeAttemptAction(payload: unknown): Promise<ActionResult> {
  const profile = await ensureStudentProfile()
  if (!profile) {
    return { error: '권한이 없습니다.' }
  }

  const parsed = openPracticeAttemptSchema.safeParse(payload)
  if (!parsed.success) {
    return { error: '잘못된 요청입니다.' }
  }

  const loaded = await loadOwnAttempt(parsed.data.attemptId, profile.id)
  if ('error' in loaded) {
    return { error: loaded.error }
  }

  const { attempt } = loaded

  if (Date.parse(attempt.opens_at) > Date.now()) {
    return { error: '아직 문제가 공개되지 않았습니다.' }
  }

  if (attempt.started_at) {
    return { success: true }
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('practice_attempts')
    .update({ started_at: new Date().toISOString(), status: 'open' })
    .eq('id', attempt.id)
    .eq('status', 'scheduled')

  if (error) {
    console.error('[practice] failed to open attempt', error)
    return { error: '응시 시작 처리에 실패했습니다.' }
  }

  revalidateAttempt(attempt.id)
  return { success: true }
}

export async function submitPracticeWritingAction(payload: unknown): Promise<ActionResult> {
  const profile = await ensureStudentProfile()
  if (!profile) {
    return { error: '제출할 권한이 없습니다.' }
  }

  const parsed = submitPracticeWritingSchema.safeParse(payload)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다.' }
  }

  for (const image of parsed.data.images) {
    if (image.bucket !== PRACTICE_SUBMISSIONS_BUCKET) {
      return { error: '허용되지 않은 저장소 경로가 감지되었습니다.' }
    }
    if (!image.mimeType.startsWith('image/')) {
      return { error: '이미지 파일만 제출할 수 있습니다.' }
    }
  }

  const loaded = await loadOwnAttempt(parsed.data.attemptId, profile.id)
  if ('error' in loaded) {
    return { error: loaded.error }
  }

  const { attempt } = loaded

  if (attempt.practice_type !== 'writing') {
    return { error: '작법형 응시가 아닙니다.' }
  }
  if (attempt.submitted_at) {
    return { error: '이미 제출이 완료되었습니다.' }
  }
  if (Date.parse(attempt.opens_at) > Date.now()) {
    return { error: '아직 문제가 공개되지 않았습니다.' }
  }

  // deadline_at은 1:1 피드백 시작 시각이다. 업로드 시간을 감안해 3분 유예를 둔다.
  if (Date.now() > Date.parse(attempt.deadline_at) + PRACTICE_SUBMISSION_GRACE_MS) {
    return { error: '제출 시간이 지났습니다. 선생님께 직접 원고를 보여주세요.' }
  }

  const admin = createAdminClient()
  const mediaAssetIds: string[] = []

  for (const image of parsed.data.images) {
    const finalPath = `attempts/${attempt.id}/${randomUUID()}-${sanitizeStorageFileName(image.originalName)}`

    if (image.path !== finalPath) {
      const { error: moveError } = await admin.storage
        .from(PRACTICE_SUBMISSIONS_BUCKET)
        .move(image.path, finalPath)

      if (moveError) {
        console.error('[practice] failed to move submission image', moveError)
        return { error: '원고 사진을 저장하지 못했습니다. 다시 시도해주세요.' }
      }
    }

    const { data: mediaAsset, error: mediaError } = await admin
      .from('media_assets')
      .insert({
        owner_id: profile.id,
        scope: 'practice',
        bucket: PRACTICE_SUBMISSIONS_BUCKET,
        path: finalPath,
        mime_type: image.mimeType,
        size: image.size,
        metadata: { originalName: sanitizeStorageFileName(image.originalName) },
      })
      .select('id')
      .single()

    if (mediaError || !mediaAsset?.id) {
      console.error('[practice] failed to insert submission media asset', mediaError)
      return { error: '원고 사진 정보를 저장하지 못했습니다.' }
    }

    mediaAssetIds.push(mediaAsset.id as string)
  }

  const { error: linkError } = await admin.from('practice_submission_assets').insert(
    mediaAssetIds.map((mediaAssetId, index) => ({
      attempt_id: attempt.id,
      media_asset_id: mediaAssetId,
      order_index: index,
    }))
  )

  if (linkError) {
    console.error('[practice] failed to link submission assets', linkError)
    return { error: '제출 정보를 저장하지 못했습니다.' }
  }

  const { error: submitError } = await admin
    .from('practice_attempts')
    .update({
      status: 'submitted',
      submitted_at: new Date().toISOString(),
      ocr_status: 'pending',
    })
    .eq('id', attempt.id)
    .is('submitted_at', null)

  if (submitError) {
    console.error('[practice] failed to mark attempt submitted', submitError)
    return { error: '제출 상태 저장에 실패했습니다.' }
  }

  // OCR은 실패해도 제출 자체는 유효하다. 교사 화면에서 원본 사진을 보며 재변환할 수 있다.
  try {
    await runPracticeOcrForAttempt(attempt.id)
  } catch (err) {
    console.error('[practice] ocr threw unexpectedly', err)
  }

  revalidateAttempt(attempt.id)
  return { success: true }
}

/** 면접형 타자 답안 자동 저장. 제출 전까지 언제든 덮어쓴다. */
export async function savePracticeInterviewAnswersAction(payload: unknown): Promise<ActionResult> {
  const profile = await ensureStudentProfile()
  if (!profile) {
    return { error: '권한이 없습니다.' }
  }

  const parsed = savePracticeInterviewAnswersSchema.safeParse(payload)
  if (!parsed.success) {
    return { error: '입력값이 올바르지 않습니다.' }
  }

  const loaded = await loadOwnAttempt(parsed.data.attemptId, profile.id)
  if ('error' in loaded) {
    return { error: loaded.error }
  }

  const { attempt } = loaded

  if (attempt.practice_type !== 'interview') {
    return { error: '면접형 응시가 아닙니다.' }
  }
  if (attempt.submitted_at) {
    return { error: '이미 제출이 완료되었습니다.' }
  }
  if (Date.parse(attempt.opens_at) > Date.now()) {
    return { error: '아직 문제가 공개되지 않았습니다.' }
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('practice_attempts')
    .update({ typed_answers: parsed.data.answers })
    .eq('id', attempt.id)
    .is('submitted_at', null)

  if (error) {
    console.error('[practice] failed to save typed answers', error)
    return { error: '답안 저장에 실패했습니다.' }
  }

  return { success: true }
}

export async function submitPracticeInterviewAction(payload: unknown): Promise<ActionResult> {
  const profile = await ensureStudentProfile()
  if (!profile) {
    return { error: '제출할 권한이 없습니다.' }
  }

  const parsed = submitPracticeInterviewSchema.safeParse(payload)
  if (!parsed.success) {
    return { error: '입력값이 올바르지 않습니다.' }
  }

  const loaded = await loadOwnAttempt(parsed.data.attemptId, profile.id)
  if ('error' in loaded) {
    return { error: loaded.error }
  }

  const { attempt } = loaded

  if (attempt.practice_type !== 'interview') {
    return { error: '면접형 응시가 아닙니다.' }
  }
  if (attempt.submitted_at) {
    return { error: '이미 제출이 완료되었습니다.' }
  }
  if (Date.parse(attempt.opens_at) > Date.now()) {
    return { error: '아직 문제가 공개되지 않았습니다.' }
  }
  if (Date.now() > Date.parse(attempt.deadline_at) + PRACTICE_SUBMISSION_GRACE_MS) {
    return { error: '제출 시간이 지났습니다. 선생님께 문의해주세요.' }
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('practice_attempts')
    .update({
      typed_answers: parsed.data.answers,
      status: 'submitted',
      submitted_at: new Date().toISOString(),
    })
    .eq('id', attempt.id)
    .is('submitted_at', null)

  if (error) {
    console.error('[practice] failed to submit interview answers', error)
    return { error: '제출에 실패했습니다.' }
  }

  revalidateAttempt(attempt.id)
  return { success: true }
}
