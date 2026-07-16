'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { getAuthContext } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { WRITING_ASSETS_BUCKET } from '@/lib/storage/buckets'
import { sanitizeStorageFileName } from '@/lib/storage-upload'
import { runWritingOcrForAttempt } from '@/lib/writing-ocr'
import {
  addWritingReviewQuestionSchema,
  createWritingSessionSchema,
  createWritingSetSchema,
  issueWritingReviewTaskSchema,
  retryWritingOcrSchema,
  updateWritingSetSchema,
  type AddWritingReviewQuestionInput,
  type CreateWritingSessionInput,
  type CreateWritingSetInput,
  type IssueWritingReviewTaskInput,
  type RetryWritingOcrInput,
  type UpdateWritingSetInput,
} from '@/lib/validation/writing'
import type { UserProfile } from '@/lib/supabase'

type ActionResult = {
  success?: boolean
  error?: string
  id?: string
}

const WRITING_BASE_PATH = '/dashboard/teacher/mock-practice/writing'
const REVIEW_TASK_DUE_DAYS = 7

const STAFF_ROLES = new Set<UserProfile['role']>(['teacher', 'manager', 'principal'])

async function ensureStaffProfile() {
  const { profile } = await getAuthContext()
  if (!profile || !STAFF_ROLES.has(profile.role)) {
    return null
  }
  return profile
}

function revalidateWritings(extraPaths: string[] = []) {
  revalidatePath(WRITING_BASE_PATH)
  for (const path of extraPaths) {
    revalidatePath(path)
  }
}

type QuestionImageInput = CreateWritingSetInput['questions'][number]['images'][number]

async function attachQuestionImages(params: {
  setId: string
  questionId: string
  ownerId: string
  images: QuestionImageInput[]
}) {
  const { setId, questionId, ownerId, images } = params
  const admin = createAdminClient()

  for (let index = 0; index < images.length; index += 1) {
    const image = images[index]

    let mediaAssetId: string

    if ('mediaAssetId' in image) {
      mediaAssetId = image.mediaAssetId
    } else {
      if (image.bucket !== WRITING_ASSETS_BUCKET) {
        throw new Error('허용되지 않은 저장소 경로가 감지되었습니다.')
      }

      const finalPath = `sets/${setId}/questions/${questionId}/${randomUUID()}-${sanitizeStorageFileName(image.originalName)}`

      if (image.path !== finalPath) {
        const { error: moveError } = await admin.storage
          .from(WRITING_ASSETS_BUCKET)
          .move(image.path, finalPath)
        if (moveError) {
          console.error('[writings] failed to move question image', moveError)
          throw new Error('문항 이미지를 저장하지 못했습니다.')
        }
      }

      const { data: mediaAsset, error: mediaError } = await admin
        .from('media_assets')
        .insert({
          owner_id: ownerId,
          scope: 'writing',
          bucket: WRITING_ASSETS_BUCKET,
          path: finalPath,
          mime_type: image.mimeType,
          size: image.size,
          metadata: { originalName: sanitizeStorageFileName(image.originalName) },
        })
        .select('id')
        .single()

      if (mediaError || !mediaAsset?.id) {
        console.error('[writings] failed to insert question media asset', mediaError)
        throw new Error('문항 이미지 정보를 저장하지 못했습니다.')
      }

      mediaAssetId = mediaAsset.id as string
    }

    const { error: linkError } = await admin.from('writing_question_assets').insert({
      question_id: questionId,
      media_asset_id: mediaAssetId,
      order_index: index,
    })

    if (linkError) {
      console.error('[writings] failed to link question image', linkError)
      throw new Error('문항 이미지 연결에 실패했습니다.')
    }
  }
}

async function insertQuestions(params: {
  setId: string
  ownerId: string
  questions: CreateWritingSetInput['questions']
}) {
  const { setId, ownerId, questions } = params
  const admin = createAdminClient()

  for (let index = 0; index < questions.length; index += 1) {
    const question = questions[index]

    const { data: questionRow, error: questionError } = await admin
      .from('writing_questions')
      .insert({
        set_id: setId,
        order_index: index,
        prompt: question.prompt,
      })
      .select('id')
      .single()

    if (questionError || !questionRow?.id) {
      console.error('[writings] failed to insert question', questionError)
      throw new Error('작문 문항 저장에 실패했습니다.')
    }

    await attachQuestionImages({
      setId,
      questionId: questionRow.id as string,
      ownerId,
      images: question.images,
    })
  }
}

