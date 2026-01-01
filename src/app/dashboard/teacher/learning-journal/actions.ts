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
import { refreshLearningJournalWeeklyData } from '@/lib/learning-journals'
import { notifyParentOfLearningJournalPublish } from '@/lib/learning-journal-notifications'

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

  const supabase = await createServerSupabase()
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

    const isEmptyBody = !parsed.data.body || parsed.data.body.trim().length === 0

    if (existing?.id) {
      if (isEmptyBody) {
        // 빈 값이면 기존 코멘트 삭제
        const { error: deleteError } = await supabase
          .from('learning_journal_comments')
          .delete()
          .eq('id', existing.id)

        if (deleteError) {
          console.error('[learning-journal] comment delete error', deleteError)
          return makeErrorState('코멘트를 삭제하지 못했습니다.')
        }

        revalidatePath(TEACHER_LEARNING_JOURNAL_PATH)
        revalidateEntryPath(parsed.data.entryId)
        return makeSuccessState('코멘트를 삭제했습니다.')
      }

      // 기존 코멘트 업데이트
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
      // 빈 값이면 삽입하지 않음
      if (isEmptyBody) {
        return makeSuccessState('저장할 코멘트가 없습니다.')
      }

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

  const supabase = await createServerSupabase()

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
        published_at: nextStatus === 'published' ? DateUtil.toISOString(new Date()) : current?.published_at ?? null,
      })
      .eq('id', parsed.data.entryId)

    if (updateError) {
      console.error('[learning-journal] entry status update error', updateError)
      return makeErrorState('상태를 변경하지 못했습니다.')
    }

    if (nextStatus === 'published') {
      await notifyParentOfLearningJournalPublish(parsed.data.entryId)
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

export async function regenerateLearningJournalWeeklyAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { profile } = await getAuthContext()

  if (!profile || !canManageLearningJournal(profile.role)) {
    return makeErrorState('주차별 데이터를 재생성할 권한이 없습니다.')
  }

  const entryId = formData.get('entryId')?.toString() ?? ''

  if (!entryId) {
    return makeErrorState('학습일지 정보를 확인하지 못했습니다.')
  }

  try {
    const weeklyData = await refreshLearningJournalWeeklyData(entryId)

    if (!weeklyData) {
      return makeErrorState('주차별 데이터를 생성하지 못했습니다.')
    }

    revalidatePath(TEACHER_LEARNING_JOURNAL_PATH)
    revalidateEntryPath(entryId)

    return makeSuccessState('주차별 데이터를 최신 정보로 갱신했습니다.')
  } catch (error) {
    console.error('[learning-journal] weekly regenerate error', error)
    return makeErrorState('주차별 데이터를 생성하는 중 문제가 발생했습니다.')
  }
}

export async function regeneratePeriodLearningJournalWeeklyAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { profile } = await getAuthContext()

  if (!profile || !canManageLearningJournal(profile.role)) {
    return makeErrorState('주차별 데이터를 재생성할 권한이 없습니다.')
  }

  const periodId = formData.get('periodId')?.toString() ?? ''

  if (!periodId) {
    return makeErrorState('학습일지 주기 정보를 확인하지 못했습니다.')
  }

  const supabase = await createServerSupabase()

  try {
    // 1. Fetch all entries for the period
    const { data: entries, error: fetchError } = await supabase
      .from('learning_journal_entries')
      .select('id')
      .eq('period_id', periodId)

    if (fetchError) {
      console.error('[learning-journal] period entries fetch error', fetchError)
      return makeErrorState('학습일지 목록을 불러오지 못했습니다.')
    }

    if (!entries || entries.length === 0) {
      return makeErrorState('갱신할 학습일지가 없습니다.')
    }

    // 2. Refresh each entry
    // We run this in parallel but limit concurrency if needed.
    // For now, simple Promise.all is likely fine for typical class sizes (20-30).
    const results = await Promise.allSettled(
      entries.map((entry) => refreshLearningJournalWeeklyData(entry.id))
    )

    const failedCount = results.filter((r) => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value)).length
    const successCount = entries.length - failedCount

    revalidatePath(TEACHER_LEARNING_JOURNAL_PATH)

    if (failedCount > 0) {
      return makeSuccessState(
        `총 ${entries.length}명 중 ${successCount}명의 데이터를 갱신했습니다. (${failedCount}명 실패)`
      )
    }

    return makeSuccessState(`총 ${entries.length}명의 주차별 데이터를 모두 갱신했습니다.`)
  } catch (error) {
    console.error('[learning-journal] period regenerate error', error)
    return makeErrorState('일괄 갱신 중 문제가 발생했습니다.')
  }
}

// Template Actions
const TEMPLATE_PATH = '/dashboard/teacher/learning-journal/templates'

import {
  deleteClassLearningJournalWeek,
  upsertClassLearningJournalWeek,
  type UpsertClassLearningJournalWeekInput,
} from '@/lib/learning-journals'
import {
  deleteClassLearningJournalWeekSchema,
  upsertClassLearningJournalWeekSchema,
} from '@/lib/validation/learning-journal'

