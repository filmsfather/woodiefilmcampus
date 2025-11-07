'use server'

import type { SupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { getAuthContext } from '@/lib/auth'
import { syncAtelierPostForPdfSubmission } from '@/lib/atelier-posts'
import { createClient as createServerSupabase } from '@/lib/supabase/server'
import { SUBMISSIONS_BUCKET } from '@/lib/storage/buckets'
import { MAX_PDF_FILE_SIZE } from '@/lib/storage/limits'

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
  return trimmed.replace(/[^a-zA-Z0-9_.-]/g, '_') || fallback
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

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('파일 정보 형식이 올바르지 않습니다.')
  }

  const record = parsed as Record<string, unknown>
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

  const supabase = createServerSupabase()

  const ownsTask = await ensureStudentOwnsTask(supabase, parsed.studentTaskId, profile.id)

  if (!ownsTask) {
    return { success: false as const, error: '해당 과제에 접근할 수 없습니다.' }
  }

  const now = new Date().toISOString()

  for (const answer of parsed.answers) {
    const rawContent = (answer.content ?? '').replace(/\r/g, '')
    const normalizedContent = rawContent.trim()
    const submissionIsEmpty = normalizedContent.length === 0

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

    if (existing) {
      const { error: updateError } = await supabase
        .from('task_submissions')
        .update({
          submission_type: parsed.submissionType,
          content: normalizedContent,
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
        content: normalizedContent,
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

  revalidatePath('/dashboard/student/tasks')
  revalidatePath(`/dashboard/student/tasks/${parsed.studentTaskId}`)

  return { success: true as const }
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

  const supabase = createServerSupabase()

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

  let uploadedFile: UploadedFilePayload | null = null
  try {
    uploadedFile = parseUploadedFilePayload(formData.get('uploadedFile'))
  } catch (error) {
    return { success: false as const, error: error instanceof Error ? error.message : '파일 정보를 확인하지 못했습니다.' }
  }

  const supabase = createServerSupabase()

  const ownsTask = await ensureStudentOwnsTask(supabase, studentTaskId, profile.id)

  if (!ownsTask) {
    return { success: false as const, error: '해당 과제에 접근할 수 없습니다.' }
  }

  if (!uploadedFile) {
    return { success: false as const, error: '업로드할 PDF 파일을 선택해주세요.' }
  }

  if (uploadedFile.bucket !== SUBMISSIONS_BUCKET) {
    return { success: false as const, error: '허용되지 않은 저장소 경로입니다.' }
  }

  if (!uploadedFile.path.startsWith(`student_tasks/${studentTaskId}/`)) {
    return { success: false as const, error: '파일 경로가 과제 정보와 일치하지 않습니다.' }
  }

  if (uploadedFile.mimeType !== 'application/pdf') {
    return { success: false as const, error: 'PDF 파일만 업로드할 수 있습니다.' }
  }

  if (uploadedFile.size > MAX_PDF_FILE_SIZE) {
    const maxMb = Math.round(MAX_PDF_FILE_SIZE / (1024 * 1024))
    return { success: false as const, error: `파일 용량은 최대 ${maxMb}MB까지 지원합니다.` }
  }

  const sanitizedName = sanitizeSubmissionFileName(uploadedFile.originalName)
  const storagePath = uploadedFile.path

  const uploadedObjects: Array<{ bucket: string; path: string }> = [{ bucket: SUBMISSIONS_BUCKET, path: storagePath }]

  try {
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
        size: uploadedFile.size,
        metadata: { originalName: sanitizedName },
      })
      .select('id')
      .single()

    if (mediaAssetError) {
      console.error('[submitPdfSubmission] failed to insert media_assets', mediaAssetError)
      throw new Error('제출 파일 정보를 저장하지 못했습니다.')
    }

    let taskSubmissionId = existingSubmission?.id ?? null

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
      const { data: insertedSubmission, error: insertError } = await supabase
        .from('task_submissions')
        .insert({
          student_task_id: studentTaskId,
          submission_type: 'pdf',
          content: sanitizedName,
          media_asset_id: mediaAsset.id,
        })
        .select('id')
        .single()

      if (insertError || !insertedSubmission?.id) {
        console.error('[submitPdfSubmission] failed to insert task_submissions', insertError)
        throw new Error('제출 정보를 저장하지 못했습니다.')
      }

      taskSubmissionId = insertedSubmission.id
    }

    await supabase
      .from('student_tasks')
      .update({ status: 'completed', completion_at: new Date().toISOString() })
      .eq('id', studentTaskId)

    if (oldAssetId) {
      await removeMediaAsset(supabase, oldAssetId)
    }

    const effectiveSubmissionId = taskSubmissionId ?? existingSubmission?.id ?? null

    if (effectiveSubmissionId) {
      await syncAtelierPostForPdfSubmission({
        studentTaskId,
        studentId: profile.id,
        taskSubmissionId: effectiveSubmissionId,
        mediaAssetId: mediaAsset.id,
      })
    }

    revalidatePath('/dashboard/student/tasks')
    revalidatePath(`/dashboard/student/tasks/${studentTaskId}`)
    revalidatePath('/dashboard/student/atelier')
    revalidatePath('/dashboard/teacher/atelier')

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
