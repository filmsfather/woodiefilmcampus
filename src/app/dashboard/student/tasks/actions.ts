'use server'

import { randomUUID } from 'crypto'

import type { SupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { getAuthContext } from '@/lib/auth'
import { createClient as createServerSupabase } from '@/lib/supabase/server'

const SUBMISSIONS_BUCKET = 'submissions'
const MAX_PDF_FILE_SIZE = 20 * 1024 * 1024

export async function submitSrsAnswer({
  studentTaskItemId,
  isCorrect,
}: {
  studentTaskItemId: string
  isCorrect: boolean
}) {
  const { profile } = await getAuthContext()

  if (!profile || profile.role !== 'student') {
    return {
      success: false as const,
      error: '학생 계정으로만 제출할 수 있습니다.',
    }
  }

  const supabase = createServerSupabase()

  const { data: item, error: itemError } = await supabase
    .from('student_task_items')
    .select('id, student_task_id, student_tasks!inner(student_id)')
    .eq('id', studentTaskItemId)
    .maybeSingle()

  if (itemError) {
    console.error('[submitSrsAnswer] failed to load student_task_item', itemError)
    return {
      success: false as const,
      error: '문항 정보를 불러오지 못했습니다.',
    }
  }

  const studentOwner = (() => {
    const relation = item?.student_tasks as unknown

    if (!relation) {
      return null
    }

    if (Array.isArray(relation)) {
      const first = relation[0]
      return typeof first?.student_id === 'string' ? first.student_id : null
    }

    if (typeof (relation as { student_id?: unknown })?.student_id === 'string') {
      return (relation as { student_id: string }).student_id
    }

    return null
  })()

  if (!item || studentOwner !== profile.id) {
    return {
      success: false as const,
      error: '해당 문항에 접근할 수 없습니다.',
    }
  }

  const studentTaskId = item?.student_task_id ?? null

  const { error: rpcError } = await supabase.rpc('mark_student_task_item', {
    p_student_task_item_id: studentTaskItemId,
    p_is_correct: isCorrect,
  })

  if (rpcError) {
    console.error('[submitSrsAnswer] mark_student_task_item failed', rpcError)
    return {
      success: false as const,
      error: '정답 기록 중 오류가 발생했습니다.',
    }
  }

  revalidatePath('/dashboard/student')
  if (studentTaskId) {
    revalidatePath(`/dashboard/student/tasks/${studentTaskId}`)
  }

  return {
    success: true as const,
  }
}

const textResponsesSchema = z.object({
  studentTaskId: z.string().uuid('유효한 과제 ID가 아닙니다.'),
  submissionType: z.enum(['writing', 'film', 'lecture']),
  answers: z
    .array(
      z.object({
        studentTaskItemId: z.string().uuid('유효한 문항 ID가 아닙니다.'),
        workbookItemId: z.string().uuid('유효한 문제 ID가 아닙니다.'),
        content: z.string().optional().default(''),
      })
    )
    .min(1, '답안을 최소 1개 이상 입력해주세요.'),
})

export async function submitTextResponses(input: z.infer<typeof textResponsesSchema>) {
  const { profile } = await getAuthContext()

  if (!profile || profile.role !== 'student') {
    return { success: false as const, error: '학생 계정으로만 제출할 수 있습니다.' }
  }

  let parsed: z.infer<typeof textResponsesSchema>

  try {
    parsed = textResponsesSchema.parse(input)
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstIssue = error.issues[0]
      return { success: false as const, error: firstIssue?.message ?? '입력 값을 확인해주세요.' }
    }
    return { success: false as const, error: '입력 값을 확인해주세요.' }
  }

  const supabase = createServerSupabase()

  const ownsTask = await ensureStudentOwnsTask(supabase, parsed.studentTaskId, profile.id)

  if (!ownsTask) {
    return { success: false as const, error: '해당 과제에 접근할 수 없습니다.' }
  }

  const now = new Date().toISOString()

  for (const answer of parsed.answers) {
    const trimmedContent = (answer.content ?? '').trim()

    const { data: existing, error: existingError } = await supabase
      .from('task_submissions')
      .select('id')
      .eq('student_task_id', parsed.studentTaskId)
      .eq('item_id', answer.workbookItemId)
      .maybeSingle()

    if (existingError) {
      console.error('[submitTextResponses] failed to load existing submission', existingError)
      return { success: false as const, error: '기존 답안을 불러오지 못했습니다.' }
    }

    if (trimmedContent.length === 0) {
      if (existing) {
        const { error: deleteError } = await supabase
          .from('task_submissions')
          .delete()
          .eq('id', existing.id)

        if (deleteError) {
          console.error('[submitTextResponses] failed to delete empty submission', deleteError)
          return { success: false as const, error: '답안 삭제 중 오류가 발생했습니다.' }
        }
      }

      const { error: resetItemError } = await supabase
        .from('student_task_items')
        .update({
          completed_at: null,
          last_result: null,
          updated_at: now,
        })
        .eq('id', answer.studentTaskItemId)

      if (resetItemError) {
        console.error('[submitTextResponses] failed to reset student_task_item', resetItemError)
        return { success: false as const, error: '문항 상태를 업데이트하지 못했습니다.' }
      }

      continue
    }

    if (existing) {
      const { error: updateError } = await supabase
        .from('task_submissions')
        .update({
          submission_type: parsed.submissionType,
          content: trimmedContent,
          media_asset_id: null,
          updated_at: now,
        })
        .eq('id', existing.id)

      if (updateError) {
        console.error('[submitTextResponses] failed to update submission', updateError)
        return { success: false as const, error: '답안을 저장하지 못했습니다.' }
      }
    } else {
      const { error: insertError } = await supabase.from('task_submissions').insert({
        student_task_id: parsed.studentTaskId,
        item_id: answer.workbookItemId,
        submission_type: parsed.submissionType,
        content: trimmedContent,
      })

      if (insertError) {
        console.error('[submitTextResponses] failed to insert submission', insertError)
        return { success: false as const, error: '답안을 저장하지 못했습니다.' }
      }
    }

    const { error: itemUpdateError } = await supabase
      .from('student_task_items')
      .update({
        completed_at: now,
        last_result: 'submitted',
        updated_at: now,
      })
      .eq('id', answer.studentTaskItemId)

    if (itemUpdateError) {
      console.error('[submitTextResponses] failed to update student_task_item', itemUpdateError)
      return { success: false as const, error: '문항 상태를 업데이트하지 못했습니다.' }
    }
  }

  await refreshStudentTaskStatus(supabase, parsed.studentTaskId)

  revalidatePath('/dashboard/student')
  revalidatePath(`/dashboard/student/tasks/${parsed.studentTaskId}`)

  return { success: true as const }
}

