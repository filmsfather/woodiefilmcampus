'use server'

import { revalidatePath } from 'next/cache'

import { ensureManagerProfile, ensurePrincipalProfile } from '@/lib/authz'
import { notifyParentOfLearningJournalPublish } from '@/lib/learning-journal-notifications'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  deleteLearningJournalGreetingSchema,
  deleteLearningJournalAnnualScheduleSchema,
  upsertLearningJournalGreetingSchema,
  upsertLearningJournalAnnualScheduleSchema,
  type UpsertLearningJournalGreetingInput,
  type UpsertLearningJournalAnnualScheduleInput,
  type DeleteLearningJournalAnnualScheduleInput,
} from '@/lib/validation/learning-journal'
import type { ActionState } from '@/app/dashboard/manager/classes/action-state'

const PRINCIPAL_LEARNING_JOURNAL_PATH = '/dashboard/principal/learning-journal'
const PRINCIPAL_REVIEW_PATH = '/dashboard/principal/learning-journal/review'

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

function parseGreetingPayload(formData: FormData):
  | { success: true; data: UpsertLearningJournalGreetingInput }
  | { success: false; error: Record<string, string[]> } {
  const payload = {
    monthToken: formData.get('monthToken')?.toString() ?? '',
    message: formData.get('message')?.toString() ?? '',
  }

  const parsed = upsertLearningJournalGreetingSchema.safeParse(payload)

  if (!parsed.success) {
    return {
      success: false as const,
      error: parsed.error.flatten().fieldErrors,
    }
  }

  return { success: true, data: parsed.data }
}

function normalizeTuitionAmount(raw: string | undefined): number | null {
  if (!raw) {
    return null
  }

  const cleaned = raw.replace(/,/g, '').trim()

  if (!cleaned) {
    return null
  }

  const parsed = Number(cleaned)

  if (!Number.isFinite(parsed) || parsed < 0) {
    return null
  }

  return Math.round(parsed)
}

type ParsedAnnualSchedulePayload = Omit<
  UpsertLearningJournalAnnualScheduleInput,
  'tuitionAmount' | 'memo'
> & {
  tuitionAmount: number | null
  memo: string | null
}

function parseAnnualSchedulePayload(formData: FormData):
  | { success: true; data: ParsedAnnualSchedulePayload }
  | { success: false; error: Record<string, string[]> } {
  const payload = {
    scheduleId: formData.get('scheduleId')?.toString() ?? undefined,
    category: formData.get('category')?.toString() ?? '',
    periodLabel: formData.get('periodLabel')?.toString() ?? '',
    startDate: formData.get('startDate')?.toString() ?? '',
    endDate: formData.get('endDate')?.toString() ?? '',
    tuitionDueDate: formData.get('tuitionDueDate')?.toString() ?? '',
    tuitionAmount: formData.get('tuitionAmount')?.toString() ?? '',
    memo: formData.get('memo')?.toString() ?? '',
  }

  const parsed = upsertLearningJournalAnnualScheduleSchema.safeParse(payload)

  if (!parsed.success) {
    return {
      success: false as const,
      error: parsed.error.flatten().fieldErrors,
    }
  }

  const tuitionAmount = normalizeTuitionAmount(parsed.data.tuitionAmount)

  if (parsed.data.tuitionAmount && parsed.data.tuitionAmount.trim().length > 0 && tuitionAmount === null) {
    return {
      success: false,
      error: {
        tuitionAmount: ['수업료는 숫자만 입력해주세요.'],
      },
    }
  }

  const memo = parsed.data.memo && parsed.data.memo.trim().length > 0 ? parsed.data.memo.trim() : null

  return {
    success: true,
    data: {
      scheduleId: parsed.data.scheduleId,
      category: parsed.data.category,
      periodLabel: parsed.data.periodLabel,
      startDate: parsed.data.startDate,
      endDate: parsed.data.endDate,
      tuitionDueDate: parsed.data.tuitionDueDate,
      tuitionAmount,
      memo,
    },
  }
}