async function insertReviewWorkbookItems(
  workbookId: string,
  reviewQuestions: CreateWritingSetInput['reviewQuestions']
) {
  if (reviewQuestions.length === 0) {
    return
  }

  const admin = createAdminClient()

  const { error } = await admin.from('workbook_items').insert(
    reviewQuestions.map((question, index) => ({
      workbook_id: workbookId,
      position: index + 1,
      prompt: question.prompt,
      answer_type: 'writing',
    }))
  )

  if (error) {
    console.error('[writings] failed to insert review workbook items', error)
    throw new Error('오답노트 템플릿 문항 저장에 실패했습니다.')
  }
}

function buildTemplateWorkbookPayload(teacherId: string, title: string, description: string | null) {
  return {
    teacher_id: teacherId,
    title: `[모의 작문 오답노트] ${title}`,
    subject: '통합',
    type: 'writing',
    tags: ['모의작문'],
    description,
    config: {
      writing: {
        instructions: '제출한 작문 원고와 선생님의 오답노트 문항을 확인하고 답변을 작성해주세요.',
      },
    },
  }
}

export async function createWritingSetAction(input: CreateWritingSetInput): Promise<ActionResult> {
  const profile = await ensureStaffProfile()
  if (!profile) {
    return { error: '모의 작문을 만들 권한이 없습니다.' }
  }

  const parsed = createWritingSetSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다.' }
  }

  const admin = createAdminClient()

  // 오답노트 과제용 짝꿍 문제집 생성 (서술형)
  const { data: workbookRow, error: workbookError } = await admin
    .from('workbooks')
    .insert(buildTemplateWorkbookPayload(profile.id, parsed.data.title, parsed.data.description || null))
    .select('id')
    .single()

  if (workbookError || !workbookRow?.id) {
    console.error('[writings] failed to insert paired workbook', workbookError)
    return { error: '오답노트 템플릿 저장에 실패했습니다.' }
  }

  const workbookId = workbookRow.id as string

  const { data: setRow, error: setError } = await admin
    .from('writing_sets')
    .insert({
      title: parsed.data.title,
      description: parsed.data.description || null,
      time_limit_minutes: parsed.data.timeLimitMinutes,
      created_by: profile.id,
      workbook_id: workbookId,
    })
    .select('id')
    .single()

  if (setError || !setRow?.id) {
    console.error('[writings] failed to insert writing set', setError)
    await admin.from('workbooks').delete().eq('id', workbookId)
    return { error: '작문 세트 저장에 실패했습니다.' }
  }

  const setId = setRow.id as string

  try {
    await insertReviewWorkbookItems(workbookId, parsed.data.reviewQuestions)
    await insertQuestions({ setId, ownerId: profile.id, questions: parsed.data.questions })
  } catch (err) {
    await admin.from('writing_sets').delete().eq('id', setId)
    await admin.from('workbooks').delete().eq('id', workbookId)
    return { error: err instanceof Error ? err.message : '작문 세트 저장 중 문제가 발생했습니다.' }
  }

  revalidateWritings()
  return { success: true, id: setId }
}

