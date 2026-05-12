'use server'

import type { SupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { getAuthContext } from '@/lib/auth'
import { syncAtelierPostForPdfSubmission } from '@/lib/atelier-posts'
import { syncEssayPostForSubmission } from '@/lib/essay-posts'
import { createClient as createServerSupabase } from '@/lib/supabase/server'
import { SUBMISSIONS_BUCKET } from '@/lib/storage/buckets'
import { MAX_PDF_FILE_SIZE, MAX_IMAGE_FILE_SIZE, MAX_IMAGES_PER_QUESTION } from '@/lib/storage/limits'
import { evaluateWritingSubmission, GradingCriteria } from '@/lib/gemini'

type UploadedFilePayload = {
  bucket: string
  path: string
  size: number
  mimeType: string
  originalName: string
}

function sanitizeSubmissionFileName(name: string) {
  const fallback = 'submission.pdf'
  if (!name) {
    return fallback
  }

  const trimmed = name.trim()
  if (!trimmed) {
    return fallback
  }

  // Remove only control characters so display names can retain the user's original text (including Korean).
  const withoutControlChars = trimmed.replace(/[\u0000-\u001f\u007f]/g, '')

  if (!withoutControlChars) {
    return fallback
  }

  // Cap overly long names to protect downstream UI while preserving most of the original string.
  return withoutControlChars.slice(0, 255)
}

function normalizeUploadedFileRecord(value: unknown, index = 0): UploadedFilePayload {
  if (!value || typeof value !== 'object') {
    throw new Error(`파일 정보가 올바르지 않습니다. (index: ${index})`)
  }

  const record = value as Record<string, unknown>
  const bucket = typeof record.bucket === 'string' ? record.bucket : null
  const path = typeof record.path === 'string' ? record.path : null
  const size = typeof record.size === 'number' ? record.size : Number(record.size)
  const mimeType = typeof record.mimeType === 'string' ? record.mimeType : null
  const originalName = typeof record.originalName === 'string' ? record.originalName : null

  if (!bucket || !path || !Number.isFinite(size) || !mimeType || !originalName) {
    throw new Error('파일 정보가 손상되었습니다.')
  }

  return {
    bucket,
    path,
    size,
    mimeType,
    originalName,
  }
}

function parseUploadedFilePayload(value: FormDataEntryValue | null): UploadedFilePayload | null {
  if (!value) {
    return null
  }

  if (typeof value !== 'string' || value.trim().length === 0) {
    return null
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch (error) {
    console.error('[submitPdfSubmission] failed to parse uploaded payload', error)
    throw new Error('파일 정보를 확인하지 못했습니다.')
  }

  return normalizeUploadedFileRecord(parsed)
}

function parseUploadedFileList(value: FormDataEntryValue | null): UploadedFilePayload[] {
  if (!value) {
    return []
  }

  if (typeof value !== 'string' || value.trim().length === 0) {
    return []
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch (error) {
    console.error('[submitPdfSubmission] failed to parse uploaded payload list', error)
    throw new Error('파일 정보를 확인하지 못했습니다.')
  }

  if (!Array.isArray(parsed)) {
    throw new Error('파일 정보 형식이 올바르지 않습니다.')
  }

  return parsed.map((entry, index) => normalizeUploadedFileRecord(entry, index))
}

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

  const supabase = await createServerSupabase()

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

  revalidatePath('/dashboard/student/tasks')
  if (studentTaskId) {
    revalidatePath(`/dashboard/student/tasks/${studentTaskId}`)
  }

  return {
    success: true as const,
  }
}

const textResponsesSchema = z.object({
  studentTaskId: z.string().uuid('유효한 과제 ID가 아닙니다.'),
  submissionType: z.enum(['writing', 'lecture']),
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

  const supabase = await createServerSupabase()

  const ownsTask = await ensureStudentOwnsTask(supabase, parsed.studentTaskId, profile.id)

  if (!ownsTask) {
    return { success: false as const, error: '해당 과제에 접근할 수 없습니다.' }
  }

  const now = new Date().toISOString()
  const results: Array<{
    itemId: string
    passed: boolean
    grade?: string
    feedback?: string
  }> = []

  for (const answer of parsed.answers) {
    const rawContent = (answer.content ?? '').replace(/\r/g, '')
    const normalizedContent = rawContent.trim()
    const submissionIsEmpty = normalizedContent.length === 0

    const { data: allExisting, error: allExistingError } = await supabase
      .from('task_submissions')
      .select('id, created_at')
      .eq('student_task_id', parsed.studentTaskId)
      .eq('item_id', answer.workbookItemId)

    if (allExistingError) {
      console.error('[submitTextResponses] failed to load existing submission', allExistingError)
      return { success: false as const, error: '기존 답안을 불러오지 못했습니다.' }
    }

    const existing = allExisting && allExisting.length > 0 ? allExisting[0] : null

    if (allExisting && allExisting.length > 1) {
      const idsToRemove = allExisting.slice(1).map((r: {id: string}) => r.id)
      for (const dupId of idsToRemove) {
        await supabase.from('task_submissions').delete().eq('id', dupId)
      }
    }

    if (submissionIsEmpty) {
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

    console.log('[submitTextResponses] Querying workbook item with ID:', answer.workbookItemId)

    const { data: workbookItem, error: fetchError } = await supabase
      .rpc('get_workbook_item_for_grading', {
        p_workbook_item_id: answer.workbookItemId,
      })
      .maybeSingle<{
        prompt: string
        explanation: string | null
        grading_criteria: GradingCriteria | null
      }>()

    if (fetchError) {
      console.error('[submitTextResponses] RPC fetch error:', fetchError)
    }

    console.log('[submitTextResponses] Fetched workbook item:', workbookItem)

    let aiScore: 'pass' | 'nonpass' | null = null
    let aiFeedback: string | null = null
    let aiGrade: string | undefined

    if (workbookItem?.grading_criteria && !submissionIsEmpty) {
      const criteria = workbookItem.grading_criteria as unknown as GradingCriteria
      console.log('[submitTextResponses] Found criteria:', criteria)

      // Only evaluate if all criteria are present
      if (criteria.high && criteria.mid && criteria.low) {
        console.log('[submitTextResponses] Triggering AI evaluation...')
        const aiResult = await evaluateWritingSubmission(
          workbookItem.prompt,
          workbookItem.explanation ?? '',
          normalizedContent,
          criteria
        )
        console.log('[submitTextResponses] AI Result:', aiResult)

        if (!('error' in aiResult)) {
          aiGrade = aiResult.grade
          aiScore = aiResult.grade === 'High' ? 'pass' : 'nonpass'
          aiFeedback = `[AI 평가: ${aiResult.grade}]\n${aiResult.explanation}`
          console.log('[submitTextResponses] AI Score determined:', aiScore)
        } else {
          console.error('[submitTextResponses] AI evaluation returned error:', aiResult.error)
          return { success: false as const, error: aiResult.error }
        }
      } else {
        console.log('[submitTextResponses] Criteria incomplete, skipping AI evaluation')
      }
    } else {
      console.log('[submitTextResponses] No criteria or empty submission, skipping AI evaluation')
    }

    // Interactive Grading Logic:
    // If AI evaluation was performed and the score is NOT pass (i.e., not High),
    // we do NOT save the submission as completed. We return the feedback to the client
    // so the student can retry.
    if (aiScore === 'nonpass') {
      results.push({
        itemId: answer.workbookItemId,
        passed: false,
        grade: aiGrade,
        feedback: aiFeedback ?? undefined,
      })
      // Do not save to DB, or maybe save as draft?
      // For now, per requirement "중, 하 등급일 경우에는 완료 및 제출 되지 않고 다시 풀도록 해줘",
      // we will NOT save the submission to task_submissions if it fails the AI check.
      // However, to persist the draft, we might want to save it but NOT mark the item as completed.
      // Let's save the submission content so they don't lose it, but keep the item status as incomplete.
    } else {
      // Pass or no AI evaluation (manual grading needed later)
      results.push({
        itemId: answer.workbookItemId,
        passed: true,
        grade: aiGrade,
        feedback: aiFeedback ?? undefined,
      })
    }

    // Always save the submission content (draft or final)
    if (existing) {
      const updatePayload: Record<string, unknown> = {
        submission_type: parsed.submissionType,
        content: normalizedContent,
        media_asset_id: null,
        updated_at: now,
      }

      if (aiScore) {
        updatePayload.score = aiScore
        updatePayload.feedback = aiFeedback
      }

      const { error: updateError } = await supabase
        .from('task_submissions')
        .update(updatePayload)
        .eq('id', existing.id)

      if (updateError) {
        console.error('[submitTextResponses] failed to update submission', updateError)
        return { success: false as const, error: '답안을 저장하지 못했습니다.' }
      }
    } else {
      const insertPayload: Record<string, unknown> = {
        student_task_id: parsed.studentTaskId,
        item_id: answer.workbookItemId,
        submission_type: parsed.submissionType,
        content: normalizedContent,
      }

      if (aiScore) {
        insertPayload.score = aiScore
        insertPayload.feedback = aiFeedback
      }

      const { error: insertError } = await supabase.from('task_submissions').insert(insertPayload)

      if (insertError) {
        console.error('[submitTextResponses] failed to insert submission', insertError)
        return { success: false as const, error: '답안을 저장하지 못했습니다.' }
      }
    }

    // Update item status
    // Only mark as completed/pass if it's a pass or if there was no AI evaluation (manual grading flow)
    // If AI evaluated and it was nonpass, we keep it incomplete (or just submitted but not 'pass')
    // Requirement: "중, 하 등급일 경우에는 완료 및 제출 되지 않고 다시 풀도록 해줘" -> implies strictly NOT completed.

    const shouldMarkCompleted = aiScore === 'pass' || !aiScore // Pass or Manual Grading

    const itemUpdatePayload: Record<string, unknown> = {
      updated_at: now,
    }

    if (shouldMarkCompleted) {
      itemUpdatePayload.completed_at = now
      itemUpdatePayload.last_result = aiScore === 'pass' ? 'pass' : 'submitted'
    } else {
      // Failed AI check
      // We can reset completed_at to null to ensure it's treated as incomplete
      itemUpdatePayload.completed_at = null
      itemUpdatePayload.last_result = 'submitted' // Or maybe null? 'submitted' implies waiting for review, but here we want retry.
      // Let's keep it as 'submitted' so it shows they tried, but completed_at is null so it's not "done".
    }

    const { error: itemUpdateError } = await supabase
      .from('student_task_items')
      .update(itemUpdatePayload)
      .eq('id', answer.studentTaskItemId)

    if (itemUpdateError) {
      console.error('[submitTextResponses] failed to update student_task_item', itemUpdateError)
      return { success: false as const, error: '문항 상태를 업데이트하지 못했습니다.' }
    }
  }

  await refreshStudentTaskStatus(supabase, parsed.studentTaskId)

  revalidatePath('/dashboard/student/tasks')
  revalidatePath(`/dashboard/student/tasks/${parsed.studentTaskId}`)

  return { success: true as const, results }
}

export async function previewTextResponse(input: z.infer<typeof textResponsesSchema>) {
  const { profile } = await getAuthContext()

  if (!profile || !['teacher', 'manager', 'principal'].includes(profile.role)) {
    return { success: false as const, error: '권한이 없습니다.' }
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

  const supabase = await createServerSupabase()

  const results: Array<{
    itemId: string
    passed: boolean
    grade?: string
    feedback?: string
  }> = []

  for (const answer of parsed.answers) {
    const rawContent = (answer.content ?? '').replace(/\r/g, '')
    const normalizedContent = rawContent.trim()

    if (normalizedContent.length === 0) {
      continue
    }

    const { data: workbookItem, error: fetchError } = await supabase
      .from('workbook_items')
      .select('prompt, explanation, grading_criteria')
      .eq('id', answer.workbookItemId)
      .single()

    if (fetchError || !workbookItem) {
      console.error('[previewTextResponse] failed to fetch item', fetchError)
      return { success: false as const, error: '문항 정보를 불러오지 못했습니다.' }
    }

    if (workbookItem.grading_criteria) {
      const criteria = workbookItem.grading_criteria as unknown as GradingCriteria

      if (criteria.high && criteria.mid && criteria.low) {
        const aiResult = await evaluateWritingSubmission(
          workbookItem.prompt,
          workbookItem.explanation ?? '',
          normalizedContent,
          criteria
        )

        if (!('error' in aiResult)) {
          results.push({
            itemId: answer.workbookItemId,
            passed: aiResult.grade === 'High',
            grade: aiResult.grade,
            feedback: `[AI 평가: ${aiResult.grade}]\n${aiResult.explanation}`,
          })
        } else {
          return { success: false as const, error: aiResult.error }
        }
      }
    }
  }

  return { success: true as const, results }
}

const filmEntrySchema = z.object({
  title: z.string().optional().default(''),
  director: z.string().optional().default(''),
  releaseYear: z.string().optional().default(''),
  genre: z.string().optional().default(''),
  country: z.string().optional().default(''),
  summary: z.string().optional().default(''),
  favoriteScene: z.string().optional().default(''),
})

const filmResponsesSchema = z
  .object({
    studentTaskId: z.string().uuid('유효한 과제 ID가 아닙니다.'),
    studentTaskItemId: z.string().uuid('유효한 문항 ID가 아닙니다.'),
    workbookItemId: z.string().uuid('유효한 문제 ID가 아닙니다.'),
    noteCount: z.number().int().min(1).max(5),
    entries: z.array(filmEntrySchema),
  })
  .superRefine((value, ctx) => {
    if (value.entries.length < value.noteCount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['entries'],
        message: '감상지 개수와 동일한 답안을 전달해주세요.',
      })
    }
  })

const FILM_REQUIRED_KEYS = ['title', 'director', 'releaseYear', 'genre', 'country', 'summary', 'favoriteScene'] as const

const FILM_FIELD_LABELS: Record<(typeof FILM_REQUIRED_KEYS)[number], string> = {
  title: '영화 제목',
  director: '감독',
  releaseYear: '개봉 연도',
  genre: '장르',
  country: '국가',
  summary: '줄거리 요약',
  favoriteScene: '연출적으로 좋았던 장면',
}

function sanitizePlain(value: string): string {
  return value.replace(/\r/g, '').trim()
}

function isReleaseYearValid(value: string): boolean {
  if (value.length === 0) {
    return true
  }
  return /^\d{4}$/.test(value)
}

export async function submitFilmResponses(input: z.infer<typeof filmResponsesSchema>) {
  const { profile } = await getAuthContext()

  if (!profile || profile.role !== 'student') {
    return { success: false as const, error: '학생 계정으로만 제출할 수 있습니다.' }
  }

  const parsed = filmResponsesSchema.safeParse(input)

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]
    return { success: false as const, error: firstIssue?.message ?? '입력 값을 확인해주세요.' }
  }

  const payload = parsed.data

  const supabase = await createServerSupabase()

  const ownsTask = await ensureStudentOwnsTask(supabase, payload.studentTaskId, profile.id)

  if (!ownsTask) {
    return { success: false as const, error: '해당 과제에 접근할 수 없습니다.' }
  }

  const { data: studentTaskItem, error: studentTaskItemError } = await supabase
    .from('student_task_items')
    .select('id, student_task_id, item_id')
    .eq('id', payload.studentTaskItemId)
    .maybeSingle()

  if (studentTaskItemError) {
    console.error('[submitFilmResponses] failed to load student_task_item', studentTaskItemError)
    return { success: false as const, error: '문항 정보를 불러오지 못했습니다.' }
  }

  if (!studentTaskItem || studentTaskItem.student_task_id !== payload.studentTaskId) {
    return { success: false as const, error: '해당 문항에 접근할 수 없습니다.' }
  }

  if (studentTaskItem.item_id !== payload.workbookItemId) {
    return { success: false as const, error: '문항 정보가 올바르지 않습니다.' }
  }

  const { data: studentTaskRow, error: studentTaskError } = await supabase
    .from('student_tasks')
    .select('assignment_id')
    .eq('id', payload.studentTaskId)
    .maybeSingle()

  if (studentTaskError) {
    console.error('[submitFilmResponses] failed to load student_task assignment', studentTaskError)
    return { success: false as const, error: '과제 정보를 불러오지 못했습니다.' }
  }

  const assignmentId = (studentTaskRow as { assignment_id: string | null } | null)?.assignment_id ?? null

  const now = new Date().toISOString()
  const normalizedEntries = Array.from({ length: payload.noteCount }, (_, index) => {
    const entry = payload.entries[index] ?? {}
    return FILM_REQUIRED_KEYS.reduce((acc, key) => {
      acc[key] = sanitizePlain((entry as Record<string, string | undefined>)[key] ?? '')
      return acc
    }, {} as Record<(typeof FILM_REQUIRED_KEYS)[number], string>)
  })

  const entryStates = normalizedEntries.map((entry) => {
    const hasAnyValue = FILM_REQUIRED_KEYS.some((key) => entry[key].length > 0)
    const missingKeys = FILM_REQUIRED_KEYS.filter((key) => entry[key].length === 0)
    const isComplete = hasAnyValue && missingKeys.length === 0

    return {
      hasAnyValue,
      isComplete,
      missingKeys,
    }
  })

  for (let index = 0; index < normalizedEntries.length; index += 1) {
    const entry = normalizedEntries[index]
    const state = entryStates[index]

    if (!isReleaseYearValid(entry.releaseYear)) {
      return {
        success: false as const,
        error: `감상지 ${index + 1}: 개봉 연도는 4자리 숫자로 입력해주세요.`,
      }
    }

    if (state.hasAnyValue && !state.isComplete) {
      const labels = state.missingKeys.map((key) => FILM_FIELD_LABELS[key]).join(', ')
      return {
        success: false as const,
        error: `감상지 ${index + 1}: ${labels} 항목을 모두 작성해주세요.`,
      }
    }
  }

  const hasAnyValue = entryStates.some((state) => state.hasAnyValue)

  const completedEntries = entryStates.filter((state) => state.isComplete).length

  const { data: existingSubmission, error: existingSubmissionError } = await supabase
    .from('task_submissions')
    .select('id')
    .eq('student_task_id', payload.studentTaskId)
    .eq('item_id', payload.workbookItemId)
    .maybeSingle()

  if (existingSubmissionError) {
    console.error('[submitFilmResponses] failed to load existing submission', existingSubmissionError)
    return { success: false as const, error: '기존 감상지를 불러오지 못했습니다.' }
  }

  if (!hasAnyValue) {
    if (existingSubmission) {
      const { error: deleteError } = await supabase
        .from('task_submissions')
        .delete()
        .eq('id', existingSubmission.id)

      if (deleteError) {
        console.error('[submitFilmResponses] failed to delete submission', deleteError)
        return { success: false as const, error: '기존 감상지를 삭제하지 못했습니다.' }
      }
    }

    const { error: resetItemError } = await supabase
      .from('student_task_items')
      .update({
        completed_at: null,
        last_result: null,
        updated_at: now,
      })
      .eq('id', payload.studentTaskItemId)

    if (resetItemError) {
      console.error('[submitFilmResponses] failed to reset student_task_item', resetItemError)
      return { success: false as const, error: '문항 상태를 업데이트하지 못했습니다.' }
    }
  } else {
    const contentPayload = JSON.stringify({
      version: 2,
      noteCount: payload.noteCount,
      entries: normalizedEntries,
    })

    if (existingSubmission) {
      const { error: updateError } = await supabase
        .from('task_submissions')
        .update({
          submission_type: 'film',
          content: contentPayload,
          media_asset_id: null,
          updated_at: now,
        })
        .eq('id', existingSubmission.id)

      if (updateError) {
        console.error('[submitFilmResponses] failed to update submission', updateError)
        return { success: false as const, error: '감상지를 저장하지 못했습니다.' }
      }
    } else {
      const { error: insertError } = await supabase.from('task_submissions').insert({
        student_task_id: payload.studentTaskId,
        item_id: payload.workbookItemId,
        submission_type: 'film',
        content: contentPayload,
      })

      if (insertError) {
        console.error('[submitFilmResponses] failed to insert submission', insertError)
        return { success: false as const, error: '감상지를 저장하지 못했습니다.' }
      }
    }

    const shouldMarkCompleted = completedEntries >= payload.noteCount

    const { error: itemUpdateError } = await supabase
      .from('student_task_items')
      .update({
        completed_at: shouldMarkCompleted ? now : null,
        last_result: shouldMarkCompleted ? 'submitted' : null,
        updated_at: now,
      })
      .eq('id', payload.studentTaskItemId)

    if (itemUpdateError) {
      console.error('[submitFilmResponses] failed to update student_task_item', itemUpdateError)
      return { success: false as const, error: '문항 상태를 업데이트하지 못했습니다.' }
    }
  }

  const { data: taskRow, error: taskRowError } = await supabase
    .from('student_tasks')
    .select('progress_meta')
    .eq('id', payload.studentTaskId)
    .maybeSingle()

  if (taskRowError) {
    console.error('[submitFilmResponses] failed to load student_task progress meta', taskRowError)
    return { success: false as const, error: '과제 상태를 업데이트하지 못했습니다.' }
  }

  const rowsForUpsert = normalizedEntries.map((entry, index) => ({
    student_task_id: payload.studentTaskId,
    workbook_item_id: payload.workbookItemId,
    note_index: index,
    content: entry,
    completed: entryStates[index]?.isComplete ?? false,
    updated_at: now,
  }))

  const { error: upsertError } = await supabase
    .from('film_note_histories')
    .upsert(rowsForUpsert, { onConflict: 'student_task_id,workbook_item_id,note_index' })

  if (upsertError) {
    console.error('[submitFilmResponses] failed to upsert film_note_histories', upsertError)
    return { success: false as const, error: '감상지 기록을 저장하지 못했습니다.' }
  }

  const { error: cleanupError } = await supabase
    .from('film_note_histories')
    .delete()
    .eq('student_task_id', payload.studentTaskId)
    .eq('workbook_item_id', payload.workbookItemId)
    .gt('note_index', payload.noteCount - 1)

  if (cleanupError) {
    console.error('[submitFilmResponses] failed to cleanup film_note_histories', cleanupError)
    return { success: false as const, error: '감상지 기록 정리 중 오류가 발생했습니다.' }
  }

  const assignmentFilmNoteRows = normalizedEntries.map((entry, index) => ({
    entry,
    index,
    hasValue: entryStates[index]?.hasAnyValue ?? false,
    isComplete: entryStates[index]?.isComplete ?? false,
  }))

  const rowsForFilmNotes = assignmentFilmNoteRows
    .filter((row) => row.hasValue)
    .map((row) => ({
      student_id: profile.id,
      source: 'assignment' as const,
      assignment_id: assignmentId,
      student_task_id: payload.studentTaskId,
      workbook_item_id: payload.workbookItemId,
      note_index: row.index,
      content: row.entry,
      completed: row.isComplete,
      updated_at: now,
    }))

  const { error: clearFilmNotesError } = await supabase
    .from('film_notes')
    .delete()
    .eq('student_id', profile.id)
    .eq('source', 'assignment')
    .eq('student_task_id', payload.studentTaskId)
    .eq('workbook_item_id', payload.workbookItemId)

  if (clearFilmNotesError) {
    console.error('[submitFilmResponses] failed to clear film_notes rows', clearFilmNotesError)
    return { success: false as const, error: '감상지 기록을 저장하지 못했습니다.' }
  }

  if (rowsForFilmNotes.length > 0) {
    const { error: filmNotesInsertError } = await supabase.from('film_notes').insert(rowsForFilmNotes)

    if (filmNotesInsertError) {
      console.error('[submitFilmResponses] failed to insert film_notes', filmNotesInsertError)
      return { success: false as const, error: '감상지 기록을 저장하지 못했습니다.' }
    }
  }

  const currentProgress = (taskRow?.progress_meta as Record<string, unknown> | null) ?? {}
  const nextProgress = {
    ...currentProgress,
    film: {
      total: payload.noteCount,
      completed: hasAnyValue ? Math.min(completedEntries, payload.noteCount) : 0,
    },
  }

  const { error: progressUpdateError } = await supabase
    .from('student_tasks')
    .update({
      progress_meta: nextProgress,
      updated_at: now,
    })
    .eq('id', payload.studentTaskId)

  if (progressUpdateError) {
    console.error('[submitFilmResponses] failed to update progress_meta', progressUpdateError)
    return { success: false as const, error: '과제 상태를 업데이트하지 못했습니다.' }
  }

  await refreshStudentTaskStatus(supabase, payload.studentTaskId)

  revalidatePath('/dashboard/student/tasks')
  revalidatePath(`/dashboard/student/tasks/${payload.studentTaskId}`)
  revalidatePath('/dashboard/student/film-notes')

  return { success: true as const }
}

export async function submitPdfSubmission(formData: FormData) {
  const { profile } = await getAuthContext()

  if (!profile || profile.role !== 'student') {
    return { success: false as const, error: '학생 계정으로만 제출할 수 있습니다.' }
  }

  const studentTaskIdValue = formData.get('studentTaskId')
  if (typeof studentTaskIdValue !== 'string' || studentTaskIdValue.length === 0) {
    return { success: false as const, error: '과제 정보가 올바르지 않습니다.' }
  }

  const studentTaskId = studentTaskIdValue
  let uploadedFiles: UploadedFilePayload[] = []
  try {
    uploadedFiles = parseUploadedFileList(formData.get('uploadedFiles'))
    if (uploadedFiles.length === 0) {
      const legacyPayload = parseUploadedFilePayload(formData.get('uploadedFile'))
      if (legacyPayload) {
        uploadedFiles = [legacyPayload]
      }
    }
  } catch (error) {
    return { success: false as const, error: error instanceof Error ? error.message : '파일 정보를 확인하지 못했습니다.' }
  }

  const removedAssetIds = Array.from(
    new Set(
      formData
        .getAll('removedAssetIds')
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter((value): value is string => value.length > 0)
    )
  )

  if (uploadedFiles.length === 0 && removedAssetIds.length === 0) {
    return { success: false as const, error: '업로드할 PDF 파일을 추가하거나 삭제할 파일을 선택해주세요.' }
  }

  for (const file of uploadedFiles) {
    if (file.bucket !== SUBMISSIONS_BUCKET) {
      return { success: false as const, error: '허용되지 않은 저장소 경로입니다.' }
    }

    if (!file.path.startsWith(`student_tasks/${studentTaskId}/`)) {
      return { success: false as const, error: '파일 경로가 과제 정보와 일치하지 않습니다.' }
    }

    if (file.mimeType !== 'application/pdf') {
      return { success: false as const, error: 'PDF 파일만 업로드할 수 있습니다.' }
    }

    if (file.size > MAX_PDF_FILE_SIZE) {
      const maxMb = Math.round(MAX_PDF_FILE_SIZE / (1024 * 1024))
      return { success: false as const, error: `파일 용량은 최대 ${maxMb}MB까지 지원합니다.` }
    }
  }

  const supabase = await createServerSupabase()

  const ownsTask = await ensureStudentOwnsTask(supabase, studentTaskId, profile.id)

  if (!ownsTask) {
    return { success: false as const, error: '해당 과제에 접근할 수 없습니다.' }
  }

  const uploadedObjects: Array<{ bucket: string; path: string }> = []
  const createdMediaAssetIds: string[] = []
  let createdSubmissionId: string | null = null

  try {
    const { data: existingSubmission, error: existingSubmissionError } = await supabase
      .from('task_submissions')
      .select(
        `id,
         task_submission_assets(id, order_index, media_asset_id, media_asset:media_assets(id, bucket, path, metadata))`
      )
      .eq('student_task_id', studentTaskId)
      .is('item_id', null)
      .maybeSingle()

    if (existingSubmissionError) {
      console.error('[submitPdfSubmission] failed to load existing submission', existingSubmissionError)
      throw new Error('제출 정보를 불러오지 못했습니다.')
    }

    let submissionId = existingSubmission?.id ?? null

    if (!submissionId) {
      const { data: insertedSubmission, error: insertSubmissionError } = await supabase
        .from('task_submissions')
        .insert({
          student_task_id: studentTaskId,
          submission_type: 'pdf',
          content: null,
          media_asset_id: null,
        })
        .select('id')
        .single()

      if (insertSubmissionError || !insertedSubmission?.id) {
        console.error('[submitPdfSubmission] failed to insert task submission', insertSubmissionError)
        throw new Error('제출 정보를 저장하지 못했습니다.')
      }

      submissionId = insertedSubmission.id
      createdSubmissionId = insertedSubmission.id
    }

    const existingAssets = ((existingSubmission?.task_submission_assets ?? []) as Array<{
      id: string
      order_index: number | null
      media_asset_id: string | null
    }>).map((asset, index) => ({
      id: asset.id,
      mediaAssetId: asset.media_asset_id,
      order: asset.order_index ?? index,
    }))

    const removalTargets = removedAssetIds.map((assetId) => existingAssets.find((asset) => asset.id === assetId)).filter(
      (asset): asset is { id: string; mediaAssetId: string | null; order: number } => Boolean(asset)
    )

    if (removalTargets.length !== removedAssetIds.length) {
      throw new Error('삭제할 파일 정보를 찾지 못했습니다. 새로고침 후 다시 시도해주세요.')
    }

    const finalAssetCount = existingAssets.length - removalTargets.length + uploadedFiles.length

    if (finalAssetCount <= 0) {
      throw new Error('최소 1개의 PDF 파일을 업로드해주세요.')
    }

    let nextOrderIndex = existingAssets.length - removalTargets.length

    for (const file of uploadedFiles) {
      uploadedObjects.push({ bucket: file.bucket, path: file.path })
      const sanitizedName = sanitizeSubmissionFileName(file.originalName)

      const { data: mediaAsset, error: mediaAssetError } = await supabase
        .from('media_assets')
        .insert({
          owner_id: profile.id,
          scope: 'task_submission',
          bucket: SUBMISSIONS_BUCKET,
          path: file.path,
          mime_type: 'application/pdf',
          size: file.size,
          metadata: { originalName: sanitizedName },
        })
        .select('id')
        .single()

      if (mediaAssetError || !mediaAsset?.id) {
        console.error('[submitPdfSubmission] failed to insert media asset', mediaAssetError)
        throw new Error('제출 파일 정보를 저장하지 못했습니다.')
      }

      createdMediaAssetIds.push(mediaAsset.id)

      const { error: submissionAssetError } = await supabase
        .from('task_submission_assets')
        .insert({
          submission_id: submissionId,
          media_asset_id: mediaAsset.id,
          order_index: nextOrderIndex,
          created_by: profile.id,
        })

      if (submissionAssetError) {
        console.error('[submitPdfSubmission] failed to insert submission asset', submissionAssetError)
        throw new Error('제출 파일 정보를 저장하지 못했습니다.')
      }

      nextOrderIndex += 1

      const orphanIndex = uploadedObjects.findIndex((object) => object.path === file.path && object.bucket === file.bucket)
      if (orphanIndex >= 0) {
        uploadedObjects.splice(orphanIndex, 1)
      }
    }

    // NOTE: latestAssets 조회를 삭제 전에 수행하여 새 asset 정보를 확보
    const { data: latestAssets, error: latestAssetsError } = await supabase
      .from('task_submission_assets')
      .select('id, order_index, media_asset:media_assets(id, metadata)')
      .eq('submission_id', submissionId)
      .order('order_index', { ascending: true })

    if (latestAssetsError) {
      console.error('[submitPdfSubmission] failed to reload submission assets', latestAssetsError)
      throw new Error('제출 파일 정보를 불러오지 못했습니다.')
    }

    // 삭제할 asset을 제외한 유효한 asset만 필터링
    const removedMediaAssetIds = new Set(removalTargets.map((t) => t.mediaAssetId).filter(Boolean))
    const normalizedAssets = (latestAssets ?? [])
      .map((asset, index) => ({
        id: asset.id,
        orderIndex: asset.order_index ?? index,
        mediaAsset: Array.isArray(asset.media_asset) ? asset.media_asset[0] : asset.media_asset,
      }))
      .filter((asset) => asset.mediaAsset?.id && !removedMediaAssetIds.has(asset.mediaAsset.id))

    if (normalizedAssets.length === 0) {
      throw new Error('최소 1개의 PDF 파일을 업로드해주세요.')
    }

    const primaryAsset = normalizedAssets[0]?.mediaAsset ?? null
    const primaryAssetId = primaryAsset?.id ?? null
    const primaryName = (primaryAsset?.metadata as { originalName?: string } | null)?.originalName ?? null

    const workbookType = await resolveWorkbookTypeForStudentTask(supabase, studentTaskId)

    // IMPORTANT: atelier/essay 동기화를 먼저 수행하여 새 asset으로 업데이트
    // removeMediaAsset이 CASCADE로 atelier_post_assets를 삭제할 때
    // 트리거가 NULL 설정을 시도하는 문제를 방지
    if (primaryAssetId) {
      if (workbookType === 'essay') {
        await syncEssayPostForSubmission({
          studentTaskId,
          studentId: profile.id,
          taskSubmissionId: submissionId,
          mediaAssetId: primaryAssetId,
        })
      } else {
        await syncAtelierPostForPdfSubmission({
          studentTaskId,
          studentId: profile.id,
          taskSubmissionId: submissionId,
          mediaAssetId: primaryAssetId,
        })
      }
    }

    // 이제 이전 파일 삭제 (atelier가 이미 새 asset을 참조하므로 안전)
    for (const asset of removalTargets) {
      if (asset.mediaAssetId) {
        await removeMediaAsset(supabase, asset.mediaAssetId)
      }
    }

    // order_index 재정렬
    for (let index = 0; index < normalizedAssets.length; index += 1) {
      const asset = normalizedAssets[index]
      if (asset.orderIndex !== index) {
        const { error: reorderError } = await supabase
          .from('task_submission_assets')
          .update({ order_index: index })
          .eq('id', asset.id)

        if (reorderError) {
          console.error('[submitPdfSubmission] failed to reorder submission assets', reorderError)
        } else {
          asset.orderIndex = index
        }
      }
    }

    const { error: updateSubmissionError } = await supabase
      .from('task_submissions')
      .update({
        submission_type: 'pdf',
        content: primaryName ?? 'PDF 제출',
        media_asset_id: primaryAssetId,
      })
      .eq('id', submissionId)

    if (updateSubmissionError) {
      console.error('[submitPdfSubmission] failed to update submission record', updateSubmissionError)
      throw new Error('제출 정보를 저장하지 못했습니다.')
    }

    await supabase
      .from('student_tasks')
      .update({ status: 'completed', completion_at: new Date().toISOString() })
      .eq('id', studentTaskId)

    revalidatePath('/dashboard/student/tasks')
    revalidatePath(`/dashboard/student/tasks/${studentTaskId}`)
    if (workbookType === 'essay') {
      revalidatePath('/dashboard/student/essay')
      revalidatePath('/dashboard/teacher/essay')
    } else {
      revalidatePath('/dashboard/student/atelier')
      revalidatePath('/dashboard/teacher/atelier')
    }

    return { success: true as const }
  } catch (error) {
    console.error('[submitPdfSubmission] unexpected error', error)

    for (const mediaAssetId of createdMediaAssetIds) {
      await removeMediaAsset(supabase, mediaAssetId)
    }

    for (const object of uploadedObjects) {
      await supabase.storage.from(object.bucket).remove([object.path])
    }

    if (createdSubmissionId) {
      await supabase.from('task_submissions').delete().eq('id', createdSubmissionId)
    }

    return {
      success: false as const,
      error: error instanceof Error ? error.message : '제출 처리 중 오류가 발생했습니다.',
    }
  }
}

type AnySupabaseClient = SupabaseClient

async function resolveWorkbookTypeForStudentTask(
  supabase: AnySupabaseClient,
  studentTaskId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('student_tasks')
    .select('assignment:assignments(workbook:workbooks(type))')
    .eq('id', studentTaskId)
    .maybeSingle()

  if (error) {
    console.error('[student-task-actions] failed to resolve workbook type', error)
    return null
  }

  const assignment = Array.isArray(data?.assignment) ? data?.assignment[0] : data?.assignment
  const workbook = Array.isArray(assignment?.workbook) ? assignment?.workbook[0] : assignment?.workbook
  const type = typeof workbook?.type === 'string' ? workbook.type : null
  return type
}

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

  const { data: taskRow, error: taskRowError } = await supabase
    .from('student_tasks')
    .select('progress_meta')
    .eq('id', studentTaskId)
    .maybeSingle()

  if (taskRowError) {
    console.error('[student-task-actions] failed to load task progress meta', taskRowError)
    return
  }

  const filmProgress = (() => {
    const meta = taskRow?.progress_meta
    if (!meta || typeof meta !== 'object') {
      return null
    }
    const film = (meta as { film?: unknown }).film
    if (!film || typeof film !== 'object') {
      return null
    }

    const total = Number((film as { total?: unknown }).total)
    const completed = Number((film as { completed?: unknown }).completed)

    if (!Number.isFinite(total) || total <= 0) {
      return null
    }

    return {
      total,
      completed: Number.isFinite(completed) ? Math.max(0, Math.min(completed, total)) : 0,
    }
  })()

  let total = items?.length ?? 0
  let completedCount = (items ?? []).filter((item) => Boolean(item.completed_at)).length

  if (filmProgress) {
    total = filmProgress.total
    completedCount = filmProgress.completed
  }

  let status: 'not_started' | 'in_progress' | 'completed'
  if (total === 0) {
    status = 'in_progress'
  } else if (completedCount === 0) {
    status = filmProgress && filmProgress.completed > 0 ? 'in_progress' : 'not_started'
  } else if (completedCount >= total) {
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

const imageUploadPayloadSchema = z.object({
  bucket: z.string(),
  path: z.string(),
  size: z.number(),
  mimeType: z.string(),
  originalName: z.string(),
})

const imageResponsesSchema = z.object({
  studentTaskId: z.string().uuid('유효한 과제 ID가 아닙니다.'),
  studentTaskItemId: z.string().uuid('유효한 문항 ID가 아닙니다.'),
  workbookItemId: z.string().uuid('유효한 문제 ID가 아닙니다.'),
  uploads: z.array(imageUploadPayloadSchema).min(1, '최소 1장의 이미지를 업로드해주세요.').max(MAX_IMAGES_PER_QUESTION, `최대 ${MAX_IMAGES_PER_QUESTION}장까지 업로드할 수 있습니다.`),
  description: z.string().max(2000, '설명은 최대 2000자까지 작성할 수 있습니다.').optional(),
})

const updateImageSubmissionSchema = z.object({
  studentTaskId: z.string().uuid('유효한 과제 ID가 아닙니다.'),
  studentTaskItemId: z.string().uuid('유효한 문항 ID가 아닙니다.'),
  workbookItemId: z.string().uuid('유효한 문제 ID가 아닙니다.'),
  uploads: z.array(imageUploadPayloadSchema).max(MAX_IMAGES_PER_QUESTION, `최대 ${MAX_IMAGES_PER_QUESTION}장까지 업로드할 수 있습니다.`).default([]),
  removedAssetIds: z.array(z.string().uuid()).default([]),
  description: z.string().max(2000, '설명은 최대 2000자까지 작성할 수 있습니다.').optional(),
})

export async function submitImageResponses(input: z.infer<typeof imageResponsesSchema>) {
  const { profile } = await getAuthContext()

  if (!profile || profile.role !== 'student') {
    return { success: false as const, error: '학생 계정으로만 제출할 수 있습니다.' }
  }

  const parsed = imageResponsesSchema.safeParse(input)

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]
    return { success: false as const, error: firstIssue?.message ?? '입력 값을 확인해주세요.' }
  }

  const payload = parsed.data

  // Validate file sizes
  for (const upload of payload.uploads) {
    if (upload.size > MAX_IMAGE_FILE_SIZE) {
      const maxMb = Math.round(MAX_IMAGE_FILE_SIZE / (1024 * 1024))
      return { success: false as const, error: `이미지 파일 크기는 최대 ${maxMb}MB까지 지원합니다.` }
    }

    if (upload.bucket !== SUBMISSIONS_BUCKET) {
      return { success: false as const, error: '허용되지 않은 저장소 경로입니다.' }
    }

    if (!upload.path.startsWith(`student_tasks/${payload.studentTaskId}/`)) {
      return { success: false as const, error: '파일 경로가 과제 정보와 일치하지 않습니다.' }
    }

    if (!upload.mimeType.startsWith('image/')) {
      return { success: false as const, error: '이미지 파일만 업로드할 수 있습니다.' }
    }
  }

  const supabase = await createServerSupabase()

  const ownsTask = await ensureStudentOwnsTask(supabase, payload.studentTaskId, profile.id)

  if (!ownsTask) {
    return { success: false as const, error: '해당 과제에 접근할 수 없습니다.' }
  }

  const { data: studentTaskItem, error: studentTaskItemError } = await supabase
    .from('student_task_items')
    .select('id, student_task_id, item_id')
    .eq('id', payload.studentTaskItemId)
    .maybeSingle()

  if (studentTaskItemError) {
    console.error('[submitImageResponses] failed to load student_task_item', studentTaskItemError)
    return { success: false as const, error: '문항 정보를 불러오지 못했습니다.' }
  }

  if (!studentTaskItem || studentTaskItem.student_task_id !== payload.studentTaskId) {
    return { success: false as const, error: '해당 문항에 접근할 수 없습니다.' }
  }

  if (studentTaskItem.item_id !== payload.workbookItemId) {
    return { success: false as const, error: '문항 정보가 올바르지 않습니다.' }
  }

  const now = new Date().toISOString()
  const createdMediaAssetIds: string[] = []

  try {
    // Check for existing submission
    const { data: existingSubmission, error: existingSubmissionError } = await supabase
      .from('task_submissions')
      .select('id, task_submission_assets(id, media_asset_id)')
      .eq('student_task_id', payload.studentTaskId)
      .eq('item_id', payload.workbookItemId)
      .maybeSingle()

    if (existingSubmissionError) {
      console.error('[submitImageResponses] failed to load existing submission', existingSubmissionError)
      return { success: false as const, error: '기존 제출 정보를 불러오지 못했습니다.' }
    }

    let submissionId = existingSubmission?.id ?? null

    // Remove existing assets if any
    if (existingSubmission) {
      const existingAssets = (existingSubmission.task_submission_assets ?? []) as Array<{
        id: string
        media_asset_id: string | null
      }>

      for (const asset of existingAssets) {
        if (asset.media_asset_id) {
          await removeMediaAsset(supabase, asset.media_asset_id)
        }
      }

      // Delete existing submission assets
      const { error: deleteAssetsError } = await supabase
        .from('task_submission_assets')
        .delete()
        .eq('submission_id', existingSubmission.id)

      if (deleteAssetsError) {
        console.error('[submitImageResponses] failed to delete existing submission assets', deleteAssetsError)
      }
    }

    // Create or update submission
    const submissionContent = payload.description || `이미지 ${payload.uploads.length}장 제출`
    if (!submissionId) {
      const { data: insertedSubmission, error: insertSubmissionError } = await supabase
        .from('task_submissions')
        .insert({
          student_task_id: payload.studentTaskId,
          item_id: payload.workbookItemId,
          submission_type: 'image',
          content: submissionContent,
        })
        .select('id')
        .single()

      if (insertSubmissionError || !insertedSubmission?.id) {
        console.error('[submitImageResponses] failed to insert submission', insertSubmissionError)
        return { success: false as const, error: '제출 정보를 저장하지 못했습니다.' }
      }

      submissionId = insertedSubmission.id
    } else {
      const { error: updateSubmissionError } = await supabase
        .from('task_submissions')
        .update({
          submission_type: 'image',
          content: submissionContent,
          updated_at: now,
        })
        .eq('id', submissionId)

      if (updateSubmissionError) {
        console.error('[submitImageResponses] failed to update submission', updateSubmissionError)
        return { success: false as const, error: '제출 정보를 업데이트하지 못했습니다.' }
      }
    }

    // Create media assets and submission assets
    for (let index = 0; index < payload.uploads.length; index++) {
      const upload = payload.uploads[index]
      const sanitizedName = upload.originalName.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 255) || 'image.jpg'

      const { data: mediaAsset, error: mediaAssetError } = await supabase
        .from('media_assets')
        .insert({
          owner_id: profile.id,
          scope: 'task_submission',
          bucket: SUBMISSIONS_BUCKET,
          path: upload.path,
          mime_type: upload.mimeType,
          size: upload.size,
          metadata: { originalName: sanitizedName },
        })
        .select('id')
        .single()

      if (mediaAssetError || !mediaAsset?.id) {
        console.error('[submitImageResponses] failed to insert media asset', mediaAssetError)
        throw new Error('이미지 정보를 저장하지 못했습니다.')
      }

      createdMediaAssetIds.push(mediaAsset.id)

      const { error: submissionAssetError } = await supabase
        .from('task_submission_assets')
        .insert({
          submission_id: submissionId,
          media_asset_id: mediaAsset.id,
          order_index: index,
          created_by: profile.id,
        })

      if (submissionAssetError) {
        console.error('[submitImageResponses] failed to insert submission asset', submissionAssetError)
        throw new Error('제출 파일 정보를 저장하지 못했습니다.')
      }
    }

    // Mark item as completed
    const { error: itemUpdateError } = await supabase
      .from('student_task_items')
      .update({
        completed_at: now,
        last_result: 'submitted',
        updated_at: now,
      })
      .eq('id', payload.studentTaskItemId)

    if (itemUpdateError) {
      console.error('[submitImageResponses] failed to update student_task_item', itemUpdateError)
      return { success: false as const, error: '문항 상태를 업데이트하지 못했습니다.' }
    }

    // Refresh task status
    await refreshStudentTaskStatus(supabase, payload.studentTaskId)

    revalidatePath('/dashboard/student/tasks')
    revalidatePath(`/dashboard/student/tasks/${payload.studentTaskId}`)
    revalidatePath('/dashboard/student/photo-diary')

    return { success: true as const }
  } catch (error) {
    console.error('[submitImageResponses] unexpected error', error)

    // Cleanup created assets on error
    for (const mediaAssetId of createdMediaAssetIds) {
      await removeMediaAsset(supabase, mediaAssetId)
    }

    return {
      success: false as const,
      error: error instanceof Error ? error.message : '제출 처리 중 오류가 발생했습니다.',
    }
  }
}

