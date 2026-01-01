'use server'

import { revalidatePath } from 'next/cache'

import { calculatePeriodEnd } from '@/lib/learning-journals'
import { ensureManagerProfile } from '@/lib/authz'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  createLearningJournalPeriodSchema,
  deleteLearningJournalPeriodSchema,
  updateLearningJournalPeriodSchema,
  upsertLearningJournalAcademicEventSchema,
  deleteLearningJournalAcademicEventSchema,
  type CreateLearningJournalPeriodInput,
  type UpdateLearningJournalPeriodInput,
  type UpsertLearningJournalAcademicEventInput,
} from '@/lib/validation/learning-journal'
import type { ActionState } from '@/app/dashboard/manager/classes/action-state'

const MANAGER_LEARNING_JOURNAL_PATH = '/dashboard/manager/learning-journal'
const MANAGER_LEARNING_JOURNAL_EVENTS_PATH = '/dashboard/manager/learning-journal/events'

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

function parseCreatePayload(formData: FormData):
  | { success: true; data: CreateLearningJournalPeriodInput }
  | { success: false; error: Record<string, string[]> } {
  const classIdsRaw = formData.get('classIds')?.toString() ?? ''
  const classIds = classIdsRaw ? classIdsRaw.split(',').filter(Boolean) : []

  const payload = {
    classIds,
    startDate: formData.get('startDate')?.toString() ?? '',
    label: formData.get('label')?.toString() ?? '',
  }

  const parsed = createLearningJournalPeriodSchema.safeParse(payload)

  if (!parsed.success) {
    return {
      success: false as const,
      error: parsed.error.flatten().fieldErrors,
    }
  }

  return { success: true, data: parsed.data }
}

function parseUpdatePayload(formData: FormData):
  | { success: true; data: UpdateLearningJournalPeriodInput }
  | { success: false; error: Record<string, string[]> } {
  const payload = {
    periodId: formData.get('periodId')?.toString() ?? '',
    startDate: formData.get('startDate')?.toString() ?? '',
    endDate: formData.get('endDate')?.toString() ?? undefined,
    label: formData.get('label')?.toString() ?? '',
    status: formData.get('status')?.toString() ?? 'draft',
  }

  const parsed = updateLearningJournalPeriodSchema.safeParse(payload)

  if (!parsed.success) {
    return {
      success: false as const,
      error: parsed.error.flatten().fieldErrors,
    }
  }

  return { success: true, data: parsed.data }
}

function parseEventPayload(formData: FormData):
  | { success: true; data: UpsertLearningJournalAcademicEventInput }
  | { success: false; error: Record<string, string[]> } {
  const payload = {
    eventId: formData.get('eventId')?.toString() ?? undefined,
    monthToken: formData.get('monthToken')?.toString() ?? '',
    title: formData.get('title')?.toString() ?? '',
    startDate: formData.get('startDate')?.toString() ?? '',
    endDate: formData.get('endDate')?.toString() ?? undefined,
    memo: formData.get('memo')?.toString() ?? '',
  }

  const parsed = upsertLearningJournalAcademicEventSchema.safeParse(payload)

  if (!parsed.success) {
    return {
      success: false as const,
      error: parsed.error.flatten().fieldErrors,
    }
  }

  return { success: true, data: parsed.data }
}

async function seedEntriesForClass(periodId: string, classId: string) {
  const supabase = createAdminClient()
  const { data: studentRows, error: studentError } = await supabase
    .from('class_students')
    .select('student_id')
    .eq('class_id', classId)

  if (studentError) {
    console.error('[learning-journal] seed entries student fetch error', studentError)
    return
  }

  const students = studentRows ?? []

  if (students.length === 0) {
    return
  }

  const payload = students.map((row) => ({
    period_id: periodId,
    student_id: row.student_id,
  }))

  const { error: upsertError } = await supabase
    .from('learning_journal_entries')
    .upsert(payload, { onConflict: 'period_id,student_id' })

  if (upsertError) {
    console.error('[learning-journal] seed entries upsert error', upsertError)
  }
}

export async function createLearningJournalPeriodAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const profile = await ensureManagerProfile()

  if (!profile) {
    return makeErrorState('학습일지 주기를 생성할 권한이 없습니다.')
  }

  const parsed = parseCreatePayload(formData)

  if (!parsed.success) {
    return makeErrorState('입력값을 다시 확인해주세요.', parsed.error)
  }

  const { classIds, startDate, label } = parsed.data
  const supabase = createAdminClient()
  const endDate = calculatePeriodEnd(startDate)

  try {
    let successCount = 0
    const errors: string[] = []

    for (const classId of classIds) {
      const { data: inserted, error } = await supabase
        .from('learning_journal_periods')
        .insert({
          class_id: classId,
          start_date: startDate,
          end_date: endDate,
          label: label?.trim() ? label.trim() : null,
          status: 'in_progress',
          created_by: profile.id,
        })
        .select('id')
        .maybeSingle()

      if (error || !inserted) {
        console.error('[learning-journal] create period error for class', classId, error)
        errors.push(classId)
        continue
      }

      await seedEntriesForClass(inserted.id, classId)
      successCount++
    }

    revalidatePath(MANAGER_LEARNING_JOURNAL_PATH)

    if (successCount === 0) {
      return makeErrorState('학습일지 주기를 생성하지 못했습니다.')
    }

    if (errors.length > 0) {
      return makeSuccessState(`${successCount}개 반의 학습일지 주기를 만들었습니다. (${errors.length}개 실패)`)
    }

    return makeSuccessState(`${successCount}개 반의 학습일지 주기를 만들었습니다.`)
  } catch (caughtError) {
    console.error('[learning-journal] create period unexpected error', caughtError)
    return makeErrorState('학습일지 주기를 생성하는 중 문제가 발생했습니다.')
  }
}

export async function updateLearningJournalPeriodAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const profile = await ensureManagerProfile()

  if (!profile) {
    return makeErrorState('학습일지 주기를 수정할 권한이 없습니다.')
  }

  const parsed = parseUpdatePayload(formData)

  if (!parsed.success) {
    return makeErrorState('입력값을 다시 확인해주세요.', parsed.error)
  }

  const { periodId, startDate, endDate, label, status } = parsed.data
  const supabase = createAdminClient()
  const nextEndDate = endDate ?? calculatePeriodEnd(startDate)

  try {
    const { error } = await supabase
      .from('learning_journal_periods')
      .update({
        start_date: startDate,
        end_date: nextEndDate,
        label: label?.trim() ? label.trim() : null,
        status,
      })
      .eq('id', periodId)

    if (error) {
      console.error('[learning-journal] update period error', error)
      return makeErrorState('학습일지 주기를 수정하지 못했습니다.')
    }

    revalidatePath(MANAGER_LEARNING_JOURNAL_PATH)
    return makeSuccessState('학습일지 주기를 수정했습니다.')
  } catch (caughtError) {
    console.error('[learning-journal] update period unexpected error', caughtError)
    return makeErrorState('학습일지 주기를 수정하는 중 문제가 발생했습니다.')
  }
}

export async function deleteLearningJournalPeriodAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const profile = await ensureManagerProfile()

  if (!profile) {
    return makeErrorState('학습일지 주기를 삭제할 권한이 없습니다.')
  }

  const payload = {
    periodId: formData.get('periodId')?.toString() ?? '',
  }
  const parsed = deleteLearningJournalPeriodSchema.safeParse(payload)

  if (!parsed.success) {
    return makeErrorState('삭제할 학습일지 주기 정보를 확인하지 못했습니다.', parsed.error.flatten().fieldErrors)
  }

  const supabase = createAdminClient()

  try {
    const { error } = await supabase
      .from('learning_journal_periods')
      .delete()
      .eq('id', parsed.data.periodId)

    if (error) {
      console.error('[learning-journal] delete period error', error)
      return makeErrorState('학습일지 주기를 삭제하지 못했습니다.')
    }

    revalidatePath(MANAGER_LEARNING_JOURNAL_PATH)
    return makeSuccessState('학습일지 주기를 삭제했습니다.')
  } catch (caughtError) {
    console.error('[learning-journal] delete period unexpected error', caughtError)
    return makeErrorState('학습일지 주기를 삭제하는 중 문제가 발생했습니다.')
  }
}

export async function upsertLearningJournalAcademicEventAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const profile = await ensureManagerProfile()

  if (!profile) {
    return makeErrorState('학사 일정을 관리할 권한이 없습니다.')
  }

  const parsed = parseEventPayload(formData)

  if (!parsed.success) {
    return makeErrorState('입력값을 다시 확인해주세요.', parsed.error)
  }

  const supabase = createAdminClient()
  const payload = parsed.data

  try {
    const { error } = await supabase
      .from('learning_journal_academic_events')
      .upsert(
        {
          id: payload.eventId ?? undefined,
          month_token: payload.monthToken,
          title: payload.title,
          start_date: payload.startDate,
          end_date: payload.endDate ?? null,
          memo: payload.memo?.trim() ? payload.memo.trim() : null,
          created_by: profile.id,
        },
        { onConflict: 'id' }
      )

    if (error) {
      console.error('[learning-journal] academic event upsert error', error)
      return makeErrorState('학사 일정을 저장하지 못했습니다.')
    }

    revalidatePath(MANAGER_LEARNING_JOURNAL_EVENTS_PATH)
    revalidatePath(MANAGER_LEARNING_JOURNAL_PATH)
    return makeSuccessState('학사 일정을 저장했습니다.')
  } catch (caughtError) {
    console.error('[learning-journal] academic event unexpected error', caughtError)
    return makeErrorState('학사 일정을 저장하는 중 문제가 발생했습니다.')
  }
}

export async function deleteLearningJournalAcademicEventAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const profile = await ensureManagerProfile()

  if (!profile) {
    return makeErrorState('학사 일정을 삭제할 권한이 없습니다.')
  }

  const payload = {
    eventId: formData.get('eventId')?.toString() ?? '',
  }
  const parsed = deleteLearningJournalAcademicEventSchema.safeParse(payload)

  if (!parsed.success) {
    return makeErrorState('삭제할 일정을 확인하지 못했습니다.', parsed.error.flatten().fieldErrors)
  }

  const supabase = createAdminClient()

  try {
    const { error } = await supabase
      .from('learning_journal_academic_events')
      .delete()
      .eq('id', parsed.data.eventId)

    if (error) {
      console.error('[learning-journal] academic event delete error', error)
      return makeErrorState('학사 일정을 삭제하지 못했습니다.')
    }

    revalidatePath(MANAGER_LEARNING_JOURNAL_EVENTS_PATH)
    revalidatePath(MANAGER_LEARNING_JOURNAL_PATH)
    return makeSuccessState('학사 일정을 삭제했습니다.')
  } catch (caughtError) {
    console.error('[learning-journal] academic event delete unexpected error', caughtError)
    return makeErrorState('학사 일정을 삭제하는 중 문제가 발생했습니다.')
  }
}