export async function upsertClassTemplateWeekAction(rawForm: FormData) {
  const { profile } = await getAuthContext()

  if (!profile || !['teacher', 'manager', 'principal'].includes(profile.role)) {
    return { error: '월간 학습 계획을 수정할 권한이 없습니다.' }
  }

  const entryId = rawForm.get('entryId')?.toString() ?? ''

  const payload = {
    classId: String(rawForm.get('classId') ?? ''),
    periodId: String(rawForm.get('periodId') ?? ''),
    weekIndex: Number(rawForm.get('weekIndex') ?? 0),
    subject: String(rawForm.get('subject') ?? ''),
    materialIds: (rawForm.getAll('materialIds') ?? []).map((value) => String(value)),
    materialTitles: (rawForm.getAll('materialTitles') ?? []).map((value) => String(value)),
    materialNotes: rawForm.get('materialNotes')?.toString() ?? null,
  }

  const result = upsertClassLearningJournalWeekSchema.safeParse(payload)

  if (!result.success) {
    return {
      error: '입력값을 다시 확인해주세요.',
      fieldErrors: result.error.flatten().fieldErrors,
    }
  }

  const input: UpsertClassLearningJournalWeekInput = {
    ...result.data,
    materialNotes: result.data.materialNotes ?? null,
    actorId: profile.id,
  }

  const template = await upsertClassLearningJournalWeek(input)

  if (!template) {
    return { error: '템플릿을 저장하지 못했습니다.' }
  }

  // 저장 후 자동으로 weekly 데이터 재생성
  if (entryId) {
    const weeklyData = await refreshLearningJournalWeeklyData(entryId)
    if (!weeklyData) {
      console.warn('[learning-journal] upsertClassTemplateWeek - weekly regeneration failed for entry:', entryId)
    }
    revalidateEntryPath(entryId)
  }

  // Revalidate both the old template path (if it exists) and the main page
  revalidatePath(TEMPLATE_PATH)
  revalidatePath(TEACHER_LEARNING_JOURNAL_PATH)

  return { success: true } as const
}

export async function deleteClassTemplateWeekAction(formData: FormData) {
  const { profile } = await getAuthContext()

  if (!profile || !['teacher', 'manager', 'principal'].includes(profile.role)) {
    return { error: '월간 학습 계획을 수정할 권한이 없습니다.' }
  }

  const payload = {
    classId: String(formData.get('classId') ?? ''),
    periodId: String(formData.get('periodId') ?? ''),
    weekIndex: Number(formData.get('weekIndex') ?? 0),
    subject: String(formData.get('subject') ?? ''),
  }

  const result = deleteClassLearningJournalWeekSchema.safeParse(payload)

  if (!result.success) {
    return {
      error: '삭제할 템플릿 정보를 확인하지 못했습니다.',
      fieldErrors: result.error.flatten().fieldErrors,
    }
  }

  const deleted = await deleteClassLearningJournalWeek(
    result.data.classId,
    result.data.periodId,
    result.data.weekIndex,
    result.data.subject
  )

  if (!deleted) {
    return { error: '템플릿을 삭제하지 못했습니다.' }
  }

  revalidatePath(TEMPLATE_PATH)
  revalidatePath(TEACHER_LEARNING_JOURNAL_PATH)

  return { success: true } as const
}

// 과제 배치 오버라이드 액션
export async function updateTaskPlacementAction(formData: FormData) {
  const { profile } = await getAuthContext()

  if (!profile || !canManageLearningJournal(profile.role)) {
    return { error: '과제 배치를 변경할 권한이 없습니다.' }
  }

  const taskId = formData.get('taskId')?.toString()
  const weekOverrideRaw = formData.get('weekOverride')?.toString()
  const periodOverrideRaw = formData.get('periodOverride')?.toString()
  const entryId = formData.get('entryId')?.toString()

  // taskId 검증 강화 - "undefined" 문자열도 체크
  if (!taskId || taskId === 'undefined') {
    console.error('[learning-journal] task placement - invalid taskId:', taskId)
    return { error: '과제 정보를 확인하지 못했습니다. (taskId가 없음)' }
  }

  // weekOverride: "1"-"4" 또는 "auto"(null로 설정)
  const weekOverride = (() => {
    if (!weekOverrideRaw || weekOverrideRaw === 'auto') {
      return null
    }
    const parsed = parseInt(weekOverrideRaw, 10)
    if (isNaN(parsed) || parsed < 1 || parsed > 4) {
      return null
    }
    return parsed
  })()

  // periodOverride: UUID 또는 "auto"(null로 설정)
  const periodOverride = (() => {
    if (!periodOverrideRaw || periodOverrideRaw === 'auto') {
      return null
    }
    return periodOverrideRaw
  })()

  const supabase = await createServerSupabase()

  try {
    const { error: updateError } = await supabase
      .from('student_tasks')
      .update({
        week_override: weekOverride,
        period_override: periodOverride,
      })
      .eq('id', taskId)

    if (updateError) {
      console.error('[learning-journal] task placement update error', updateError)
      return { error: '과제 배치를 저장하지 못했습니다.' }
    }

    // 저장 후 자동으로 weekly 데이터 재생성
    if (entryId) {
      const weeklyData = await refreshLearningJournalWeeklyData(entryId)
      if (!weeklyData) {
        console.warn('[learning-journal] task placement - weekly regeneration failed for entry:', entryId)
      }
    }

    revalidatePath(TEACHER_LEARNING_JOURNAL_PATH)
    if (entryId) {
      revalidateEntryPath(entryId)
    }

    return { success: true }
  } catch (error) {
    console.error('[learning-journal] task placement unexpected error', error)
    return { error: '과제 배치를 변경하는 중 문제가 발생했습니다.' }
  }
}
