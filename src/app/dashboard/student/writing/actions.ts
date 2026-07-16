'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'

import { getAuthContext } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { WRITING_SUBMISSIONS_BUCKET } from '@/lib/storage/buckets'
import { sanitizeStorageFileName } from '@/lib/storage-upload'
import { runWritingOcrForAttempt } from '@/lib/writing-ocr'
import {
  startWritingAttemptSchema,
  submitWritingAttemptSchema,
  type StartWritingAttemptInput,
  type SubmitWritingAttemptInput,
} from '@/lib/validation/writing'

type ActionResult = {
  success?: boolean
  error?: string
  /** 시작 시 서버 기준 마감 시각 (ISO) */
  deadlineAt?: string
}

// 사진 업로드 시간을 고려한 제출 유예시간
const SUBMISSION_GRACE_MS = 3 * 60 * 1000

const STUDENT_PATHS = ['/dashboard/student/writing']
const TEACHER_BASE_PATH = '/dashboard/teacher/mock-practice/writing'

async function ensureStudentProfile() {
  const { profile } = await getAuthContext()
  if (!profile || profile.role !== 'student') {
    return null
  }
  return profile
}

function revalidateWritingPaths(sessionId: string) {
  for (const path of STUDENT_PATHS) {
    revalidatePath(path)
  }
  revalidatePath(`/dashboard/student/writing/${sessionId}`)
  revalidatePath(TEACHER_BASE_PATH)
  revalidatePath(`${TEACHER_BASE_PATH}/sessions/${sessionId}`)
}

export async function startWritingAttemptAction(input: StartWritingAttemptInput): Promise<ActionResult> {
  const profile = await ensureStudentProfile()
  if (!profile) {
    return { error: '시험을 시작할 권한이 없습니다.' }
  }

  const parsed = startWritingAttemptSchema.safeParse(input)
  if (!parsed.success) {
    return { error: '잘못된 요청입니다.' }
  }

  const admin = createAdminClient()

  type AttemptRow = {
    id: string
    session_id: string
    student_id: string
    status: string
    started_at: string | null
    deadline_at: string | null
    writing_sessions:
      | { id: string; status: string; writing_sets: { time_limit_minutes: number } | { time_limit_minutes: number }[] | null }
      | Array<{ id: string; status: string; writing_sets: { time_limit_minutes: number } | { time_limit_minutes: number }[] | null }>
      | null
  }

  const { data: attemptData, error: attemptError } = await admin
    .from('writing_attempts')
    .select(
      `id, session_id, student_id, status, started_at, deadline_at,
       writing_sessions(id, status, writing_sets(time_limit_minutes))`
    )
    .eq('id', parsed.data.attemptId)
    .maybeSingle()

  if (attemptError || !attemptData) {
    if (attemptError) console.error('[writings] failed to fetch attempt for start', attemptError)
    return { error: '작문 시험 정보를 찾을 수 없습니다.' }
  }

  const attempt = attemptData as unknown as AttemptRow

  if (attempt.student_id !== profile.id) {
    return { error: '본인의 시험만 시작할 수 있습니다.' }
  }

  // 새로고침/재접속 시 타이머가 리셋되지 않도록 기존 시작 기록을 유지한다
  if (attempt.started_at && attempt.deadline_at) {
    return { success: true, deadlineAt: attempt.deadline_at }
  }

  if (attempt.status !== 'assigned') {
    return { error: '이미 진행되었거나 제출된 시험입니다.' }
  }

  const session = Array.isArray(attempt.writing_sessions)
    ? attempt.writing_sessions[0]
    : attempt.writing_sessions

  if (!session || session.status !== 'open') {
    return { error: '마감된 회차입니다. 선생님께 문의해주세요.' }
  }

  const set = Array.isArray(session.writing_sets) ? session.writing_sets[0] : session.writing_sets
  const timeLimitMinutes = set?.time_limit_minutes

  if (!timeLimitMinutes || timeLimitMinutes <= 0) {
    return { error: '제한시간 정보를 불러오지 못했습니다.' }
  }

  const now = new Date()
  const deadline = new Date(now.getTime() + timeLimitMinutes * 60 * 1000)

  const { error: updateError } = await admin
    .from('writing_attempts')
    .update({
      status: 'in_progress',
      started_at: now.toISOString(),
      deadline_at: deadline.toISOString(),
    })
    .eq('id', attempt.id)
    .eq('status', 'assigned')

  if (updateError) {
    console.error('[writings] failed to start attempt', updateError)
    return { error: '시험 시작에 실패했습니다.' }
  }

  revalidateWritingPaths(attempt.session_id)
  return { success: true, deadlineAt: deadline.toISOString() }
}

