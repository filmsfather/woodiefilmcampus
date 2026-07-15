'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { getAuthContext } from '@/lib/auth'
import { ALLOW_LATE_SUBMISSION } from '@/lib/exam-settings'
import { createAdminClient } from '@/lib/supabase/admin'
import { EXAM_ASSETS_BUCKET } from '@/lib/storage/buckets'
import { sanitizeStorageFileName } from '@/lib/storage-upload'
import {
  submitExamAnswersSchema,
  submitReviewTaskSchema,
  updateReviewItemImageCaptionSchema,
  uploadReviewItemImageSchema,
  type SubmitExamAnswersInput,
  type SubmitReviewTaskInput,
  type UploadReviewItemImageInput,
} from '@/lib/validation/exam'

type ActionResult = {
  success?: boolean
  error?: string
  id?: string
}

// 서버 시각 기준 마감 검증 시 네트워크 지연을 감안한 여유
const SUBMIT_GRACE_MS = 60 * 1000

function revalidateStudentExams(sessionId?: string, reviewTaskId?: string) {
  revalidatePath('/dashboard/student')
  revalidatePath('/dashboard/student/exams')
  if (sessionId) {
    revalidatePath(`/dashboard/student/exams/${sessionId}`)
  }
  if (reviewTaskId) {
    revalidatePath(`/dashboard/student/exams/review/${reviewTaskId}`)
  }
}

async function ensureStudentProfile() {
  const { profile } = await getAuthContext()
  if (!profile || profile.role !== 'student') {
    return null
  }
  return profile
}

async function isSessionTarget(sessionId: string, studentId: string): Promise<boolean> {
  const admin = createAdminClient()

  const { data: classRows } = await admin
    .from('class_students')
    .select('class_id')
    .eq('student_id', studentId)

  const classIds = (classRows ?? []).map((row) => row.class_id).filter(Boolean)
  if (classIds.length === 0) {
    return false
  }

  const { data: targetRow } = await admin
    .from('exam_session_targets')
    .select('id')
    .eq('session_id', sessionId)
    .in('class_id', classIds)
    .limit(1)
    .maybeSingle()

  return Boolean(targetRow)
}

export async function startExamAttemptAction(sessionId: string): Promise<ActionResult> {
  const profile = await ensureStudentProfile()
  if (!profile) {
    return { error: '학생 계정으로 로그인해주세요.' }
  }

  const idParse = z.string().uuid().safeParse(sessionId)
  if (!idParse.success) {
    return { error: '잘못된 요청입니다.' }
  }

  const admin = createAdminClient()

  const { data: sessionRow, error: sessionError } = await admin
    .from('exam_sessions')
    .select('id, status, opens_at, closes_at')
    .eq('id', sessionId)
    .maybeSingle()

  if (sessionError || !sessionRow) {
    return { error: '시험 회차를 찾을 수 없습니다.' }
  }

  const now = new Date()
  if (sessionRow.status !== 'open') {
    return { error: '이미 마감된 시험입니다.' }
  }
  if (now < new Date(sessionRow.opens_at)) {
    return { error: '아직 응시 시작 전입니다.' }
  }
  if (!ALLOW_LATE_SUBMISSION && now > new Date(sessionRow.closes_at)) {
    return { error: '응시 기간이 종료되었습니다.' }
  }

  if (!(await isSessionTarget(sessionId, profile.id))) {
    return { error: '이 시험의 응시 대상이 아닙니다.' }
  }

  const { data: existing } = await admin
    .from('exam_attempts')
    .select('id, started_at, submitted_at')
    .eq('session_id', sessionId)
    .eq('student_id', profile.id)
    .maybeSingle()

  if (existing) {
    if (existing.submitted_at) {
      return { error: '이미 제출한 시험입니다.' }
    }
    if (!existing.started_at) {
      await admin
        .from('exam_attempts')
        .update({ started_at: now.toISOString() })
        .eq('id', existing.id)
    }
    revalidateStudentExams(sessionId)
    return { success: true, id: existing.id }
  }

  const { data: attemptRow, error: insertError } = await admin
    .from('exam_attempts')
    .insert({
      session_id: sessionId,
      student_id: profile.id,
      started_at: now.toISOString(),
    })
    .select('id')
    .single()

  if (insertError || !attemptRow?.id) {
    console.error('[exams] failed to start attempt', insertError)
    return { error: '시험 시작에 실패했습니다.' }
  }

  revalidateStudentExams(sessionId)
  return { success: true, id: attemptRow.id as string }
}