/**
 * 이미지 제출 수정 - 기존 이미지 개별 삭제 및 새 이미지 추가
 */
export async function updateImageSubmission(input: z.infer<typeof updateImageSubmissionSchema>) {
  const { profile } = await getAuthContext()

  if (!profile || profile.role !== 'student') {
    return { success: false as const, error: '학생 계정으로만 수정할 수 있습니다.' }
  }

  const parsed = updateImageSubmissionSchema.safeParse(input)

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]
    return { success: false as const, error: firstIssue?.message ?? '입력 값을 확인해주세요.' }
  }

  const payload = parsed.data

  // 아무 작업도 없으면 에러 (이미지 추가/삭제 또는 설명 변경이 있어야 함)
  const hasImageChanges = payload.uploads.length > 0 || payload.removedAssetIds.length > 0
  // description이 undefined가 아니면 변경된 것 (빈 문자열도 변경으로 처리)
  const hasDescriptionChange = 'description' in input && input.description !== undefined
  if (!hasImageChanges && !hasDescriptionChange) {
    return { success: false as const, error: '변경 사항이 없습니다.' }
  }

  // Validate new uploads
  for (const upload of payload.uploads) {
    if (upload.size > MAX_IMAGE_FILE_SIZE) {
      const maxMb = Math.round(MAX_IMAGE_FILE_SIZE / (1024 * 1024))
      return { success: false as const, error: `이미지 파일 크기는 최대 ${maxMb}MB까지 지원합니다.` }
    }

    if (upload.bucket !== SUBMISSIONS_BUCKET) {
      return { success: false as const, error: '허용되지 않은 저장소 경로입니다.' }
    }

    if (!upload.path.startsWith(`student_tasks/${payload.studentTaskId}/`)) {
      return { success: false as const, error: '파일 경로가 과제 정보와 일치하지 않습니다.' }
    }

    if (!upload.mimeType.startsWith('image/')) {
      return { success: false as const, error: '이미지 파일만 업로드할 수 있습니다.' }
    }
  }

  const supabase = await createServerSupabase()

  const ownsTask = await ensureStudentOwnsTask(supabase, payload.studentTaskId, profile.id)

  if (!ownsTask) {
    return { success: false as const, error: '해당 과제에 접근할 수 없습니다.' }
  }

  const { data: studentTaskItem, error: studentTaskItemError } = await supabase
    .from('student_task_items')
    .select('id, student_task_id, item_id')
    .eq('id', payload.studentTaskItemId)
    .maybeSingle()

  if (studentTaskItemError) {
    console.error('[updateImageSubmission] failed to load student_task_item', studentTaskItemError)
    return { success: false as const, error: '문항 정보를 불러오지 못했습니다.' }
  }

  if (!studentTaskItem || studentTaskItem.student_task_id !== payload.studentTaskId) {
    return { success: false as const, error: '해당 문항에 접근할 수 없습니다.' }
  }

  if (studentTaskItem.item_id !== payload.workbookItemId) {
    return { success: false as const, error: '문항 정보가 올바르지 않습니다.' }
  }

  const now = new Date().toISOString()
  const createdMediaAssetIds: string[] = []

  try {
    // 기존 submission 조회
    const { data: existingSubmission, error: existingSubmissionError } = await supabase
      .from('task_submissions')
      .select('id, task_submission_assets(id, media_asset_id, order_index)')
      .eq('student_task_id', payload.studentTaskId)
      .eq('item_id', payload.workbookItemId)
      .maybeSingle()

    if (existingSubmissionError) {
      console.error('[updateImageSubmission] failed to load existing submission', existingSubmissionError)
      return { success: false as const, error: '기존 제출 정보를 불러오지 못했습니다.' }
    }

    let submissionId = existingSubmission?.id ?? null
    const existingAssets = (existingSubmission?.task_submission_assets ?? []) as Array<{
      id: string
      media_asset_id: string | null
      order_index: number | null
    }>

    // 삭제 대상 asset 확인
    const assetsToRemove = existingAssets.filter((asset) =>
      payload.removedAssetIds.includes(asset.id)
    )
    const remainingAssets = existingAssets.filter((asset) =>
      !payload.removedAssetIds.includes(asset.id)
    )

    // 최종 이미지 개수 체크
    const finalImageCount = remainingAssets.length + payload.uploads.length

    if (finalImageCount === 0) {
      return { success: false as const, error: '최소 1장의 이미지가 필요합니다.' }
    }

    if (finalImageCount > MAX_IMAGES_PER_QUESTION) {
      return { success: false as const, error: `최대 ${MAX_IMAGES_PER_QUESTION}장까지 업로드할 수 있습니다.` }
    }

    // submission content: 사용자 입력 설명 또는 기본값
    const submissionContent = payload.description || `이미지 ${finalImageCount}장 제출`

    // submission이 없으면 생성
    if (!submissionId) {
      const { data: insertedSubmission, error: insertSubmissionError } = await supabase
        .from('task_submissions')
        .insert({
          student_task_id: payload.studentTaskId,
          item_id: payload.workbookItemId,
          submission_type: 'image',
          content: submissionContent,
        })
        .select('id')
        .single()

      if (insertSubmissionError || !insertedSubmission?.id) {
        console.error('[updateImageSubmission] failed to insert submission', insertSubmissionError)
        return { success: false as const, error: '제출 정보를 저장하지 못했습니다.' }
      }

      submissionId = insertedSubmission.id
    }

    // 선택된 asset 삭제
    for (const asset of assetsToRemove) {
      if (asset.media_asset_id) {
        await removeMediaAsset(supabase, asset.media_asset_id)
      }
      await supabase.from('task_submission_assets').delete().eq('id', asset.id)
    }

    // 새 이미지 추가
    let nextOrderIndex = Math.max(0, ...remainingAssets.map((a) => (a.order_index ?? 0) + 1))

    for (const upload of payload.uploads) {
      const sanitizedName = upload.originalName.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 255) || 'image.jpg'

      const { data: mediaAsset, error: mediaAssetError } = await supabase
        .from('media_assets')
        .insert({
          owner_id: profile.id,
          scope: 'task_submission',
          bucket: SUBMISSIONS_BUCKET,
          path: upload.path,
          mime_type: upload.mimeType,
          size: upload.size,
          metadata: { originalName: sanitizedName },
        })
        .select('id')
        .single()

      if (mediaAssetError || !mediaAsset?.id) {
        console.error('[updateImageSubmission] failed to insert media asset', mediaAssetError)
        throw new Error('이미지 정보를 저장하지 못했습니다.')
      }

      createdMediaAssetIds.push(mediaAsset.id)

      const { error: submissionAssetError } = await supabase
        .from('task_submission_assets')
        .insert({
          submission_id: submissionId,
          media_asset_id: mediaAsset.id,
          order_index: nextOrderIndex,
          created_by: profile.id,
        })

      if (submissionAssetError) {
        console.error('[updateImageSubmission] failed to insert submission asset', submissionAssetError)
        throw new Error('제출 파일 정보를 저장하지 못했습니다.')
      }

      nextOrderIndex += 1
    }

    // submission content 업데이트
    const { error: updateSubmissionError } = await supabase
      .from('task_submissions')
      .update({
        content: submissionContent,
        updated_at: now,
      })
      .eq('id', submissionId)

    if (updateSubmissionError) {
      console.error('[updateImageSubmission] failed to update submission', updateSubmissionError)
    }

    // 문항 상태 업데이트 (완료 유지)
    const { error: itemUpdateError } = await supabase
      .from('student_task_items')
      .update({
        completed_at: now,
        last_result: 'submitted',
        updated_at: now,
      })
      .eq('id', payload.studentTaskItemId)

    if (itemUpdateError) {
      console.error('[updateImageSubmission] failed to update student_task_item', itemUpdateError)
      return { success: false as const, error: '문항 상태를 업데이트하지 못했습니다.' }
    }

    // 과제 상태 갱신
    await refreshStudentTaskStatus(supabase, payload.studentTaskId)

    revalidatePath('/dashboard/student/tasks')
    revalidatePath(`/dashboard/student/tasks/${payload.studentTaskId}`)
    revalidatePath('/dashboard/student/photo-diary')

    return { success: true as const }
  } catch (error) {
    console.error('[updateImageSubmission] unexpected error', error)

    // 에러 발생 시 생성한 asset 정리
    for (const mediaAssetId of createdMediaAssetIds) {
      await removeMediaAsset(supabase, mediaAssetId)
    }

    return {
      success: false as const,
      error: error instanceof Error ? error.message : '수정 처리 중 오류가 발생했습니다.',
    }
  }
}