export async function submitWritingAttemptAction(input: SubmitWritingAttemptInput): Promise<ActionResult> {
  const profile = await ensureStudentProfile()
  if (!profile) {
    return { error: '제출할 권한이 없습니다.' }
  }

  const parsed = submitWritingAttemptSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다.' }
  }

  for (const image of parsed.data.images) {
    if (image.bucket !== WRITING_SUBMISSIONS_BUCKET) {
      return { error: '허용되지 않은 저장소 경로가 감지되었습니다.' }
    }
    if (!image.mimeType.startsWith('image/')) {
      return { error: '이미지 파일만 제출할 수 있습니다.' }
    }
  }

  const admin = createAdminClient()

  const { data: attemptRow, error: attemptError } = await admin
    .from('writing_attempts')
    .select('id, session_id, student_id, status, started_at, deadline_at')
    .eq('id', parsed.data.attemptId)
    .maybeSingle()

  if (attemptError || !attemptRow) {
    if (attemptError) console.error('[writings] failed to fetch attempt for submit', attemptError)
    return { error: '작문 시험 정보를 찾을 수 없습니다.' }
  }

  if (attemptRow.student_id !== profile.id) {
    return { error: '본인의 시험만 제출할 수 있습니다.' }
  }

  if (attemptRow.status === 'submitted' || attemptRow.status === 'task_created') {
    return { error: '이미 제출이 완료된 시험입니다.' }
  }

  if (attemptRow.status !== 'in_progress' || !attemptRow.started_at || !attemptRow.deadline_at) {
    return { error: '시험을 시작한 뒤에 제출할 수 있습니다.' }
  }

  const now = new Date()
  const deadline = new Date(attemptRow.deadline_at as string)

  if (now.getTime() > deadline.getTime() + SUBMISSION_GRACE_MS) {
    return { error: '제한시간이 지나 제출할 수 없습니다. 선생님께 문의해주세요.' }
  }

  // 1. 임시 업로드 파일을 정식 경로로 이동하고 media_assets 등록
  const mediaAssetIds: string[] = []

  for (const image of parsed.data.images) {
    const finalPath = `sessions/${attemptRow.session_id}/${attemptRow.id}/${randomUUID()}-${sanitizeStorageFileName(image.originalName)}`

    if (image.path !== finalPath) {
      const { error: moveError } = await admin.storage
        .from(WRITING_SUBMISSIONS_BUCKET)
        .move(image.path, finalPath)

      if (moveError) {
        console.error('[writings] failed to move submission image', moveError)
        return { error: '원고 사진을 저장하지 못했습니다. 다시 시도해주세요.' }
      }
    }

    const { data: mediaAsset, error: mediaError } = await admin
      .from('media_assets')
      .insert({
        owner_id: profile.id,
        scope: 'writing',
        bucket: WRITING_SUBMISSIONS_BUCKET,
        path: finalPath,
        mime_type: image.mimeType,
        size: image.size,
        metadata: { originalName: sanitizeStorageFileName(image.originalName) },
      })
      .select('id')
      .single()

    if (mediaError || !mediaAsset?.id) {
      console.error('[writings] failed to insert submission media asset', mediaError)
      return { error: '원고 사진 정보를 저장하지 못했습니다.' }
    }

    mediaAssetIds.push(mediaAsset.id as string)
  }

  const { error: linkError } = await admin.from('writing_submission_assets').insert(
    mediaAssetIds.map((mediaAssetId, index) => ({
      attempt_id: attemptRow.id,
      media_asset_id: mediaAssetId,
      order_index: index,
    }))
  )

  if (linkError) {
    console.error('[writings] failed to link submission assets', linkError)
    return { error: '제출 정보를 저장하지 못했습니다.' }
  }

  // 2. attempt를 제출 완료 상태로 갱신
  const { error: submitError } = await admin
    .from('writing_attempts')
    .update({
      status: 'submitted',
      submitted_at: now.toISOString(),
      ocr_status: 'pending',
    })
    .eq('id', attemptRow.id)
    .eq('status', 'in_progress')

  if (submitError) {
    console.error('[writings] failed to mark attempt submitted', submitError)
    return { error: '제출 상태 저장에 실패했습니다.' }
  }

  // 3. OCR 실행 — 실패해도 제출 자체는 유효하고 교사가 재시도할 수 있다
  try {
    await runWritingOcrForAttempt(attemptRow.id as string)
  } catch (err) {
    console.error('[writings] ocr threw unexpectedly', err)
  }

  revalidateWritingPaths(attemptRow.session_id as string)
  return { success: true }
}