export async function updateWritingSetAction(input: UpdateWritingSetInput): Promise<ActionResult> {
  const profile = await ensureStaffProfile()
  if (!profile) {
    return { error: '모의 작문을 수정할 권한이 없습니다.' }
  }

  const parsed = updateWritingSetSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다.' }
  }

  const admin = createAdminClient()
  const setId = parsed.data.setId

  const { data: setRow, error: setFetchError } = await admin
    .from('writing_sets')
    .select('id, workbook_id')
    .eq('id', setId)
    .maybeSingle()

  if (setFetchError || !setRow) {
    return { error: '작문 세트를 찾을 수 없습니다.' }
  }

  const { count: sessionCount } = await admin
    .from('writing_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('set_id', setId)

  if ((sessionCount ?? 0) > 0) {
    return { error: '이미 출제된 세트는 수정할 수 없습니다. 새 세트를 만들어주세요.' }
  }

  const { error: updateError } = await admin
    .from('writing_sets')
    .update({
      title: parsed.data.title,
      description: parsed.data.description || null,
      time_limit_minutes: parsed.data.timeLimitMinutes,
    })
    .eq('id', setId)

  if (updateError) {
    console.error('[writings] failed to update writing set', updateError)
    return { error: '작문 세트 수정에 실패했습니다.' }
  }

  let workbookId = setRow.workbook_id as string | null

  if (workbookId) {
    const { error: workbookUpdateError } = await admin
      .from('workbooks')
      .update({
        title: `[모의 작문 오답노트] ${parsed.data.title}`,
        description: parsed.data.description || null,
      })
      .eq('id', workbookId)

    if (workbookUpdateError) {
      console.error('[writings] failed to update paired workbook', workbookUpdateError)
      return { error: '오답노트 템플릿 수정에 실패했습니다.' }
    }

    const { error: itemDeleteError } = await admin
      .from('workbook_items')
      .delete()
      .eq('workbook_id', workbookId)

    if (itemDeleteError) {
      console.error('[writings] failed to reset review items', itemDeleteError)
      return { error: '기존 오답노트 템플릿 정리에 실패했습니다.' }
    }
  } else {
    const { data: workbookRow, error: workbookInsertError } = await admin
      .from('workbooks')
      .insert(buildTemplateWorkbookPayload(profile.id, parsed.data.title, parsed.data.description || null))
      .select('id')
      .single()

    if (workbookInsertError || !workbookRow?.id) {
      console.error('[writings] failed to insert paired workbook on update', workbookInsertError)
      return { error: '오답노트 템플릿 저장에 실패했습니다.' }
    }

    workbookId = workbookRow.id as string
    await admin.from('writing_sets').update({ workbook_id: workbookId }).eq('id', setId)
  }

  const { error: questionDeleteError } = await admin
    .from('writing_questions')
    .delete()
    .eq('set_id', setId)

  if (questionDeleteError) {
    console.error('[writings] failed to reset questions', questionDeleteError)
    return { error: '기존 문항 정리에 실패했습니다.' }
  }

  try {
    await insertReviewWorkbookItems(workbookId, parsed.data.reviewQuestions)
    await insertQuestions({ setId, ownerId: profile.id, questions: parsed.data.questions })
  } catch (err) {
    return { error: err instanceof Error ? err.message : '문항 저장 중 문제가 발생했습니다.' }
  }

  revalidateWritings()
  return { success: true, id: setId }
}

