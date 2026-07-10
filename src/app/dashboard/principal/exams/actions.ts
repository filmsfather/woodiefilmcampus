'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { ensurePrincipalProfile } from '@/lib/authz'
import { createAdminClient } from '@/lib/supabase/admin'
import { EXAM_ASSETS_BUCKET } from '@/lib/storage/buckets'
import { sanitizeStorageFileName } from '@/lib/storage-upload'
import {
  createExamSchema,
  createExamSessionSchema,
  evaluateAttemptSchema,
  evaluateReviewTaskSchema,
  updateExamSchema,
  type CreateExamInput,
  type CreateExamSessionInput,
  type EvaluateAttemptInput,
  type EvaluateReviewTaskInput,
  type UpdateExamInput,
} from '@/lib/validation/exam'

type ActionResult = {
  success?: boolean
  error?: string
  id?: string
}

const EXAMS_BASE_PATH = '/dashboard/principal/exams'

function revalidateExams(extraPaths: string[] = []) {
  revalidatePath(EXAMS_BASE_PATH)
  for (const path of extraPaths) {
    revalidatePath(path)
  }
}

type QuestionImageInput = CreateExamInput['questions'][number]['images'][number]

async function attachQuestionImages(params: {
  examId: string
  questionId: string
  ownerId: string
  images: QuestionImageInput[]
}) {
  const { examId, questionId, ownerId, images } = params
  const admin = createAdminClient()

  for (let index = 0; index < images.length; index += 1) {
    const image = images[index]

    let mediaAssetId: string

    if ('mediaAssetId' in image) {
      mediaAssetId = image.mediaAssetId
    } else {
      if (image.bucket !== EXAM_ASSETS_BUCKET) {
        throw new Error('허용되지 않은 저장소 경로가 감지되었습니다.')
      }

      const finalPath = `exams/${examId}/questions/${questionId}/${randomUUID()}-${sanitizeStorageFileName(image.originalName)}`

      if (image.path !== finalPath) {
        const { error: moveError } = await admin.storage
          .from(EXAM_ASSETS_BUCKET)
          .move(image.path, finalPath)
        if (moveError) {
          console.error('[exams] failed to move question image', moveError)
          throw new Error('문항 이미지를 저장하지 못했습니다.')
        }
      }

      const { data: mediaAsset, error: mediaError } = await admin
        .from('media_assets')
        .insert({
          owner_id: ownerId,
          scope: 'exam',
          bucket: EXAM_ASSETS_BUCKET,
          path: finalPath,
          mime_type: image.mimeType,
          size: image.size,
          metadata: { originalName: sanitizeStorageFileName(image.originalName) },
        })
        .select('id')
        .single()

      if (mediaError || !mediaAsset?.id) {
        console.error('[exams] failed to insert question media asset', mediaError)
        throw new Error('문항 이미지 정보를 저장하지 못했습니다.')
      }

      mediaAssetId = mediaAsset.id as string
    }

    const { error: linkError } = await admin.from('exam_question_assets').insert({
      question_id: questionId,
      media_asset_id: mediaAssetId,
      order_index: index,
    })

    if (linkError) {
      console.error('[exams] failed to link question image', linkError)
      throw new Error('문항 이미지 연결에 실패했습니다.')
    }
  }
}

async function insertQuestions(params: {
  examId: string
  ownerId: string
  questions: CreateExamInput['questions']
}) {
  const { examId, ownerId, questions } = params
  const admin = createAdminClient()

  for (let index = 0; index < questions.length; index += 1) {
    const question = questions[index]

    const { data: questionRow, error: questionError } = await admin
      .from('exam_questions')
      .insert({
        exam_id: examId,
        order_index: index,
        prompt: question.prompt,
      })
      .select('id')
      .single()

    if (questionError || !questionRow?.id) {
      console.error('[exams] failed to insert question', questionError)
      throw new Error('문항 저장에 실패했습니다.')
    }

    const questionId = questionRow.id as string

    await attachQuestionImages({ examId, questionId, ownerId, images: question.images })

    if (question.reviewQuestions.length > 0) {
      const { error: reviewError } = await admin.from('exam_review_questions').insert(
        question.reviewQuestions.map((review, reviewIndex) => ({
          exam_question_id: questionId,
          order_index: reviewIndex,
          prompt: review.prompt,
          requires_image: review.requiresImage,
        }))
      )

      if (reviewError) {
        console.error('[exams] failed to insert review questions', reviewError)
        throw new Error('오답노트 문항 저장에 실패했습니다.')
      }
    }
  }
}