export async function submitExamAnswersAction(input: SubmitExamAnswersInput): Promise<ActionResult> {
  const profile = await ensureStudentProfile()
  if (!profile) {
    return { error: '학생 계정으로 로그인해주세요.' }
  }

  const parsed = submitExamAnswersSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다.' }
  }

  const admin = createAdminClient()

  type AttemptRow = {
    id: string
    session_id: string
    student_id: string
    started_at: string | null
    submitted_at: string | null
    exam_sessions:
      | { duration_minutes: number; closes_at: string; status: string }
      | Array<{ duration_minutes: number; closes_at: string; status: string }>
      | null
  }

  const { data, error: attemptError } = await admin
    .from('exam_attempts')
    .select('id, session_id, student_id, started_at, submitted_at, exam_sessions(duration_minutes, closes_at, status)')
    .eq('id', parsed.data.attemptId)
    .maybeSingle()

  if (attemptError || !data) {
    return { error: '응시 기록을 찾을 수 없습니다.' }
  }

  const attempt = data as unknown as AttemptRow

  if (attempt.student_id !== profile.id) {
    return { error: '본인의 응시만 제출할 수 있습니다.' }
  }
  if (attempt.submitted_at) {
    return { error: '이미 제출한 시험입니다.' }
  }
  if (!attempt.started_at) {
    return { error: '시험을 먼저 시작해주세요.' }
  }

  const session = Array.isArray(attempt.exam_sessions) ? attempt.exam_sessions[0] : attempt.exam_sessions
  if (!session) {
    return { error: '시험 회차 정보를 확인할 수 없습니다.' }
  }

  const now = Date.now()
  const deadline = Math.min(
    new Date(attempt.started_at).getTime() + session.duration_minutes * 60 * 1000,
    new Date(session.closes_at).getTime()
  )

  if (!ALLOW_LATE_SUBMISSION && parsed.data.submit && now > deadline + SUBMIT_GRACE_MS) {
    return { error: '제한시간이 지나 제출할 수 없습니다.' }
  }

  for (const answer of parsed.data.answers) {
    const { error: upsertError } = await admin
      .from('exam_answers')
      .upsert(
        {
          attempt_id: attempt.id,
          question_id: answer.questionId,
          content: answer.content,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'attempt_id,question_id' }
      )

    if (upsertError) {
      console.error('[exams] failed to save answer', upsertError)
      return { error: '답안 저장에 실패했습니다.' }
    }
  }

  if (parsed.data.submit) {
    const { error: submitError } = await admin
      .from('exam_attempts')
      .update({ submitted_at: new Date().toISOString() })
      .eq('id', attempt.id)

    if (submitError) {
      console.error('[exams] failed to submit attempt', submitError)
      return { error: '제출 처리에 실패했습니다.' }
    }
  }

  revalidateStudentExams(attempt.session_id)
  return { success: true }
}

type ReviewTaskOwnership = {
  taskId: string
  status: string
  studentId: string
}