function parseAnnualScheduleIdentifier(formData: FormData):
  | { success: true; data: DeleteLearningJournalAnnualScheduleInput }
  | { success: false; error: Record<string, string[]> } {
  const payload = {
    scheduleId: formData.get('scheduleId')?.toString() ?? '',
  }

  const parsed = deleteLearningJournalAnnualScheduleSchema.safeParse(payload)

  if (!parsed.success) {
    return {
      success: false as const,
      error: parsed.error.flatten().fieldErrors,
    }
  }

  return { success: true, data: parsed.data }
}

export async function upsertLearningJournalGreetingAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const profile = await ensurePrincipalProfile()

  if (!profile) {
    return makeErrorState('원장 인사말을 작성할 권한이 없습니다.')
  }

  const parsed = parseGreetingPayload(formData)

  if (!parsed.success) {
    return makeErrorState('입력값을 다시 확인해주세요.', parsed.error)
  }

  const supabase = createAdminClient()

  try {
    const { error } = await supabase
      .from('learning_journal_greetings')
      .upsert(
        {
          month_token: parsed.data.monthToken,
          message: parsed.data.message,
          principal_id: profile.id,
          published_at: new Date().toISOString(),
        },
        { onConflict: 'month_token' }
      )

    if (error) {
      console.error('[learning-journal] greeting upsert error', error)
      return makeErrorState('인사말을 저장하지 못했습니다.')
    }

    revalidatePath(PRINCIPAL_LEARNING_JOURNAL_PATH)
    return makeSuccessState('인사말을 저장했습니다.')
  } catch (caughtError) {
    console.error('[learning-journal] greeting unexpected error', caughtError)
    return makeErrorState('인사말을 저장하는 중 문제가 발생했습니다.')
  }
}

export async function deleteLearningJournalGreetingAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const profile = await ensurePrincipalProfile()

  if (!profile) {
    return makeErrorState('원장 인사말을 삭제할 권한이 없습니다.')
  }

  const payload = {
    monthToken: formData.get('monthToken')?.toString() ?? '',
  }
  const parsed = deleteLearningJournalGreetingSchema.safeParse(payload)

  if (!parsed.success) {
    return makeErrorState('삭제할 인사말 정보를 확인하지 못했습니다.', parsed.error.flatten().fieldErrors)
  }

  const supabase = createAdminClient()

  try {
    const { error } = await supabase
      .from('learning_journal_greetings')
      .delete()
      .eq('month_token', parsed.data.monthToken)

    if (error) {
      console.error('[learning-journal] greeting delete error', error)
      return makeErrorState('인사말을 삭제하지 못했습니다.')
    }

    revalidatePath(PRINCIPAL_LEARNING_JOURNAL_PATH)
    return makeSuccessState('인사말을 삭제했습니다.')
  } catch (caughtError) {
    console.error('[learning-journal] greeting delete unexpected error', caughtError)
    return makeErrorState('인사말을 삭제하는 중 문제가 발생했습니다.')
  }
}

export async function upsertLearningJournalAnnualScheduleAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const profile = await ensureManagerProfile()

  if (!profile) {
    return makeErrorState('연간 일정을 관리할 권한이 없습니다.')
  }

  const parsed = parseAnnualSchedulePayload(formData)

  if (!parsed.success) {
    return makeErrorState('입력값을 다시 확인해주세요.', parsed.error)
  }

  const supabase = createAdminClient()

  try {
    const payload = {
      period_label: parsed.data.periodLabel,
      start_date: parsed.data.startDate,
      end_date: parsed.data.endDate,
      tuition_due_date: parsed.data.tuitionDueDate,
      tuition_amount: parsed.data.tuitionAmount,
      memo: parsed.data.memo,
      category: parsed.data.category,
    }

    if (parsed.data.scheduleId) {
      const { error } = await supabase
        .from('learning_journal_annual_schedules')
        .update(payload)
        .eq('id', parsed.data.scheduleId)

      if (error) {
        console.error('[learning-journal] annual schedule update error', error)
        return makeErrorState('연간 일정을 수정하지 못했습니다.')
      }

      revalidatePath(PRINCIPAL_LEARNING_JOURNAL_PATH)
      return makeSuccessState('연간 일정을 수정했습니다.')
    }

    const { error } = await supabase
      .from('learning_journal_annual_schedules')
      .insert({
        ...payload,
        created_by: profile.id,
      })

    if (error) {
      console.error('[learning-journal] annual schedule insert error', error)
      return makeErrorState('연간 일정을 추가하지 못했습니다.')
    }

    revalidatePath(PRINCIPAL_LEARNING_JOURNAL_PATH)
    return makeSuccessState('연간 일정을 추가했습니다.')
  } catch (caughtError) {
    console.error('[learning-journal] annual schedule upsert unexpected error', caughtError)
    return makeErrorState('연간 일정을 저장하는 중 문제가 발생했습니다.')
  }
}

export async function deleteLearningJournalAnnualScheduleAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const profile = await ensureManagerProfile()

  if (!profile) {
    return makeErrorState('연간 일정을 삭제할 권한이 없습니다.')
  }

  const parsed = parseAnnualScheduleIdentifier(formData)

  if (!parsed.success) {
    return makeErrorState('삭제할 연간 일정 정보를 확인하지 못했습니다.', parsed.error)
  }

  const supabase = createAdminClient()

  try {
    const { error } = await supabase
      .from('learning_journal_annual_schedules')
      .delete()
      .eq('id', parsed.data.scheduleId)

    if (error) {
      console.error('[learning-journal] annual schedule delete error', error)
      return makeErrorState('연간 일정을 삭제하지 못했습니다.')
    }

    revalidatePath(PRINCIPAL_LEARNING_JOURNAL_PATH)
    return makeSuccessState('연간 일정을 삭제했습니다.')
  } catch (caughtError) {
    console.error('[learning-journal] annual schedule delete unexpected error', caughtError)
    return makeErrorState('연간 일정을 삭제하는 중 문제가 발생했습니다.')
  }
}

async function insertEntryLog(
  admin: ReturnType<typeof createAdminClient>,
  entryId: string,
  previousStatus: string | null,
  nextStatus: string,
  actorId: string
) {
  const { error } = await admin.from('learning_journal_entry_logs').insert({
    entry_id: entryId,
    previous_status: previousStatus,
    next_status: nextStatus,
    changed_by: actorId,
    created_at: new Date().toISOString(),
  })

  if (error) {
    console.error('[learning-journal] insert log error', error)
  }
}

export async function updateEntryStatusByPrincipalAction(formData: FormData) {
  const profile = await ensurePrincipalProfile()

  if (!profile) {
    return { error: '학습일지 상태를 변경할 권한이 없습니다.' }
  }

  const entryId = formData.get('entryId')?.toString() ?? ''
  const status = formData.get('status')?.toString() ?? ''

  if (!entryId || !['published', 'draft', 'submitted'].includes(status)) {
    return { error: '유효한 상태가 아닙니다.' }
  }

  const admin = createAdminClient()

  const { data: current, error: fetchError } = await admin
    .from('learning_journal_entries')
    .select('status, submitted_at, published_at')
    .eq('id', entryId)
    .maybeSingle()

  if (fetchError || !current) {
    console.error('[learning-journal] principal review fetch error', fetchError)
    return { error: '현재 상태를 불러오지 못했습니다.' }
  }

  const nowIso = new Date().toISOString()

  const updatePayload: Record<string, unknown> = {
    status,
    updated_at: nowIso,
  }

  if (status === 'published') {
    updatePayload.published_at = nowIso
    updatePayload.submitted_at = current.submitted_at ?? nowIso
  }

  if (status === 'draft') {
    updatePayload.published_at = null
  }

  if (status === 'submitted' && !current.submitted_at) {
    updatePayload.submitted_at = nowIso
  }

  const { error: updateError } = await admin
    .from('learning_journal_entries')
    .update(updatePayload)
    .eq('id', entryId)

  if (updateError) {
    console.error('[learning-journal] principal review update error', updateError)
    return { error: '상태를 변경하지 못했습니다.' }
  }

  if (status === 'published') {
    await notifyParentOfLearningJournalPublish(entryId)
  }

  await insertEntryLog(admin, entryId, current.status ?? null, status, profile.id)

  revalidatePath(PRINCIPAL_REVIEW_PATH)
  revalidatePath(PRINCIPAL_LEARNING_JOURNAL_PATH)

  return { success: true }
}
