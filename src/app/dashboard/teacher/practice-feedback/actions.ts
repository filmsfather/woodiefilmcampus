'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'

import { getAuthContext } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { PRACTICE_RECORDINGS_BUCKET } from '@/lib/storage/buckets'
import { sanitizeStorageFileName } from '@/lib/storage-upload'
import { runPracticeOcrForAttempt } from '@/lib/practice/ocr'
import {
  completePracticeRecordingSchema,
  markPracticeAttemptMissedSchema,
  retryPracticeOcrSchema,
  savePracticeFeedbackSchema,
} from '@/lib/validation/practice'
import type { UserProfile } from '@/lib/supabase'

type ActionResult = { success?: true; error?: string }

const STAFF_ROLES = new Set<UserProfile['role']>(['teacher', 'manager', 'principal'])

async function ensureStaffProfile() {
  const { profile } = await getAuthContext()
  if (!profile || !STAFF_ROLES.has(profile.role)) {
    return null
  }
  return profile
}

function revalidateSession(attemptId: string) {
  revalidatePath(`/dashboard/teacher/practice-feedback/sessions/${attemptId}`)
  revalidatePath('/dashboard/teacher/practice-feedback/today')
  revalidatePath('/dashboard/teacher/practice-feedback/board')
  revalidatePath('/dashboard/teacher/practice-feedback/students')
  revalidatePath('/dashboard/manager/practice-feedback/board')
  revalidatePath('/dashboard/manager/practice-feedback/bookings')
  revalidatePath('/dashboard/student/practice-feedback')
  revalidatePath('/dashboard/student/practice-feedback/archive')
  revalidatePath(`/dashboard/student/practice-feedback/attempts/${attemptId}`)
}

/** OCR이 실패했거나 결과가 나쁠 때 다시 변환한다. */
export async function retryPracticeOcrAction(payload: unknown): Promise<ActionResult> {
  const profile = await ensureStaffProfile()
  if (!profile) {
    return { error: '권한이 없습니다.' }
  }

  const parsed = retryPracticeOcrSchema.safeParse(payload)
  if (!parsed.success) {
    return { error: '잘못된 요청입니다.' }
  }

  const result = await runPracticeOcrForAttempt(parsed.data.attemptId)

  if (!result.success) {
    return { error: result.error ?? '변환에 실패했습니다.' }
  }

  revalidateSession(parsed.data.attemptId)
  return { success: true }
}

/** 면접형 5분 녹화 영상을 저장한다. */
export async function completePracticeRecordingAction(payload: unknown): Promise<ActionResult> {
  const profile = await ensureStaffProfile()
  if (!profile) {
    return { error: '권한이 없습니다.' }
  }

  const parsed = completePracticeRecordingSchema.safeParse(payload)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다.' }
  }

  const { attemptId, video } = parsed.data

  if (video.bucket !== PRACTICE_RECORDINGS_BUCKET) {
    return { error: '허용되지 않은 저장소 경로가 감지되었습니다.' }
  }

  const admin = createAdminClient()

  const { data: attemptRow, error: attemptError } = await admin
    .from('practice_attempts')
    .select('id, practice_type, video_media_asset_id')
    .eq('id', attemptId)
    .maybeSingle()

  if (attemptError || !attemptRow) {
    return { error: '응시 정보를 찾을 수 없습니다.' }
  }

  const attempt = attemptRow as { id: string; practice_type: string; video_media_asset_id: string | null }

  if (attempt.practice_type !== 'interview') {
    return { error: '면접형 응시만 녹화할 수 있습니다.' }
  }

  const finalPath = `attempts/${attemptId}/${randomUUID()}-${sanitizeStorageFileName(video.originalName)}`

  if (video.path !== finalPath) {
    const { error: moveError } = await admin.storage
      .from(PRACTICE_RECORDINGS_BUCKET)
      .move(video.path, finalPath)

    if (moveError) {
      console.error('[practice] failed to move recording', moveError)
      return { error: '녹화 영상을 저장하지 못했습니다.' }
    }
  }

  const { data: mediaAsset, error: mediaError } = await admin
    .from('media_assets')
    .insert({
      owner_id: profile.id,
      scope: 'practice',
      bucket: PRACTICE_RECORDINGS_BUCKET,
      path: finalPath,
      mime_type: video.mimeType,
      size: video.size,
      metadata: { originalName: sanitizeStorageFileName(video.originalName) },
    })
    .select('id')
    .single()

  if (mediaError || !mediaAsset?.id) {
    console.error('[practice] failed to insert recording media asset', mediaError)
    return { error: '녹화 정보를 저장하지 못했습니다.' }
  }

  const previousAssetId = attempt.video_media_asset_id

  const { error: updateError } = await admin
    .from('practice_attempts')
    .update({
      video_media_asset_id: mediaAsset.id as string,
      recorded_by: profile.id,
      recorded_at: new Date().toISOString(),
    })
    .eq('id', attemptId)

  if (updateError) {
    console.error('[practice] failed to attach recording', updateError)
    return { error: '녹화 저장에 실패했습니다.' }
  }

  // 재녹화면 이전 영상을 정리한다.
  if (previousAssetId) {
    const { data: previous } = await admin
      .from('media_assets')
      .select('bucket, path')
      .eq('id', previousAssetId)
      .maybeSingle()

    const previousRow = previous as { bucket: string | null; path: string | null } | null
    if (previousRow?.bucket && previousRow.path) {
      await admin.storage.from(previousRow.bucket).remove([previousRow.path])
    }
    await admin.from('media_assets').delete().eq('id', previousAssetId)
  }

  revalidateSession(attemptId)
  return { success: true }
}