export async function deleteWritingSetAction(setId: string): Promise<ActionResult> {
  const profile = await ensureStaffProfile()
  if (!profile) {
    return { error: '모의 작문을 삭제할 권한이 없습니다.' }
  }

  const idParse = z.string().uuid().safeParse(setId)
  if (!idParse.success) {
    return { error: '잘못된 요청입니다.' }
  }

  const admin = createAdminClient()

  const { count: sessionCount } = await admin
    .from('writing_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('set_id', setId)

  if ((sessionCount ?? 0) > 0) {
    return { error: '이미 출제된 세트는 삭제할 수 없습니다.' }
  }

  const { data: setRow } = await admin
    .from('writing_sets')
    .select('id, workbook_id')
    .eq('id', setId)
    .maybeSingle()

  if (!setRow) {
    return { error: '작문 세트를 찾을 수 없습니다.' }
  }

  const { error } = await admin.from('writing_sets').delete().eq('id', setId)
  if (error) {
    console.error('[writings] failed to delete writing set', error)
    return { error: '작문 세트 삭제에 실패했습니다.' }
  }

  if (setRow.workbook_id) {
    // 아직 과제로 쓰이지 않은 짝꿍 문제집만 정리
    const { count: assignmentCount } = await admin
      .from('assignments')
      .select('id', { count: 'exact', head: true })
      .eq('workbook_id', setRow.workbook_id)

    if ((assignmentCount ?? 0) === 0) {
      await admin.from('workbooks').delete().eq('id', setRow.workbook_id)
    }
  }

  revalidateWritings()
  return { success: true }
}

export async function createWritingSessionAction(input: CreateWritingSessionInput): Promise<ActionResult> {
  const profile = await ensureStaffProfile()
  if (!profile) {
    return { error: '모의 작문을 출제할 권한이 없습니다.' }
  }

  const parsed = createWritingSessionSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다.' }
  }

  const admin = createAdminClient()

  const { data: setRow } = await admin
    .from('writing_sets')
    .select('id')
    .eq('id', parsed.data.setId)
    .maybeSingle()

  if (!setRow) {
    return { error: '작문 세트를 찾을 수 없습니다.' }
  }

  // 교사는 담당 반 범위 내에서만 출제 가능
  const accessibleClassIds = new Set<string>()

  if (profile.role === 'teacher') {
    const { data: teacherClasses, error: teacherClassesError } = await admin
      .from('class_teachers')
      .select('class_id')
      .eq('teacher_id', profile.id)

    if (teacherClassesError) {
      console.error('[writings] failed to load teacher classes', teacherClassesError)
      return { error: '반 정보를 불러오지 못했습니다.' }
    }

    teacherClasses?.forEach((row) => {
      if (row?.class_id) {
        accessibleClassIds.add(row.class_id)
      }
    })
  } else {
    const { data: allClasses, error: allClassesError } = await admin.from('classes').select('id')

    if (allClassesError) {
      console.error('[writings] failed to load classes', allClassesError)
      return { error: '반 정보를 불러오지 못했습니다.' }
    }

    allClasses?.forEach((row) => {
      if (row?.id) {
        accessibleClassIds.add(row.id)
      }
    })
  }

  const invalidClassId = parsed.data.targetClassIds.find((classId) => !accessibleClassIds.has(classId))
  if (invalidClassId) {
    return { error: '선택한 반 중 접근할 수 없는 반이 있습니다.' }
  }

  // 대상 학생 집합 계산
  let classStudents: Array<{ class_id: string; student_id: string }> = []
  if (accessibleClassIds.size > 0) {
    const { data: classStudentRows, error: classStudentsError } = await admin
      .from('class_students')
      .select('class_id, student_id')
      .in('class_id', Array.from(accessibleClassIds))

    if (classStudentsError) {
      console.error('[writings] failed to load class students', classStudentsError)
      return { error: '반 학생 정보를 불러오지 못했습니다.' }
    }

    classStudents = (classStudentRows ?? []) as Array<{ class_id: string; student_id: string }>
  }

  const studentsByClass = new Map<string, Set<string>>()
  for (const row of classStudents) {
    const current = studentsByClass.get(row.class_id) ?? new Set<string>()
    current.add(row.student_id)
    studentsByClass.set(row.class_id, current)
  }

  const accessibleStudentIds = new Set<string>()
  for (const students of studentsByClass.values()) {
    students.forEach((studentId) => accessibleStudentIds.add(studentId))
  }

  const invalidStudentId = parsed.data.targetStudentIds.find((studentId) => !accessibleStudentIds.has(studentId))
  if (invalidStudentId) {
    return { error: '선택한 학생 중 담당 반에 속하지 않은 학생이 있습니다.' }
  }

  const studentIdsForAttempts = new Set<string>()
  for (const classId of parsed.data.targetClassIds) {
    studentsByClass.get(classId)?.forEach((studentId) => studentIdsForAttempts.add(studentId))
  }
  parsed.data.targetStudentIds.forEach((studentId) => studentIdsForAttempts.add(studentId))

  if (studentIdsForAttempts.size === 0) {
    return { error: '선택한 대상에 학생이 없습니다. 반 구성원을 확인해주세요.' }
  }

  const { data: sessionRow, error: sessionError } = await admin
    .from('writing_sessions')
    .insert({
      set_id: parsed.data.setId,
      created_by: profile.id,
      status: 'open',
    })
    .select('id')
    .single()

  if (sessionError || !sessionRow?.id) {
    console.error('[writings] failed to create session', sessionError)
    return { error: '출제에 실패했습니다.' }
  }

  const sessionId = sessionRow.id as string

  const classStudentSet = new Set<string>()
  for (const classId of parsed.data.targetClassIds) {
    studentsByClass.get(classId)?.forEach((studentId) => classStudentSet.add(studentId))
  }

  const targetRows: Array<{ session_id: string; class_id?: string; student_id?: string }> = []
  parsed.data.targetClassIds.forEach((classId) => {
    targetRows.push({ session_id: sessionId, class_id: classId })
  })
  parsed.data.targetStudentIds.forEach((studentId) => {
    if (!classStudentSet.has(studentId)) {
      targetRows.push({ session_id: sessionId, student_id: studentId })
    }
  })

  const { error: targetError } = await admin.from('writing_session_targets').insert(targetRows)

  if (targetError) {
    console.error('[writings] failed to insert session targets', targetError)
    await admin.from('writing_sessions').delete().eq('id', sessionId)
    return { error: '출제 대상 저장에 실패했습니다.' }
  }

  const { error: attemptError } = await admin.from('writing_attempts').insert(
    Array.from(studentIdsForAttempts).map((studentId) => ({
      session_id: sessionId,
      student_id: studentId,
      status: 'assigned',
    }))
  )

  if (attemptError) {
    console.error('[writings] failed to insert attempts', attemptError)
    await admin.from('writing_sessions').delete().eq('id', sessionId)
    return { error: '학생별 작문 시험 생성에 실패했습니다.' }
  }

  revalidateWritings(['/dashboard/student/writing'])
  return { success: true, id: sessionId }
}

