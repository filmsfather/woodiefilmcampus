'use server'

import { revalidatePath } from 'next/cache'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient as createServerSupabase } from '@/lib/supabase/server'
import { getAuthContext } from '@/lib/auth'
import DateUtil from '@/lib/date-util'
import {
  saveLearningJournalCommentSchema,
  updateLearningJournalEntryStatusSchema,
  type SaveLearningJournalCommentInput,
  type UpdateLearningJournalEntryStatusInput,
} from '@/lib/validation/learning-journal'
import type { ActionState } from '@/app/dashboard/manager/classes/action-state'

const TEACHER_LEARNING_JOURNAL_PATH = '/dashboard/teacher/learning-journal'
function revalidateEntryPath(entryId: string) {
  revalidatePath(`${TEACHER_LEARNING_JOURNAL_PATH}/entries/${entryId}`)
}

function makeErrorState(message: string, fieldErrors?: Record<string, string[]>): ActionState {
  return {
    status: 'error',
    message,
    fieldErrors,
  }
}

function makeSuccessState(message: string): ActionState {
  return {
    status: 'success',
    message,
  }
}

function parseCommentPayload(formData: FormData):
  | { success: true; data: SaveLearningJournalCommentInput }
  | { success: false; error: Record<string, string[]> } {
  const payload = {
    entryId: formData.get('entryId')?.toString() ?? '',
    roleScope: formData.get('roleScope')?.toString() ?? 'homeroom',
    subject: (() => {
      const value = formData.get('subject')?.toString() ?? ''
      return value.trim() ? value.trim() : undefined
    })(),
    body: formData.get('body')?.toString() ?? '',
  }

  const parsed = saveLearningJournalCommentSchema.safeParse(payload)

  if (!parsed.success) {
    return {
      success: false as const,
      error: parsed.error.flatten().fieldErrors,
    }
  }

  return { success: true, data: parsed.data }
}

function parseStatusPayload(formData: FormData):
  | { success: true; data: UpdateLearningJournalEntryStatusInput }
  | { success: false; error: Record<string, string[]> } {
  const payload = {
    entryId: formData.get('entryId')?.toString() ?? '',
    status: formData.get('status')?.toString() ?? 'draft',
  }

  const parsed = updateLearningJournalEntryStatusSchema.safeParse(payload)

  if (!parsed.success) {
    return {
      success: false as const,
      error: parsed.error.flatten().fieldErrors,
    }
  }

  return { success: true, data: parsed.data }
}

function canManageLearningJournal(role: string | null | undefined) {
  return role === 'teacher' || role === 'manager' || role === 'principal'
}

async function insertEntryLog(
  entryId: string,
  previousStatus: string | null,
  nextStatus: string,
  actorId: string,
  note?: string | null
) {
  const supabase = createAdminClient()
  const payload = {
    entry_id: entryId,
    previous_status: previousStatus,
    next_status: nextStatus,
    changed_by: actorId,
    note: note ?? null,
    created_at: DateUtil.toISOString(new Date()),
  }

  const { error } = await supabase.from('learning_journal_entry_logs').insert(payload)

  if (error) {
    console.error('[learning-journal] entry log insert error', error)
  }
}

export async function saveLearningJournalCommentAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { profile } = await getAuthContext()

  if (!profile || !canManageLearningJournal(profile.role)) {
    return makeErrorState('학습일지 코멘트를 작성할 권한이 없습니다.')
  }

  const parsed = parseCommentPayload(formData)

  if (!parsed.success) {
    return makeErrorState('입력값을 다시 확인해주세요.', parsed.error)
  }

  const supabase = createServerSupabase()
  const subjectValue = parsed.data.roleScope === 'homeroom' ? null : parsed.data.subject ?? null

  try {
    let fetchQuery = supabase
      .from('learning_journal_comments')
      .select('id')
      .eq('entry_id', parsed.data.entryId)
      .eq('role_scope', parsed.data.roleScope)

    fetchQuery = subjectValue === null ? fetchQuery.is('subject', null) : fetchQuery.eq('subject', subjectValue)

    const { data: existing, error: fetchError } = await fetchQuery.maybeSingle()

    if (fetchError) {
      console.error('[learning-journal] comment select error', fetchError)
      return makeErrorState('기존 코멘트를 확인하지 못했습니다.')
    }

    if (existing?.id) {
      const { error: updateError } = await supabase
        .from('learning_journal_comments')
        .update({
          body: parsed.data.body,
          teacher_id: profile.id,
        })
        .eq('id', existing.id)

      if (updateError) {
        console.error('[learning-journal] comment update error', updateError)
        return makeErrorState('코멘트를 저장하지 못했습니다.')
      }
    } else {
      const { error: insertError } = await supabase
        .from('learning_journal_comments')
        .insert({
          entry_id: parsed.data.entryId,
          role_scope: parsed.data.roleScope,
          subject: subjectValue,
          body: parsed.data.body,
          teacher_id: profile.id,
        })

      if (insertError) {
        console.error('[learning-journal] comment insert error', insertError)
        return makeErrorState('코멘트를 저장하지 못했습니다.')
      }
    }

    revalidatePath(TEACHER_LEARNING_JOURNAL_PATH)
    revalidateEntryPath(parsed.data.entryId)
    return makeSuccessState('코멘트를 저장했습니다.')
  } catch (caughtError) {
    console.error('[learning-journal] comment unexpected error', caughtError)
    return makeErrorState('코멘트를 저장하는 중 문제가 발생했습니다.')
  }
}

export async function updateLearningJournalEntryStatusAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { profile } = await getAuthContext()

  if (!profile || !canManageLearningJournal(profile.role)) {
    return makeErrorState('학습일지 상태를 변경할 권한이 없습니다.')
  }

  const parsed = parseStatusPayload(formData)

  if (!parsed.success) {
    return makeErrorState('상태 정보를 다시 확인해주세요.', parsed.error)
  }

  const nextStatus = parsed.data.status

  if (nextStatus === 'published' && profile.role === 'teacher') {
    return makeErrorState('공개 처리는 관리자만 가능합니다.')
  }

  const supabase = createServerSupabase()

  try {
    const { data: current, error: fetchError } = await supabase
      .from('learning_journal_entries')
      .select('id, status, submitted_at, published_at')
      .eq('id', parsed.data.entryId)
      .maybeSingle()

    if (fetchError) {
      console.error('[learning-journal] entry status fetch error', fetchError)
      return makeErrorState('현재 상태를 확인하지 못했습니다.')
    }

    const previousStatus = (current?.status as string | null) ?? null

    const { error: updateError } = await supabase
      .from('learning_journal_entries')
      .update({
        status: nextStatus,
        submitted_at: nextStatus === 'submitted' ? DateUtil.toISOString(new Date()) : current?.submitted_at ?? null,
        published_at: nextStatus === 'published' ? DateUtil.toISOString(new Date()) : current?.published_at ?? null,
      })
      .eq('id', parsed.data.entryId)

    if (updateError) {
      console.error('[learning-journal] entry status update error', updateError)
      return makeErrorState('상태를 변경하지 못했습니다.')
    }

    await insertEntryLog(parsed.data.entryId, previousStatus, nextStatus, profile.id)
    revalidatePath(TEACHER_LEARNING_JOURNAL_PATH)
    revalidateEntryPath(parsed.data.entryId)
    return makeSuccessState('학습일지 상태를 업데이트했습니다.')
  } catch (caughtError) {
    console.error('[learning-journal] entry status unexpected error', caughtError)
    return makeErrorState('상태를 변경하는 중 문제가 발생했습니다.')
  }
}