/** 피드백 본문 + 채점표 점수 저장. finalize면 응시를 피드백 완료로 확정한다. */
export async function savePracticeFeedbackAction(payload: unknown): Promise<ActionResult> {
  const profile = await ensureStaffProfile()
  if (!profile) {
    return { error: '피드백을 작성할 권한이 없습니다.' }
  }

  const parsed = savePracticeFeedbackSchema.safeParse(payload)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다.' }
  }

  const input = parsed.data
  const admin = createAdminClient()

  const { data: attemptRow, error: attemptError } = await admin
    .from('practice_attempts')
    .select('id, booking_id, problem_id')
    .eq('id', input.attemptId)
    .maybeSingle()

  if (attemptError || !attemptRow) {
    return { error: '응시 정보를 찾을 수 없습니다.' }
  }

  const attempt = attemptRow as { id: string; booking_id: string; problem_id: string }

  // 점수가 문제의 채점 항목과 배점 범위 안에 있는지 확인한다.
  let totalScore: number | null = null

  if (input.scores.length > 0) {
    const { data: rubricRows, error: rubricError } = await admin
      .from('practice_rubric_items')
      .select('id, max_score')
      .eq('problem_id', attempt.problem_id)

    if (rubricError) {
      console.error('[practice] failed to load rubric items', rubricError)
      return { error: '채점표를 불러오지 못했습니다.' }
    }

    const rubricMap = new Map(
      ((rubricRows ?? []) as Array<{ id: string; max_score: number | string }>).map((row) => [
        row.id,
        Number(row.max_score),
      ])
    )

    for (const score of input.scores) {
      const maxScore = rubricMap.get(score.rubricItemId)
      if (maxScore === undefined) {
        return { error: '이 문제의 채점 항목이 아닙니다.' }
      }
      if (score.score > maxScore) {
        return { error: `배점(${maxScore}점)을 넘는 점수는 입력할 수 없습니다.` }
      }
    }

    totalScore = input.scores.reduce((sum, score) => sum + score.score, 0)
  }

  const { data: feedbackRow, error: feedbackError } = await admin
    .from('practice_feedbacks')
    .upsert(
      {
        attempt_id: input.attemptId,
        teacher_id: profile.id,
        feedback_text: input.feedbackText ?? null,
        comment: input.comment ?? null,
        total_score: totalScore,
      },
      { onConflict: 'attempt_id' }
    )
    .select('id')
    .single()

  if (feedbackError || !feedbackRow?.id) {
    console.error('[practice] failed to save feedback', feedbackError)
    return { error: '피드백 저장에 실패했습니다.' }
  }

  const feedbackId = feedbackRow.id as string

  await admin.from('practice_feedback_scores').delete().eq('feedback_id', feedbackId)

  if (input.scores.length > 0) {
    const { error: scoreError } = await admin.from('practice_feedback_scores').insert(
      input.scores.map((score) => ({
        feedback_id: feedbackId,
        rubric_item_id: score.rubricItemId,
        score: score.score,
        note: score.note ?? null,
      }))
    )

    if (scoreError) {
      console.error('[practice] failed to save feedback scores', scoreError)
      return { error: '채점 결과 저장에 실패했습니다.' }
    }
  }

  if (input.finalize) {
    await admin.from('practice_attempts').update({ status: 'feedback_done' }).eq('id', input.attemptId)
    await admin.from('practice_bookings').update({ status: 'completed' }).eq('id', attempt.booking_id)
  }

  revalidateSession(input.attemptId)
  return { success: true }
}

/** 학생이 끝내 제출하지 않은 경우 미제출로 정리한다. */
export async function markPracticeAttemptMissedAction(payload: unknown): Promise<ActionResult> {
  const profile = await ensureStaffProfile()
  if (!profile) {
    return { error: '권한이 없습니다.' }
  }

  const parsed = markPracticeAttemptMissedSchema.safeParse(payload)
  if (!parsed.success) {
    return { error: '잘못된 요청입니다.' }
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('practice_attempts')
    .update({ status: 'missed' })
    .eq('id', parsed.data.attemptId)
    .is('submitted_at', null)

  if (error) {
    console.error('[practice] failed to mark attempt missed', error)
    return { error: '상태 변경에 실패했습니다.' }
  }

  revalidateSession(parsed.data.attemptId)
  return { success: true }
}
