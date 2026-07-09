'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { getAuthContext } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { getProgramPreset } from '@/lib/university-policy/presets'
import { resolveWishlistCategory } from '@/lib/university-policy/yedae'
import { WEEKDAY_PREFERENCE_VALUES } from '@/lib/university-confirmation/constants'
import { notifyUniversityPrincipalConfirmed } from '@/lib/university-report/notifications'

export type SubmitFinalConfirmationResult = { success: true } | { error: string }

const GENERAL_LIMIT = 6

const submitSchema = z.object({
  token: z.string().min(16, '잘못된 링크입니다.'),
  programKeys: z.array(z.string().min(1)).max(50, '선택한 대학이 너무 많습니다.'),
  kartsApply: z.boolean(),
  weekdayPreferences: z
    .array(z.enum(WEEKDAY_PREFERENCE_VALUES as unknown as [string, ...string[]]))
    .min(1, '수업 희망 요일을 최소 1개 선택해 주세요.'),
})

/**
 * 공유 링크(/confirm/[token])에서 최종 지원 대학과 수업 희망 요일을 확정한다.
 * 토큰을 먼저 검증하고 service role로 저장한다.
 *  - 일반대는 수시 6장 정원에 포함되므로 최대 6개.
 *  - 한예종은 지원 여부(karts_apply) 토글로 저장(항목 테이블에는 넣지 않음).
 *  - 제출 시 기존 항목을 교체하고 status를 confirmed로 전환한다.
 *  - 원장이 로그인한 상태로 제출하면 confirmed_source='principal'로 기록하고
 *    학생·학부모에게 수정 가능한 확정 링크 안내 문자를 발송한다(best-effort).
 *    이후 학생이 재제출하면 'student'로 승격된다.
 */
export async function submitFinalConfirmationAction(
  payload: unknown
): Promise<SubmitFinalConfirmationResult> {
  const parsed = submitSchema.safeParse(payload)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? '잘못된 요청입니다.' }
  }

  const supabase = createAdminClient()
  const { data: confirmation, error: fetchError } = await supabase
    .from('university_final_confirmations')
    .select('id, student_id')
    .eq('share_token', parsed.data.token)
    .maybeSingle()

  if (fetchError) {
    console.error('[final-confirmation] submit fetch error', fetchError)
    return { error: '처리에 실패했습니다. 잠시 후 다시 시도해 주세요.' }
  }
  if (!confirmation) {
    return { error: '유효하지 않거나 만료된 링크입니다.' }
  }

  // program_key로 카테고리를 판정해 일반대/전문대·예대 항목만 저장한다(한예종은 토글로 관리).
  const uniqueKeys = Array.from(new Set(parsed.data.programKeys))
  const rows: Array<{
    confirmation_id: string
    program_key: string
    university_id: string
    category: 'general' | 'specialized'
    sort_order: number
  }> = []
  let generalCount = 0
  let order = 0
  for (const programKey of uniqueKeys) {
    const program = getProgramPreset(programKey)
    if (!program) continue
    const category = resolveWishlistCategory(program.universityId)
    if (category === 'karts') continue
    if (category === 'general') generalCount += 1
    rows.push({
      confirmation_id: confirmation.id,
      program_key: programKey,
      university_id: program.universityId,
      category,
      sort_order: order++,
    })
  }

  if (generalCount > GENERAL_LIMIT) {
    return { error: `수시 6장에 포함되는 일반대는 최대 ${GENERAL_LIMIT}개까지 선택할 수 있습니다.` }
  }

  // 기존 항목을 지우고 새로 저장(재제출 허용).
  const { error: deleteError } = await supabase
    .from('university_final_confirmation_items')
    .delete()
    .eq('confirmation_id', confirmation.id)

  if (deleteError) {
    console.error('[final-confirmation] submit delete error', deleteError)
    return { error: '처리에 실패했습니다. 잠시 후 다시 시도해 주세요.' }
  }

  if (rows.length > 0) {
    const { error: insertError } = await supabase
      .from('university_final_confirmation_items')
      .insert(rows)
    if (insertError) {
      console.error('[final-confirmation] submit insert error', insertError)
      return { error: '처리에 실패했습니다. 잠시 후 다시 시도해 주세요.' }
    }
  }

  // 원장이 로그인한 상태로 폼을 제출하면 원장 확정으로 기록한다.
  const { profile } = await getAuthContext()
  const isPrincipal = profile?.role === 'principal'

  const { error: updateError } = await supabase
    .from('university_final_confirmations')
    .update({
      status: 'confirmed',
      karts_apply: parsed.data.kartsApply,
      weekday_preferences: parsed.data.weekdayPreferences,
      confirmed_at: new Date().toISOString(),
      // 원장 확정(principal) 후 학생이 재제출하면 student로 승격된다.
      confirmed_source: isPrincipal ? 'principal' : 'student',
    })
    .eq('id', confirmation.id)

  if (updateError) {
    console.error('[final-confirmation] submit update error', updateError)
    return { error: '처리에 실패했습니다. 잠시 후 다시 시도해 주세요.' }
  }

  // 원장 확정 시 학생·학부모에게 수정 가능한 확정 링크 안내 문자를 발송한다(best-effort).
  if (isPrincipal) {
    try {
      await notifyUniversityPrincipalConfirmed({
        studentId: confirmation.student_id,
        token: parsed.data.token,
      })
    } catch (error) {
      console.error('[final-confirmation] principal confirmed notify error', error)
    }
  }

  revalidatePath('/dashboard/principal/university-reports/wishlists')
  revalidatePath('/dashboard/principal/university-reports/workflow')
  revalidatePath(`/confirm/${parsed.data.token}`)

  return { success: true }
}