async function loadReviewTaskOwnership(reviewTaskId: string): Promise<ReviewTaskOwnership | null> {
  const admin = createAdminClient()

  type Row = {
    id: string
    status: string
    exam_attempts: { student_id: string } | { student_id: string }[] | null
  }

  const { data, error } = await admin
    .from('exam_review_tasks')
    .select('id, status, exam_attempts(student_id)')
    .eq('id', reviewTaskId)
    .maybeSingle()

  if (error || !data) {
    return null
  }

  const row = data as unknown as Row
  const attempt = Array.isArray(row.exam_attempts) ? row.exam_attempts[0] : row.exam_attempts
  if (!attempt) {
    return null
  }

  return { taskId: row.id, status: row.status, studentId: attempt.student_id }
}

export async function saveReviewTaskAction(input: SubmitReviewTaskInput): Promise<ActionResult> {
  const profile = await ensureStudentProfile()
  if (!profile) {
    return { error: '학생 계정으로 로그인해주세요.' }
  }

  const parsed = submitReviewTaskSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다.' }
  }

  const ownership = await loadReviewTaskOwnership(parsed.data.reviewTaskId)
  if (!ownership || ownership.studentId !== profile.id) {
    return { error: '본인의 오답노트만 작성할 수 있습니다.' }
  }

  if (ownership.status === 'pass') {
    return { error: '이미 통과된 오답노트입니다.' }
  }

  const admin = createAdminClient()

  for (const item of parsed.data.items) {
    // pass된 문항은 잠금 유지
    const { error } = await admin
      .from('exam_review_items')
      .update({ answer_content: item.answerContent })
      .eq('id', item.itemId)
      .eq('review_task_id', parsed.data.reviewTaskId)
      .neq('result', 'pass')

    if (error) {
      console.error('[exams] failed to save review item answer', error)
      return { error: '오답노트 저장에 실패했습니다.' }
    }
  }

  if (parsed.data.submit) {
    const { error } = await admin
      .from('exam_review_tasks')
      .update({
        status: 'submitted',
        submitted_at: new Date().toISOString(),
      })
      .eq('id', parsed.data.reviewTaskId)

    if (error) {
      console.error('[exams] failed to submit review task', error)
      return { error: '오답노트 제출에 실패했습니다.' }
    }
  }

  revalidateStudentExams(undefined, parsed.data.reviewTaskId)
  return { success: true }
}