export async function createExamAction(input: CreateExamInput): Promise<ActionResult> {
  const profile = await ensurePrincipalProfile()
  if (!profile) {
    return { error: '시험을 출제할 권한이 없습니다.' }
  }

  const parsed = createExamSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다.' }
  }

  const admin = createAdminClient()

  const { data: examRow, error: examError } = await admin
    .from('exams')
    .insert({
      title: parsed.data.title,
      description: parsed.data.description || null,
      created_by: profile.id,
    })
    .select('id')
    .single()

  if (examError || !examRow?.id) {
    console.error('[exams] failed to insert exam', examError)
    return { error: '시험 세트 저장에 실패했습니다.' }
  }

  const examId = examRow.id as string

  try {
    await insertQuestions({ examId, ownerId: profile.id, questions: parsed.data.questions })
  } catch (err) {
    await admin.from('exams').delete().eq('id', examId)
    return { error: err instanceof Error ? err.message : '시험 세트 저장 중 문제가 발생했습니다.' }
  }

  revalidateExams()
  return { success: true, id: examId }
}

export async function updateExamAction(input: UpdateExamInput): Promise<ActionResult> {
  const profile = await ensurePrincipalProfile()
  if (!profile) {
    return { error: '시험을 수정할 권한이 없습니다.' }
  }

  const parsed = updateExamSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다.' }
  }

  const admin = createAdminClient()
  const examId = parsed.data.examId

  const { count: sessionCount } = await admin
    .from('exam_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('exam_id', examId)

  if ((sessionCount ?? 0) > 0) {
    return { error: '이미 출제된 회차가 있는 시험은 수정할 수 없습니다. 복제 후 수정해주세요.' }
  }

  const { error: updateError } = await admin
    .from('exams')
    .update({
      title: parsed.data.title,
      description: parsed.data.description || null,
    })
    .eq('id', examId)

  if (updateError) {
    console.error('[exams] failed to update exam', updateError)
    return { error: '시험 세트 수정에 실패했습니다.' }
  }

  const { error: deleteError } = await admin.from('exam_questions').delete().eq('exam_id', examId)
  if (deleteError) {
    console.error('[exams] failed to reset questions', deleteError)
    return { error: '기존 문항 정리에 실패했습니다.' }
  }

  try {
    await insertQuestions({ examId, ownerId: profile.id, questions: parsed.data.questions })
  } catch (err) {
    return { error: err instanceof Error ? err.message : '문항 저장 중 문제가 발생했습니다.' }
  }

  revalidateExams([`${EXAMS_BASE_PATH}/${examId}`])
  return { success: true, id: examId }
}