export async function closeWritingSessionAction(sessionId: string): Promise<ActionResult> {
  const profile = await ensureStaffProfile()
  if (!profile) {
    return { error: '권한이 없습니다.' }
  }

  const idParse = z.string().uuid().safeParse(sessionId)
  if (!idParse.success) {
    return { error: '잘못된 요청입니다.' }
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('writing_sessions')
    .update({ status: 'closed' })
    .eq('id', sessionId)

  if (error) {
    console.error('[writings] failed to close session', error)
    return { error: '세션 마감에 실패했습니다.' }
  }

  revalidateWritings([`${WRITING_BASE_PATH}/sessions/${sessionId}`])
  return { success: true }
}

export async function retryWritingOcrAction(input: RetryWritingOcrInput): Promise<ActionResult> {
  const profile = await ensureStaffProfile()
  if (!profile) {
    return { error: '텍스트 변환을 실행할 권한이 없습니다.' }
  }

  const parsed = retryWritingOcrSchema.safeParse(input)
  if (!parsed.success) {
    return { error: '잘못된 요청입니다.' }
  }

  const admin = createAdminClient()

  const { data: attemptRow } = await admin
    .from('writing_attempts')
    .select('id, session_id, status')
    .eq('id', parsed.data.attemptId)
    .maybeSingle()

  if (!attemptRow) {
    return { error: '작문 시험 정보를 찾을 수 없습니다.' }
  }

  if (attemptRow.status !== 'submitted' && attemptRow.status !== 'task_created') {
    return { error: '아직 제출되지 않은 시험입니다.' }
  }

  const result = await runWritingOcrForAttempt(parsed.data.attemptId)

  if (!result.success) {
    return { error: result.error ?? '텍스트 변환에 실패했습니다.' }
  }

  revalidateWritings([
    `${WRITING_BASE_PATH}/sessions/${attemptRow.session_id}`,
    '/dashboard/student/writing',
  ])
  return { success: true }
}

export async function issueWritingReviewTaskAction(input: IssueWritingReviewTaskInput): Promise<ActionResult> {
  const profile = await ensureStaffProfile()
  if (!profile) {
    return { error: '오답노트를 발부할 권한이 없습니다.' }
  }

  const parsed = issueWritingReviewTaskSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다.' }
  }

  const admin = createAdminClient()

  type AttemptRow = {
    id: string
    session_id: string
    student_id: string
    status: string
    student_task_id: string | null
    writing_sessions:
      | { id: string; set_id: string; writing_sets: { id: string; title: string; workbook_id: string | null } | { id: string; title: string; workbook_id: string | null }[] | null }
      | Array<{ id: string; set_id: string; writing_sets: { id: string; title: string; workbook_id: string | null } | { id: string; title: string; workbook_id: string | null }[] | null }>
      | null
  }

  const { data: attemptData, error: attemptError } = await admin
    .from('writing_attempts')
    .select(
      `id, session_id, student_id, status, student_task_id,
       writing_sessions(id, set_id, writing_sets(id, title, workbook_id))`
    )
    .eq('id', parsed.data.attemptId)
    .maybeSingle()

  if (attemptError || !attemptData) {
    if (attemptError) console.error('[writings] failed to fetch attempt', attemptError)
    return { error: '작문 시험 정보를 찾을 수 없습니다.' }
  }

  const attempt = attemptData as unknown as AttemptRow

  if (attempt.status === 'task_created') {
    return { error: '이미 오답노트가 발부된 학생입니다.' }
  }

  if (attempt.status !== 'submitted') {
    return { error: '제출이 완료된 학생에게만 오답노트를 발부할 수 있습니다.' }
  }

  const session = Array.isArray(attempt.writing_sessions)
    ? attempt.writing_sessions[0]
    : attempt.writing_sessions
  const set = session
    ? Array.isArray(session.writing_sets)
      ? session.writing_sets[0]
      : session.writing_sets
    : null

  if (!session || !set) {
    return { error: '작문 세트 정보를 찾을 수 없습니다.' }
  }

  if (!set.workbook_id) {
    return { error: '오답노트 템플릿이 없는 세트입니다. 세트를 다시 저장해주세요.' }
  }

  // 0. 템플릿 문제집을 학생별 스냅샷으로 복제
  const { data: templateWorkbook, error: templateError } = await admin
    .from('workbooks')
    .select('id, subject, type, description, config')
    .eq('id', set.workbook_id)
    .maybeSingle()

  if (templateError || !templateWorkbook) {
    console.error('[writings] failed to load template workbook', templateError)
    return { error: '오답노트 템플릿을 불러오지 못했습니다.' }
  }

  const { data: templateItems, error: templateItemsError } = await admin
    .from('workbook_items')
    .select('position, prompt, answer_type, explanation')
    .eq('workbook_id', set.workbook_id)
    .order('position')

  if (templateItemsError) {
    console.error('[writings] failed to load template items', templateItemsError)
    return { error: '오답노트 템플릿 문항을 불러오지 못했습니다.' }
  }

  const { data: studentProfile } = await admin
    .from('profiles')
    .select('name, email')
    .eq('id', attempt.student_id)
    .maybeSingle()

  const studentLabel = studentProfile?.name ?? studentProfile?.email ?? '학생'

  const { data: snapshotWorkbook, error: snapshotError } = await admin
    .from('workbooks')
    .insert({
      teacher_id: profile.id,
      title: `[모의 작문 오답노트] ${set.title} - ${studentLabel}`,
      subject: templateWorkbook.subject ?? '통합',
      type: templateWorkbook.type ?? 'writing',
      tags: ['모의작문', '오답노트'],
      description: templateWorkbook.description ?? null,
      config: templateWorkbook.config ?? {
        writing: {
          instructions: '제출한 작문 원고와 선생님의 오답노트 문항을 확인하고 답변을 작성해주세요.',
        },
      },
    })
    .select('id')
    .single()

  if (snapshotError || !snapshotWorkbook?.id) {
    console.error('[writings] failed to clone workbook snapshot', snapshotError)
    return { error: '학생별 오답노트 생성에 실패했습니다.' }
  }

  const snapshotWorkbookId = snapshotWorkbook.id as string

  const rollbackSnapshot = async () => {
    await admin.from('workbooks').delete().eq('id', snapshotWorkbookId)
  }

  // 템플릿 문항 + 교사가 이번에 작성한 문항을 이어붙인다
  const existingItems = (templateItems ?? []).map((item) => ({
    workbook_id: snapshotWorkbookId,
    position: item.position,
    prompt: item.prompt,
    answer_type: item.answer_type ?? 'writing',
    explanation: item.explanation ?? null,
  }))
  const basePosition = existingItems.reduce((max, item) => Math.max(max, item.position), 0)
  const newItems = parsed.data.questions.map((question, index) => ({
    workbook_id: snapshotWorkbookId,
    position: basePosition + index + 1,
    prompt: question.prompt,
    answer_type: 'writing',
    explanation: null,
  }))

  const { error: itemsError } = await admin.from('workbook_items').insert([...existingItems, ...newItems])

  if (itemsError) {
    console.error('[writings] failed to insert snapshot items', itemsError)
    await rollbackSnapshot()
    return { error: '오답노트 문항 생성에 실패했습니다.' }
  }

  // 1. 오답노트 과제 생성 (해당 학생 1명 대상)
  const now = new Date()
  const dueAt = new Date(now.getTime() + REVIEW_TASK_DUE_DAYS * 24 * 60 * 60 * 1000)

  const { data: assignmentRow, error: assignmentError } = await admin
    .from('assignments')
    .insert({
      workbook_id: snapshotWorkbookId,
      assigned_by: profile.id,
      due_at: dueAt.toISOString(),
      published_at: now.toISOString(),
      comment: `[모의 작문] ${set.title} 오답노트 과제입니다. 제출한 원고와 선생님 문항을 확인하고 작성해주세요.`,
      target_scope: 'student',
    })
    .select('id')
    .single()

  if (assignmentError || !assignmentRow?.id) {
    console.error('[writings] failed to insert review assignment', assignmentError)
    await rollbackSnapshot()
    return { error: '오답노트 과제 생성에 실패했습니다.' }
  }

  const assignmentId = assignmentRow.id as string

  const rollbackAssignment = async () => {
    await admin.from('assignments').delete().eq('id', assignmentId)
    await rollbackSnapshot()
  }

  const { error: targetInsertError } = await admin.from('assignment_targets').insert({
    assignment_id: assignmentId,
    student_id: attempt.student_id,
  })

  if (targetInsertError) {
    console.error('[writings] failed to insert assignment target', targetInsertError)
    await rollbackAssignment()
    return { error: '오답노트 과제 대상 저장에 실패했습니다.' }
  }

  // 학생의 소속 반 (첫 번째)
  const { data: classRow } = await admin
    .from('class_students')
    .select('class_id')
    .eq('student_id', attempt.student_id)
    .limit(1)
    .maybeSingle()

  const { data: taskRow, error: taskError } = await admin
    .from('student_tasks')
    .insert({
      assignment_id: assignmentId,
      student_id: attempt.student_id,
      class_id: classRow?.class_id ?? null,
    })
    .select('id')
    .single()

  if (taskError || !taskRow?.id) {
    console.error('[writings] failed to insert student task', taskError)
    await rollbackAssignment()
    return { error: '학생 오답노트 과제 생성에 실패했습니다.' }
  }

  const studentTaskId = taskRow.id as string

  const { data: workbookItems, error: workbookItemsError } = await admin
    .from('workbook_items')
    .select('id')
    .eq('workbook_id', snapshotWorkbookId)
    .order('position')

  if (workbookItemsError) {
    console.error('[writings] failed to load snapshot workbook items', workbookItemsError)
    await rollbackAssignment()
    return { error: '오답노트 문항을 불러오지 못했습니다.' }
  }

  if (workbookItems && workbookItems.length > 0) {
    const { error: taskItemsError } = await admin.from('student_task_items').insert(
      workbookItems.map((item) => ({ student_task_id: studentTaskId, item_id: item.id }))
    )

    if (taskItemsError) {
      console.error('[writings] failed to insert student task items', taskItemsError)
      await rollbackAssignment()
      return { error: '오답노트 과제 문항 생성에 실패했습니다.' }
    }
  }

  // 2. attempt 갱신
  const { error: attemptUpdateError } = await admin
    .from('writing_attempts')
    .update({
      status: 'task_created',
      student_task_id: studentTaskId,
      task_issued_by: profile.id,
      task_issued_at: now.toISOString(),
    })
    .eq('id', attempt.id)

  if (attemptUpdateError) {
    console.error('[writings] failed to update attempt', attemptUpdateError)
    await rollbackAssignment()
    return { error: '오답노트 발부 상태 저장에 실패했습니다.' }
  }

  revalidateWritings([
    `${WRITING_BASE_PATH}/sessions/${attempt.session_id}`,
    '/dashboard/student/writing',
    '/dashboard/student/tasks',
  ])
  return { success: true, id: studentTaskId }
}