export async function uploadReviewItemImageAction(input: UploadReviewItemImageInput): Promise<ActionResult> {
  const profile = await ensureStudentProfile()
  if (!profile) {
    return { error: '학생 계정으로 로그인해주세요.' }
  }

  const parsed = uploadReviewItemImageSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다.' }
  }

  if (parsed.data.file.bucket !== EXAM_ASSETS_BUCKET) {
    return { error: '허용되지 않은 저장소 경로가 감지되었습니다.' }
  }

  const admin = createAdminClient()

  type ItemRow = {
    id: string
    review_task_id: string
    result: string
    exam_review_tasks:
      | { id: string; status: string; exam_attempts: { student_id: string } | { student_id: string }[] | null }
      | Array<{ id: string; status: string; exam_attempts: { student_id: string } | { student_id: string }[] | null }>
      | null
  }

  const { data, error: itemError } = await admin
    .from('exam_review_items')
    .select('id, review_task_id, result, exam_review_tasks(id, status, exam_attempts(student_id))')
    .eq('id', parsed.data.itemId)
    .maybeSingle()

  if (itemError || !data) {
    return { error: '오답노트 문항을 찾을 수 없습니다.' }
  }

  const item = data as unknown as ItemRow
  const task = Array.isArray(item.exam_review_tasks) ? item.exam_review_tasks[0] : item.exam_review_tasks
  const attempt = task ? (Array.isArray(task.exam_attempts) ? task.exam_attempts[0] : task.exam_attempts) : null

  if (!attempt || attempt.student_id !== profile.id) {
    return { error: '본인의 오답노트만 수정할 수 있습니다.' }
  }
  if (item.result === 'pass' || task?.status === 'pass') {
    return { error: '이미 통과된 문항입니다.' }
  }

  const finalPath = `reviews/${item.review_task_id}/${item.id}/${randomUUID()}-${sanitizeStorageFileName(parsed.data.file.originalName)}`

  if (parsed.data.file.path !== finalPath) {
    const { error: moveError } = await admin.storage
      .from(EXAM_ASSETS_BUCKET)
      .move(parsed.data.file.path, finalPath)
    if (moveError) {
      console.error('[exams] failed to move review image', moveError)
      return { error: '이미지를 저장하지 못했습니다.' }
    }
  }

  const { data: mediaAsset, error: mediaError } = await admin
    .from('media_assets')
    .insert({
      owner_id: profile.id,
      scope: 'exam',
      bucket: EXAM_ASSETS_BUCKET,
      path: finalPath,
      mime_type: parsed.data.file.mimeType,
      size: parsed.data.file.size,
      metadata: { originalName: sanitizeStorageFileName(parsed.data.file.originalName) },
    })
    .select('id')
    .single()

  if (mediaError || !mediaAsset?.id) {
    console.error('[exams] failed to insert review media asset', mediaError)
    await admin.storage.from(EXAM_ASSETS_BUCKET).remove([finalPath])
    return { error: '이미지 정보를 저장하지 못했습니다.' }
  }

  const { data: maxRow } = await admin
    .from('exam_review_item_assets')
    .select('order_index')
    .eq('item_id', item.id)
    .order('order_index', { ascending: false })
    .limit(1)
    .maybeSingle()

  const nextOrder = ((maxRow?.order_index as number | undefined) ?? -1) + 1

  const { data: linkRow, error: linkError } = await admin
    .from('exam_review_item_assets')
    .insert({
      item_id: item.id,
      media_asset_id: mediaAsset.id as string,
      order_index: nextOrder,
      caption: parsed.data.caption?.trim() || null,
    })
    .select('id')
    .single()

  if (linkError || !linkRow?.id) {
    console.error('[exams] failed to link review image', linkError)
    await admin.storage.from(EXAM_ASSETS_BUCKET).remove([finalPath])
    await admin.from('media_assets').delete().eq('id', mediaAsset.id)
    return { error: '이미지 연결에 실패했습니다.' }
  }

  revalidateStudentExams(undefined, item.review_task_id)
  return { success: true, id: linkRow.id as string }
}

export async function deleteReviewItemImageAction(assetLinkId: string): Promise<ActionResult> {
  const profile = await ensureStudentProfile()
  if (!profile) {
    return { error: '학생 계정으로 로그인해주세요.' }
  }

  const idParse = z.string().uuid().safeParse(assetLinkId)
  if (!idParse.success) {
    return { error: '잘못된 요청입니다.' }
  }

  const admin = createAdminClient()

  type LinkRow = {
    id: string
    media_asset_id: string
    exam_review_items:
      | {
          id: string
          review_task_id: string
          result: string
          exam_review_tasks:
            | { status: string; exam_attempts: { student_id: string } | { student_id: string }[] | null }
            | Array<{ status: string; exam_attempts: { student_id: string } | { student_id: string }[] | null }>
            | null
        }
      | Array<{
          id: string
          review_task_id: string
          result: string
          exam_review_tasks:
            | { status: string; exam_attempts: { student_id: string } | { student_id: string }[] | null }
            | Array<{ status: string; exam_attempts: { student_id: string } | { student_id: string }[] | null }>
            | null
        }>
      | null
  }

  const { data, error } = await admin
    .from('exam_review_item_assets')
    .select(
      `id, media_asset_id,
       exam_review_items(id, review_task_id, result, exam_review_tasks(status, exam_attempts(student_id)))`
    )
    .eq('id', assetLinkId)
    .maybeSingle()

  if (error || !data) {
    return { error: '이미지를 찾을 수 없습니다.' }
  }

  const link = data as unknown as LinkRow
  const item = Array.isArray(link.exam_review_items) ? link.exam_review_items[0] : link.exam_review_items
  const task = item ? (Array.isArray(item.exam_review_tasks) ? item.exam_review_tasks[0] : item.exam_review_tasks) : null
  const attempt = task ? (Array.isArray(task.exam_attempts) ? task.exam_attempts[0] : task.exam_attempts) : null

  if (!attempt || attempt.student_id !== profile.id) {
    return { error: '본인의 오답노트만 수정할 수 있습니다.' }
  }
  if (item?.result === 'pass' || task?.status === 'pass') {
    return { error: '이미 통과된 문항입니다.' }
  }

  const { data: asset } = await admin
    .from('media_assets')
    .select('id, bucket, path')
    .eq('id', link.media_asset_id)
    .maybeSingle()

  const { error: deleteError } = await admin
    .from('exam_review_item_assets')
    .delete()
    .eq('id', assetLinkId)

  if (deleteError) {
    console.error('[exams] failed to delete review image link', deleteError)
    return { error: '이미지 삭제에 실패했습니다.' }
  }

  if (asset?.path) {
    await admin.storage.from(asset.bucket ?? EXAM_ASSETS_BUCKET).remove([asset.path])
    await admin.from('media_assets').delete().eq('id', asset.id)
  }

  if (item) {
    revalidateStudentExams(undefined, item.review_task_id)
  }
  return { success: true }
}