export async function duplicateExamAction(examId: string): Promise<ActionResult> {
  const profile = await ensurePrincipalProfile()
  if (!profile) {
    return { error: '시험을 복제할 권한이 없습니다.' }
  }

  const idParse = z.string().uuid().safeParse(examId)
  if (!idParse.success) {
    return { error: '잘못된 요청입니다.' }
  }

  const admin = createAdminClient()

  const { data: examRow, error: examError } = await admin
    .from('exams')
    .select('id, title, description')
    .eq('id', examId)
    .maybeSingle()

  if (examError || !examRow) {
    return { error: '복제할 시험을 찾을 수 없습니다.' }
  }

  const { data: questionRows, error: questionError } = await admin
    .from('exam_questions')
    .select(
      `id, order_index, prompt,
       exam_question_assets(media_asset_id, order_index),
       exam_review_questions(order_index, prompt, requires_image)`
    )
    .eq('exam_id', examId)
    .order('order_index', { ascending: true })

  if (questionError) {
    console.error('[exams] failed to load questions for duplicate', questionError)
    return { error: '문항 정보를 불러오지 못했습니다.' }
  }

  const { data: newExamRow, error: insertError } = await admin
    .from('exams')
    .insert({
      title: `${examRow.title} (복제)`,
      description: examRow.description,
      created_by: profile.id,
    })
    .select('id')
    .single()

  if (insertError || !newExamRow?.id) {
    console.error('[exams] failed to duplicate exam', insertError)
    return { error: '시험 복제에 실패했습니다.' }
  }

  const newExamId = newExamRow.id as string

  type Row = {
    id: string
    order_index: number
    prompt: string
    exam_question_assets: Array<{ media_asset_id: string; order_index: number }> | null
    exam_review_questions: Array<{ order_index: number; prompt: string; requires_image: boolean }> | null
  }

  try {
    for (const question of ((questionRows ?? []) as Row[])) {
      const { data: newQuestionRow, error: newQuestionError } = await admin
        .from('exam_questions')
        .insert({
          exam_id: newExamId,
          order_index: question.order_index,
          prompt: question.prompt,
        })
        .select('id')
        .single()

      if (newQuestionError || !newQuestionRow?.id) {
        throw new Error('문항 복제에 실패했습니다.')
      }

      const newQuestionId = newQuestionRow.id as string

      const assets = (question.exam_question_assets ?? []).sort((a, b) => a.order_index - b.order_index)
      if (assets.length > 0) {
        const { error: assetError } = await admin.from('exam_question_assets').insert(
          assets.map((asset) => ({
            question_id: newQuestionId,
            media_asset_id: asset.media_asset_id,
            order_index: asset.order_index,
          }))
        )
        if (assetError) {
          throw new Error('문항 이미지 복제에 실패했습니다.')
        }
      }

      const reviews = (question.exam_review_questions ?? []).sort((a, b) => a.order_index - b.order_index)
      if (reviews.length > 0) {
        const { error: reviewError } = await admin.from('exam_review_questions').insert(
          reviews.map((review) => ({
            exam_question_id: newQuestionId,
            order_index: review.order_index,
            prompt: review.prompt,
            requires_image: review.requires_image,
          }))
        )
        if (reviewError) {
          throw new Error('오답노트 문항 복제에 실패했습니다.')
        }
      }
    }
  } catch (err) {
    await admin.from('exams').delete().eq('id', newExamId)
    return { error: err instanceof Error ? err.message : '시험 복제 중 문제가 발생했습니다.' }
  }

  revalidateExams()
  return { success: true, id: newExamId }
}