export async function submitPdfSubmission(formData: FormData) {
  const { profile } = await getAuthContext()

  if (!profile || profile.role !== 'student') {
    return { success: false as const, error: '학생 계정으로만 제출할 수 있습니다.' }
  }

  const studentTaskIdValue = formData.get('studentTaskId')
  const fileValue = formData.get('file')

  if (typeof studentTaskIdValue !== 'string' || studentTaskIdValue.length === 0) {
    return { success: false as const, error: '과제 정보가 올바르지 않습니다.' }
  }

  const studentTaskId = studentTaskIdValue

  const supabase = createServerSupabase()

  const ownsTask = await ensureStudentOwnsTask(supabase, studentTaskId, profile.id)

  if (!ownsTask) {
    return { success: false as const, error: '해당 과제에 접근할 수 없습니다.' }
  }

  if (!(fileValue instanceof File)) {
    return { success: false as const, error: '업로드할 PDF 파일을 선택해주세요.' }
  }

  const file = fileValue

  if (file.type !== 'application/pdf') {
    return { success: false as const, error: 'PDF 파일만 업로드할 수 있습니다.' }
  }

  if (file.size > MAX_PDF_FILE_SIZE) {
    const maxMb = Math.round(MAX_PDF_FILE_SIZE / (1024 * 1024))
    return { success: false as const, error: `파일 용량은 최대 ${maxMb}MB까지 지원합니다.` }
  }

  const sanitizedName = file.name.replace(/[^a-zA-Z0-9_.-]/g, '_') || 'submission.pdf'
  const storagePath = `student_tasks/${studentTaskId}/${randomUUID()}-${sanitizedName}`

  const fileBuffer = Buffer.from(await file.arrayBuffer())

  const uploadedObjects: Array<{ bucket: string; path: string }> = []

  try {
    const { error: uploadError } = await supabase.storage
      .from(SUBMISSIONS_BUCKET)
      .upload(storagePath, fileBuffer, {
        cacheControl: '3600',
        contentType: 'application/pdf',
        upsert: false,
      })

    if (uploadError) {
      console.error('[submitPdfSubmission] storage upload failed', uploadError)
      return { success: false as const, error: '파일 업로드에 실패했습니다.' }
    }

    uploadedObjects.push({ bucket: SUBMISSIONS_BUCKET, path: storagePath })

    const { data: existingSubmission, error: existingSubmissionError } = await supabase
      .from('task_submissions')
      .select('id, media_asset_id')
      .eq('student_task_id', studentTaskId)
      .is('item_id', null)
      .maybeSingle()

    if (existingSubmissionError) {
      console.error('[submitPdfSubmission] failed to load existing submission', existingSubmissionError)
      throw new Error('제출 정보를 불러오지 못했습니다.')
    }

    const oldAssetId: string | null = existingSubmission?.media_asset_id ?? null

    const { data: mediaAsset, error: mediaAssetError } = await supabase
      .from('media_assets')
      .insert({
        owner_id: profile.id,
        scope: 'task_submission',
        bucket: SUBMISSIONS_BUCKET,
        path: storagePath,
        mime_type: 'application/pdf',
        size: file.size,
        metadata: { originalName: sanitizedName },
      })
      .select('id')
      .single()

    if (mediaAssetError) {
      console.error('[submitPdfSubmission] failed to insert media_assets', mediaAssetError)
      throw new Error('제출 파일 정보를 저장하지 못했습니다.')
    }

    if (existingSubmission) {
      const { error: updateError } = await supabase
        .from('task_submissions')
        .update({
          submission_type: 'pdf',
          content: sanitizedName,
          media_asset_id: mediaAsset.id,
        })
        .eq('id', existingSubmission.id)

      if (updateError) {
        console.error('[submitPdfSubmission] failed to update task_submissions', updateError)
        throw new Error('제출 정보를 저장하지 못했습니다.')
      }
    } else {
      const { error: insertError } = await supabase.from('task_submissions').insert({
        student_task_id: studentTaskId,
        submission_type: 'pdf',
        content: sanitizedName,
        media_asset_id: mediaAsset.id,
      })

      if (insertError) {
        console.error('[submitPdfSubmission] failed to insert task_submissions', insertError)
        throw new Error('제출 정보를 저장하지 못했습니다.')
      }
    }

    await supabase
      .from('student_tasks')
      .update({ status: 'completed', completion_at: new Date().toISOString() })
      .eq('id', studentTaskId)

    if (oldAssetId) {
      await removeMediaAsset(supabase, oldAssetId)
    }

    revalidatePath('/dashboard/student')
    revalidatePath(`/dashboard/student/tasks/${studentTaskId}`)

    return { success: true as const }
  } catch (error) {
    console.error('[submitPdfSubmission] unexpected error', error)

    for (const object of uploadedObjects) {
      await supabase.storage.from(object.bucket).remove([object.path])
    }

    return {
      success: false as const,
      error: error instanceof Error ? error.message : '제출 처리 중 오류가 발생했습니다.',
    }
  }
}