export async function addWritingReviewQuestionAction(
  input: AddWritingReviewQuestionInput
): Promise<ActionResult> {
  const profile = await ensureStaffProfile()
  if (!profile) {
    return { error: '문항을 추가할 권한이 없습니다.' }
  }

  const parsed = addWritingReviewQuestionSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다.' }
  }

  const admin = createAdminClient()

  const { data: attemptData, error: attemptError } = await admin
    .from('writing_attempts')
    .select('id, session_id, student_id, status, student_task_id')
    .eq('id', parsed.data.attemptId)
    .maybeSingle()

  if (attemptError || !attemptData) {
    if (attemptError) console.error('[writings] failed to fetch attempt for question add', attemptError)
    return { error: '작문 시험 정보를 찾을 수 없습니다.' }
  }

  if (attemptData.status !== 'task_created' || !attemptData.student_task_id) {
    return { error: '오답노트가 발부된 학생에게만 문항을 추가할 수 있습니다.' }
  }

  const { data: taskRow, error: taskError } = await admin
    .from('student_tasks')
    .select('id, status, assignment_id, assignments(id, workbook_id)')
    .eq('id', attemptData.student_task_id)
    .maybeSingle()

  if (taskError || !taskRow) {
    if (taskError) console.error('[writings] failed to fetch student task for question add', taskError)
    return { error: '오답노트 과제를 찾을 수 없습니다.' }
  }

  const assignment = Array.isArray(taskRow.assignments) ? taskRow.assignments[0] : taskRow.assignments
  const targetWorkbookId = (assignment as { workbook_id?: string | null } | null)?.workbook_id ?? null

  if (!targetWorkbookId) {
    return { error: '오답노트 과제의 문제집을 찾을 수 없습니다.' }
  }

  const { data: lastItem } = await admin
    .from('workbook_items')
    .select('position')
    .eq('workbook_id', targetWorkbookId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()

  const nextPosition = ((lastItem?.position as number | null) ?? 0) + 1

  const { data: newItem, error: itemError } = await admin
    .from('workbook_items')
    .insert({
      workbook_id: targetWorkbookId,
      position: nextPosition,
      prompt: parsed.data.prompt,
      answer_type: 'writing',
    })
    .select('id')
    .single()

  if (itemError || !newItem?.id) {
    console.error('[writings] failed to insert additional review item', itemError)
    return { error: '문항 추가에 실패했습니다.' }
  }

  const { error: taskItemError } = await admin.from('student_task_items').insert({
    student_task_id: attemptData.student_task_id,
    item_id: newItem.id as string,
  })

  if (taskItemError) {
    console.error('[writings] failed to insert additional task item', taskItemError)
    await admin.from('workbook_items').delete().eq('id', newItem.id as string)
    return { error: '학생 과제에 문항을 연결하지 못했습니다.' }
  }

  // 이미 제출 완료된 과제라면 새 문항에 답할 수 있도록 진행 중 상태로 되돌린다
  if (taskRow.status === 'completed') {
    await admin
      .from('student_tasks')
      .update({ status: 'in_progress', completion_at: null })
      .eq('id', attemptData.student_task_id)
  }

  revalidateWritings([
    `${WRITING_BASE_PATH}/sessions/${attemptData.session_id}`,
    '/dashboard/student/tasks',
    `/dashboard/student/tasks/${attemptData.student_task_id}`,
  ])
  return { success: true, id: newItem.id as string }
}