export async function deleteExamAction(examId: string): Promise<ActionResult> {
  const profile = await ensurePrincipalProfile()
  if (!profile) {
    return { error: '시험을 삭제할 권한이 없습니다.' }
  }

  const idParse = z.string().uuid().safeParse(examId)
  if (!idParse.success) {
    return { error: '잘못된 요청입니다.' }
  }

  const admin = createAdminClient()

  const { count: sessionCount } = await admin
    .from('exam_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('exam_id', examId)

  if ((sessionCount ?? 0) > 0) {
    return { error: '이미 출제된 회차가 있는 시험은 삭제할 수 없습니다.' }
  }

  const { error } = await admin.from('exams').delete().eq('id', examId)
  if (error) {
    console.error('[exams] failed to delete exam', error)
    return { error: '시험 삭제에 실패했습니다.' }
  }

  revalidateExams()
  return { success: true }
}

export async function createExamSessionAction(input: CreateExamSessionInput): Promise<ActionResult> {
  const profile = await ensurePrincipalProfile()
  if (!profile) {
    return { error: '시험을 출제할 권한이 없습니다.' }
  }

  const parsed = createExamSessionSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다.' }
  }

  const admin = createAdminClient()

  const { data: examRow } = await admin
    .from('exams')
    .select('id')
    .eq('id', parsed.data.examId)
    .maybeSingle()

  if (!examRow) {
    return { error: '시험 세트를 찾을 수 없습니다.' }
  }

  const { data: sessionRow, error: sessionError } = await admin
    .from('exam_sessions')
    .insert({
      exam_id: parsed.data.examId,
      created_by: profile.id,
      duration_minutes: parsed.data.durationMinutes,
      opens_at: parsed.data.opensAt,
      closes_at: parsed.data.closesAt,
      status: 'open',
    })
    .select('id')
    .single()

  if (sessionError || !sessionRow?.id) {
    console.error('[exams] failed to create session', sessionError)
    return { error: '회차 생성에 실패했습니다.' }
  }

  const sessionId = sessionRow.id as string

  const { error: targetError } = await admin.from('exam_session_targets').insert(
    parsed.data.classIds.map((classId) => ({
      session_id: sessionId,
      class_id: classId,
    }))
  )

  if (targetError) {
    console.error('[exams] failed to insert session targets', targetError)
    await admin.from('exam_sessions').delete().eq('id', sessionId)
    return { error: '대상 반 지정에 실패했습니다.' }
  }

  revalidateExams([`${EXAMS_BASE_PATH}/${parsed.data.examId}`, '/dashboard/student'])
  return { success: true, id: sessionId }
}

export async function closeExamSessionAction(sessionId: string): Promise<ActionResult> {
  const profile = await ensurePrincipalProfile()
  if (!profile) {
    return { error: '권한이 없습니다.' }
  }

  const idParse = z.string().uuid().safeParse(sessionId)
  if (!idParse.success) {
    return { error: '잘못된 요청입니다.' }
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('exam_sessions')
    .update({ status: 'closed' })
    .eq('id', sessionId)

  if (error) {
    console.error('[exams] failed to close session', error)
    return { error: '회차 마감에 실패했습니다.' }
  }

  revalidateExams([`${EXAMS_BASE_PATH}/sessions/${sessionId}`])
  return { success: true }
}

export async function evaluateAttemptAction(input: EvaluateAttemptInput): Promise<ActionResult> {
  const profile = await ensurePrincipalProfile()
  if (!profile) {
    return { error: '판정 권한이 없습니다.' }
  }

  const parsed = evaluateAttemptSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다.' }
  }

  const admin = createAdminClient()
  const now = new Date().toISOString()

  const { data: attemptRow, error: attemptError } = await admin
    .from('exam_attempts')
    .select('id, session_id, submitted_at')
    .eq('id', parsed.data.attemptId)
    .maybeSingle()

  if (attemptError || !attemptRow) {
    return { error: '응시 기록을 찾을 수 없습니다.' }
  }

  if (!attemptRow.submitted_at) {
    return { error: '아직 제출되지 않은 응시입니다.' }
  }

  const { error: updateError } = await admin
    .from('exam_attempts')
    .update({
      result: parsed.data.result,
      evaluated_by: profile.id,
      evaluated_at: now,
    })
    .eq('id', parsed.data.attemptId)

  if (updateError) {
    console.error('[exams] failed to evaluate attempt', updateError)
    return { error: '판정 저장에 실패했습니다.' }
  }

  if (parsed.data.result === 'nonpass' && parsed.data.reviewItems && parsed.data.reviewItems.length > 0) {
    const { data: existingTask } = await admin
      .from('exam_review_tasks')
      .select('id')
      .eq('attempt_id', parsed.data.attemptId)
      .maybeSingle()

    if (!existingTask) {
      const { data: taskRow, error: taskError } = await admin
        .from('exam_review_tasks')
        .insert({
          attempt_id: parsed.data.attemptId,
          status: 'assigned',
          assigned_by: profile.id,
          assigned_at: now,
        })
        .select('id')
        .single()

      if (taskError || !taskRow?.id) {
        console.error('[exams] failed to create review task', taskError)
        return { error: '오답노트 과제 생성에 실패했습니다.' }
      }

      const { error: itemError } = await admin.from('exam_review_items').insert(
        parsed.data.reviewItems.map((item, index) => ({
          review_task_id: taskRow.id as string,
          exam_question_id: item.examQuestionId ?? null,
          order_index: index,
          prompt: item.prompt,
          requires_image: item.requiresImage,
        }))
      )

      if (itemError) {
        console.error('[exams] failed to insert review items', itemError)
        await admin.from('exam_review_tasks').delete().eq('id', taskRow.id)
        return { error: '오답노트 문항 생성에 실패했습니다.' }
      }
    }
  }

  revalidateExams([`${EXAMS_BASE_PATH}/sessions/${attemptRow.session_id}`])
  return { success: true }
}