export async function updateReviewItemImageCaptionAction(
  input: z.infer<typeof updateReviewItemImageCaptionSchema>
): Promise<ActionResult> {
  const profile = await ensureStudentProfile()
  if (!profile) {
    return { error: '학생 계정으로 로그인해주세요.' }
  }

  const parsed = updateReviewItemImageCaptionSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다.' }
  }

  const admin = createAdminClient()

  type LinkRow = {
    id: string
    exam_review_items:
      | {
          review_task_id: string
          result: string
          exam_review_tasks:
            | { exam_attempts: { student_id: string } | { student_id: string }[] | null }
            | Array<{ exam_attempts: { student_id: string } | { student_id: string }[] | null }>
            | null
        }
      | Array<{
          review_task_id: string
          result: string
          exam_review_tasks:
            | { exam_attempts: { student_id: string } | { student_id: string }[] | null }
            | Array<{ exam_attempts: { student_id: string } | { student_id: string }[] | null }>
            | null
        }>
      | null
  }

  const { data, error } = await admin
    .from('exam_review_item_assets')
    .select('id, exam_review_items(review_task_id, result, exam_review_tasks(exam_attempts(student_id)))')
    .eq('id', parsed.data.assetLinkId)
    .maybeSingle()

  if (error || !data) {
    return { error: '이미지를 찾을 수 없습니다.' }
  }

  const link = data as unknown as LinkRow
  const item = Array.isArray(link.exam_review_items) ? link.exam_review_items[0] : link.exam_review_items
  const task = item ? (Array.isArray(item.exam_review_tasks) ? item.exam_review_tasks[0] : item.exam_review_tasks) : null
  const attempt = task ? (Array.isArray(task.exam_attempts) ? task.exam_attempts[0] : task.exam_attempts) : null

  if (!attempt || attempt.student_id !== profile.id) {
    return { error: '본인의 오답노트만 수정할 수 있습니다.' }
  }
  if (item?.result === 'pass') {
    return { error: '이미 통과된 문항입니다.' }
  }

  const { error: updateError } = await admin
    .from('exam_review_item_assets')
    .update({ caption: parsed.data.caption.trim() || null })
    .eq('id', parsed.data.assetLinkId)

  if (updateError) {
    console.error('[exams] failed to update caption', updateError)
    return { error: '해설 저장에 실패했습니다.' }
  }

  if (item) {
    revalidateStudentExams(undefined, item.review_task_id)
  }
  return { success: true }
}