type AnySupabaseClient = SupabaseClient

async function ensureStudentOwnsTask(
  supabase: AnySupabaseClient,
  studentTaskId: string,
  studentId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('student_tasks')
    .select('id')
    .eq('id', studentTaskId)
    .eq('student_id', studentId)
    .maybeSingle()

  if (error) {
    console.error('[student-task-actions] failed to verify student task owner', error)
    return false
  }

  return Boolean(data)
}

async function refreshStudentTaskStatus(supabase: AnySupabaseClient, studentTaskId: string) {
  const { data: items, error } = await supabase
    .from('student_task_items')
    .select('id, completed_at')
    .eq('student_task_id', studentTaskId)

  if (error) {
    console.error('[student-task-actions] failed to load task items', error)
    return
  }

  const total = items?.length ?? 0
  const completedCount = (items ?? []).filter((item) => Boolean(item.completed_at)).length

  let status: 'not_started' | 'in_progress' | 'completed'
  if (total === 0) {
    status = 'in_progress'
  } else if (completedCount === 0) {
    status = 'not_started'
  } else if (completedCount === total) {
    status = 'completed'
  } else {
    status = 'in_progress'
  }

  const now = new Date().toISOString()

  await supabase
    .from('student_tasks')
    .update({
      status,
      completion_at: status === 'completed' ? now : null,
      updated_at: now,
    })
    .eq('id', studentTaskId)
}

async function removeMediaAsset(supabase: AnySupabaseClient, assetId: string | null) {
  if (!assetId) {
    return
  }

  const { data: asset, error } = await supabase
    .from('media_assets')
    .select('id, bucket, path')
    .eq('id', assetId)
    .maybeSingle()

  if (error) {
    console.error('[student-task-actions] failed to fetch media asset', error)
    return
  }

  if (!asset?.path) {
    await supabase.from('media_assets').delete().eq('id', assetId)
    return
  }

  const bucketId = asset.bucket ?? SUBMISSIONS_BUCKET
  const { error: removeError } = await supabase.storage.from(bucketId).remove([asset.path])

  if (removeError) {
    console.error('[student-task-actions] failed to remove storage object', removeError)
  }

  const { error: deleteError } = await supabase.from('media_assets').delete().eq('id', assetId)

  if (deleteError) {
    console.error('[student-task-actions] failed to delete media asset row', deleteError)
  }
}
