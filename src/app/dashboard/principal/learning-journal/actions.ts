'use server'

import { revalidatePath } from 'next/cache'

import { ensurePrincipalProfile } from '@/lib/authz'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  deleteLearningJournalGreetingSchema,
  upsertLearningJournalGreetingSchema,
  type UpsertLearningJournalGreetingInput,
} from '@/lib/validation/learning-journal'
import type { ActionState } from '@/app/dashboard/manager/classes/action-state'

const PRINCIPAL_LEARNING_JOURNAL_PATH = '/dashboard/principal/learning-journal'

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