async function recomputeReviewTaskStatus(reviewTaskId: string, evaluatorId: string) {
  const admin = createAdminClient()
  const now = new Date().toISOString()

  const { data: itemRows, error } = await admin
    .from('exam_review_items')
    .select('result')
    .eq('review_task_id', reviewTaskId)

  if (error) {
    console.error('[exams] failed to load items for status recompute', error)
    throw new Error('오답노트 상태 계산에 실패했습니다.')
  }

  const results = (itemRows ?? []).map((row) => row.result as string)
  const allPass = results.length > 0 && results.every((result) => result === 'pass')

  const { error: updateError } = await admin
    .from('exam_review_tasks')
    .update({
      status: allPass ? 'pass' : 'partial',
      evaluated_by: evaluatorId,
      evaluated_at: now,
    })
    .eq('id', reviewTaskId)

  if (updateError) {
    console.error('[exams] failed to update review task status', updateError)
    throw new Error('오답노트 상태 저장에 실패했습니다.')
  }
}

export async function evaluateReviewTaskAction(input: EvaluateReviewTaskInput): Promise<ActionResult> {
  const profile = await ensurePrincipalProfile()
  if (!profile) {
    return { error: '판정 권한이 없습니다.' }
  }

  const parsed = evaluateReviewTaskSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다.' }
  }

  const admin = createAdminClient()

  for (const item of parsed.data.items) {
    const { error } = await admin
      .from('exam_review_items')
      .update({
        result: item.result,
        feedback: item.feedback?.trim() || null,
      })
      .eq('id', item.itemId)
      .eq('review_task_id', parsed.data.reviewTaskId)

    if (error) {
      console.error('[exams] failed to update review item', error)
      return { error: '문항 판정 저장에 실패했습니다.' }
    }
  }

  try {
    await recomputeReviewTaskStatus(parsed.data.reviewTaskId, profile.id)
  } catch (err) {
    return { error: err instanceof Error ? err.message : '오답노트 상태 갱신에 실패했습니다.' }
  }

  revalidateExams([`${EXAMS_BASE_PATH}/reviews/${parsed.data.reviewTaskId}`])
  return { success: true }
}

export async function passReviewTaskAllAction(reviewTaskId: string): Promise<ActionResult> {
  const profile = await ensurePrincipalProfile()
  if (!profile) {
    return { error: '판정 권한이 없습니다.' }
  }

  const idParse = z.string().uuid().safeParse(reviewTaskId)
  if (!idParse.success) {
    return { error: '잘못된 요청입니다.' }
  }

  const admin = createAdminClient()

  const { error: itemError } = await admin
    .from('exam_review_items')
    .update({ result: 'pass' })
    .eq('review_task_id', reviewTaskId)

  if (itemError) {
    console.error('[exams] failed to pass all items', itemError)
    return { error: '일괄 통과 처리에 실패했습니다.' }
  }

  try {
    await recomputeReviewTaskStatus(reviewTaskId, profile.id)
  } catch (err) {
    return { error: err instanceof Error ? err.message : '오답노트 상태 갱신에 실패했습니다.' }
  }

  revalidateExams([`${EXAMS_BASE_PATH}/reviews/${reviewTaskId}`])
  return { success: true }
}
