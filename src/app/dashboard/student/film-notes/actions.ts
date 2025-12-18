'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { getAuthContext } from '@/lib/auth'
import {
  sanitizeFilmEntry,
  hasFilmEntryValue,
  isFilmEntryComplete,
  type FilmNoteEntry,
} from '@/lib/film-notes'
import { createClient as createServerSupabase } from '@/lib/supabase/server'

const filmNoteEntrySchema = z.object({
  title: z.string().max(200).optional().default(''),
  director: z.string().max(200).optional().default(''),
  releaseYear: z.string().max(4).optional().default(''),
  genre: z.string().max(200).optional().default(''),
  country: z.string().max(200).optional().default(''),
  summary: z.string().optional().default(''),
  favoriteScene: z.string().optional().default(''),
})

type NormalizedEntryResult = { success: true; entry: FilmNoteEntry } | { success: false; error: string }

function normalizeEntry(input: unknown): NormalizedEntryResult {
  let parsed: z.infer<typeof filmNoteEntrySchema>

  try {
    parsed = filmNoteEntrySchema.parse(input)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error: error.issues[0]?.message ?? '입력 값을 확인해주세요.' }
    }
    return { success: false, error: '입력 값을 확인해주세요.' }
  }

  const sanitized = sanitizeFilmEntry(parsed)

  if (sanitized.releaseYear && sanitized.releaseYear.length > 0 && !/^\d{4}$/.test(sanitized.releaseYear)) {
    return { success: false, error: '개봉 연도는 4자리 숫자로 입력해주세요.' }
  }

  if (!hasFilmEntryValue(sanitized)) {
    return { success: false, error: '감상 내용을 한 글자 이상 입력해주세요.' }
  }

  return { success: true, entry: sanitized }
}

const createPersonalFilmNoteSchema = z.object({
  content: z.unknown(),
})

export async function createPersonalFilmNote(input: z.infer<typeof createPersonalFilmNoteSchema>) {
  const { profile } = await getAuthContext()

  if (!profile || profile.role !== 'student') {
    return { success: false as const, error: '학생 계정으로만 사용할 수 있습니다.' }
  }

  const parsedInput = createPersonalFilmNoteSchema.safeParse(input)

  if (!parsedInput.success) {
    return { success: false as const, error: '입력 값을 확인해주세요.' }
  }

  const normalized = normalizeEntry(parsedInput.data.content)

  if (!normalized.success) {
    return { success: false as const, error: normalized.error }
  }

  const entry = normalized.entry
  const isComplete = isFilmEntryComplete(entry)

  const supabase = await createServerSupabase()

  const { error } = await supabase.from('film_notes').insert({
    student_id: profile.id,
    source: 'personal',
    content: entry,
    completed: isComplete,
  })

  if (error) {
    console.error('[createPersonalFilmNote] insert failed', error)
    return { success: false as const, error: '감상지를 저장하지 못했습니다.' }
  }

  revalidatePath('/dashboard/student/film-notes')
  return { success: true as const }
}

const updatePersonalFilmNoteSchema = z.object({
  noteId: z.string().uuid('유효한 감상지 ID가 아닙니다.'),
  content: z.unknown(),
})

export async function updatePersonalFilmNote(input: z.infer<typeof updatePersonalFilmNoteSchema>) {
  const { profile } = await getAuthContext()

  if (!profile || profile.role !== 'student') {
    return { success: false as const, error: '학생 계정으로만 사용할 수 있습니다.' }
  }

  const parsedInput = updatePersonalFilmNoteSchema.safeParse(input)

  if (!parsedInput.success) {
    return { success: false as const, error: parsedInput.error.issues[0]?.message ?? '입력 값을 확인해주세요.' }
  }

  const normalized = normalizeEntry(parsedInput.data.content)

  if (!normalized.success) {
    return { success: false as const, error: normalized.error }
  }

  const entry = normalized.entry
  const isComplete = isFilmEntryComplete(entry)

  const supabase = await createServerSupabase()

  const { data: existing, error: fetchError } = await supabase
    .from('film_notes')
    .select('id, student_id, source')
    .eq('id', parsedInput.data.noteId)
    .maybeSingle()

  if (fetchError) {
    console.error('[updatePersonalFilmNote] failed to load film_note', fetchError)
    return { success: false as const, error: '감상지를 불러오지 못했습니다.' }
  }

  if (!existing || existing.student_id !== profile.id || existing.source !== 'personal') {
    return { success: false as const, error: '해당 감상지를 수정할 수 없습니다.' }
  }

  const { error: updateError } = await supabase
    .from('film_notes')
    .update({
      content: entry,
      completed: isComplete,
      updated_at: new Date().toISOString(),
    })
    .eq('id', parsedInput.data.noteId)
    .eq('student_id', profile.id)
    .eq('source', 'personal')

  if (updateError) {
    console.error('[updatePersonalFilmNote] update failed', updateError)
    return { success: false as const, error: '감상지를 수정하지 못했습니다.' }
  }

  revalidatePath('/dashboard/student/film-notes')
  return { success: true as const }
}

const deletePersonalFilmNoteSchema = z.object({
  noteId: z.string().uuid('유효한 감상지 ID가 아닙니다.'),
})

export async function deletePersonalFilmNote(input: z.infer<typeof deletePersonalFilmNoteSchema>) {
  const { profile } = await getAuthContext()

  if (!profile || profile.role !== 'student') {
    return { success: false as const, error: '학생 계정으로만 사용할 수 있습니다.' }
  }

  const parsedInput = deletePersonalFilmNoteSchema.safeParse(input)

  if (!parsedInput.success) {
    return { success: false as const, error: parsedInput.error.issues[0]?.message ?? '입력 값을 확인해주세요.' }
  }

  const supabase = await createServerSupabase()

  const { error } = await supabase
    .from('film_notes')
    .delete()
    .eq('id', parsedInput.data.noteId)
    .eq('student_id', profile.id)
    .eq('source', 'personal')

  if (error) {
    console.error('[deletePersonalFilmNote] delete failed', error)
    return { success: false as const, error: '감상지를 삭제하지 못했습니다.' }
  }

  revalidatePath('/dashboard/student/film-notes')
  return { success: true as const }
}
