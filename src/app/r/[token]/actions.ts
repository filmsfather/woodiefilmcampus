'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { createAdminClient } from '@/lib/supabase/admin'
import { getProgramPreset } from '@/lib/university-policy/presets'
import { resolveWishlistCategory } from '@/lib/university-policy/yedae'
import { fetchPublicationByToken } from '@/lib/university-report/publication'

const submitConsultSchema = z.object({
  token: z.string().min(16, '잘못된 링크입니다.'),
  direction: z
    .string()
    .trim()
    .min(1, '원하는 컨설팅 방향을 입력해주세요.')
    .max(2000, '내용이 너무 깁니다.'),
})

export type SubmitConsultResult = { success: true } | { error: string }

/**
 * 공유 링크(/r/[token])에서 로그인하지 않은 학생·학부모가 컨설팅 방향을 제출한다.
 * 토큰을 먼저 검증해 유효한 발행 링크에서만 접수하며, service role로 insert한다.
 */
export async function submitConsultDirectionAction(payload: unknown): Promise<SubmitConsultResult> {
  const parsed = submitConsultSchema.safeParse(payload)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? '잘못된 요청입니다.' }
  }

  const publication = await fetchPublicationByToken(parsed.data.token)
  if (!publication) {
    return { error: '유효하지 않거나 만료된 링크입니다.' }
  }

  const supabase = createAdminClient()
  const { error } = await supabase.from('university_report_consult_requests').insert({
    publication_id: publication.id,
    student_id: publication.studentId,
    share_token: parsed.data.token,
    direction: parsed.data.direction,
    status: 'requested',
  })

  if (error) {
    console.error('[consult-request] insert error', error)
    return { error: '제출에 실패했습니다. 잠시 후 다시 시도해주세요.' }
  }

  return { success: true }
}

const wishItemSchema = z.object({
  evaluationId: z.string().min(1),
  wish: z.boolean(),
  universityId: z.string().optional().nullable(),
  universityName: z.string().min(1),
  programName: z.string().min(1),
  programTrack: z.string().optional().nullable(),
  tier: z.string().min(1),
})

const submitWishesSchema = z.object({
  token: z.string().min(16, '잘못된 링크입니다.'),
  wishes: z.array(wishItemSchema).min(1, '분류할 대학이 없습니다.').max(500, '항목이 너무 많습니다.'),
})

export type SubmitWishesResult = { success: true } | { error: string }

/**
 * 공유 링크(/r/[token])에서 학생·학부모가 대학별 "지원 희망/희망하지 않음" 분류 결과를 제출한다.
 * 토큰을 먼저 검증해 유효한 발행 링크에서만 접수하며, service role로 upsert한다.
 * (publication_id, evaluation_id) 충돌 시 갱신해 재제출을 허용한다.
 */
export async function submitUniversityWishesAction(
  payload: unknown
): Promise<SubmitWishesResult> {
  const parsed = submitWishesSchema.safeParse(payload)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? '잘못된 요청입니다.' }
  }

  const publication = await fetchPublicationByToken(parsed.data.token)
  if (!publication) {
    return { error: '유효하지 않거나 만료된 링크입니다.' }
  }

  const supabase = createAdminClient()
  const rows = parsed.data.wishes.map((wish) => ({
    publication_id: publication.id,
    student_id: publication.studentId,
    share_token: parsed.data.token,
    evaluation_id: wish.evaluationId,
    university_id: wish.universityId ?? null,
    university_name: wish.universityName,
    program_name: wish.programName,
    program_track: wish.programTrack ?? null,
    tier: wish.tier,
    wish: wish.wish,
  }))

  const { error } = await supabase
    .from('university_report_university_wishes')
    .upsert(rows, { onConflict: 'publication_id,evaluation_id' })

  if (error) {
    console.error('[university-wishes] upsert error', error)
    return { error: '제출에 실패했습니다. 잠시 후 다시 시도해주세요.' }
  }

  return { success: true }
}

// ── 원장 추천 대학에 대한 학생 응답 (공유 링크) ────────────────────────────────

export type RecommendationResponseResult = { success: true } | { error: string }

/** 학생 응답이 반영되는 원장 화면들을 갱신한다. */
function revalidateRecommendationViews(studentId: string, token: string) {
  revalidatePath('/dashboard/principal/university-reports/workflow')
  revalidatePath('/dashboard/principal/university-reports/wishlists')
  revalidatePath(`/dashboard/principal/university-reports/${studentId}/report`)
  revalidatePath(`/r/${token}`)
}

const confirmRecommendationSchema = z.object({
  token: z.string().min(16, '잘못된 링크입니다.'),
})

/**
 * 공유 링크(/r/[token])에서 학생이 원장 추천 대학을 "이대로 지원 확정"한다.
 * 확정 시 협의 상태를 confirmed로 바꿔 원장 워크플로우의 "대학 확정"에 반영한다.
 */
export async function confirmRecommendationAction(
  payload: unknown
): Promise<RecommendationResponseResult> {
  const parsed = confirmRecommendationSchema.safeParse(payload)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? '잘못된 요청입니다.' }
  }

  const publication = await fetchPublicationByToken(parsed.data.token)
  if (!publication) {
    return { error: '유효하지 않거나 만료된 링크입니다.' }
  }

  const supabase = createAdminClient()
  const { data: wishlist } = await supabase
    .from('university_wishlists')
    .select('id, status')
    .eq('student_id', publication.studentId)
    .maybeSingle()

  if (!wishlist) {
    return { error: '아직 원장 선생님의 추천이 도착하지 않았습니다.' }
  }
  if (wishlist.status === 'confirmed') {
    return { success: true }
  }
  if (wishlist.status === 'draft') {
    return { error: '아직 원장 선생님의 추천이 도착하지 않았습니다.' }
  }

  const { error } = await supabase
    .from('university_wishlists')
    .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
    .eq('id', wishlist.id)

  if (error) {
    console.error('[recommendation-response] confirm error', error)
    return { error: '확정에 실패했습니다. 잠시 후 다시 시도해주세요.' }
  }

  revalidateRecommendationViews(publication.studentId, parsed.data.token)
  return { success: true }
}

const reviseRecommendationSchema = z
  .object({
    token: z.string().min(16, '잘못된 링크입니다.'),
    message: z.string().trim().max(2000, '내용이 너무 깁니다.').optional(),
    programKeys: z.array(z.string().min(1)).max(30).optional(),
  })
  .refine(
    (data) =>
      (data.message && data.message.length > 0) ||
      (data.programKeys && data.programKeys.length > 0),
    { message: '질문을 입력하거나 희망하는 대학을 선택해 주세요.' }
  )

/**
 * 공유 링크(/r/[token])에서 학생이 원장에게 질문을 보내거나 다른 희망 대학을 추가한다.
 * 협의 상태를 revising으로 바꿔 원장 워크플로우의 "새 의견 있음"에 반영한다.
 */
export async function reviseRecommendationAction(
  payload: unknown
): Promise<RecommendationResponseResult> {
  const parsed = reviseRecommendationSchema.safeParse(payload)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? '잘못된 요청입니다.' }
  }

  const publication = await fetchPublicationByToken(parsed.data.token)
  if (!publication) {
    return { error: '유효하지 않거나 만료된 링크입니다.' }
  }

  const supabase = createAdminClient()
  const { data: wishlist } = await supabase
    .from('university_wishlists')
    .select('id, status')
    .eq('student_id', publication.studentId)
    .maybeSingle()

  if (!wishlist) {
    return { error: '아직 원장 선생님의 추천이 도착하지 않았습니다.' }
  }
  if (wishlist.status === 'confirmed') {
    return { error: '이미 지원을 확정했습니다. 변경하려면 원장 선생님께 문의해 주세요.' }
  }
  if (wishlist.status === 'draft') {
    return { error: '아직 원장 선생님의 추천이 도착하지 않았습니다.' }
  }

  // 학생이 직접 선택한 희망 대학을 협의 항목으로 추가한다(중복·미존재 제외).
  const addedLabels: string[] = []
  const programKeys = Array.from(new Set(parsed.data.programKeys ?? []))
  if (programKeys.length > 0) {
    const { data: existingItems } = await supabase
      .from('university_wishlist_items')
      .select('program_key, sort_order')
      .eq('wishlist_id', wishlist.id)

    const existingKeys = new Set(
      (existingItems ?? []).map((i) => i.program_key).filter(Boolean) as string[]
    )
    let maxOrder = (existingItems ?? []).reduce(
      (max, i) => Math.max(max, i.sort_order ?? 0),
      0
    )

    const newRows: Array<Record<string, unknown>> = []
    for (const programKey of programKeys) {
      if (existingKeys.has(programKey)) continue
      const program = getProgramPreset(programKey)
      if (!program) continue
      maxOrder += 1
      newRows.push({
        wishlist_id: wishlist.id,
        program_key: programKey,
        university_id: program.universityId,
        category: resolveWishlistCategory(program.universityId),
        proposed_by: 'student',
        sort_order: maxOrder,
        note: '학생이 공유 링크에서 직접 선택',
      })
      addedLabels.push(program.name)
    }

    if (newRows.length > 0) {
      const { error: insertError } = await supabase
        .from('university_wishlist_items')
        .insert(newRows)
      if (insertError) {
        console.error('[recommendation-response] add items error', insertError)
        return { error: '대학 추가에 실패했습니다. 잠시 후 다시 시도해주세요.' }
      }
    }
  }

  // 학생 의견/질문을 메시지로 남긴다. 메시지가 없고 대학만 추가했다면 자동 요약 메시지를 남긴다.
  const messageBody =
    parsed.data.message && parsed.data.message.length > 0
      ? parsed.data.message
      : addedLabels.length > 0
        ? `학생이 다른 희망 대학을 선택했습니다: ${addedLabels.join(', ')}`
        : ''

  if (messageBody.length > 0) {
    const { error: msgError } = await supabase.from('university_wishlist_messages').insert({
      wishlist_id: wishlist.id,
      author_id: publication.studentId,
      author_role: 'student',
      body: messageBody,
    })
    if (msgError) {
      console.error('[recommendation-response] message error', msgError)
      return { error: '전송에 실패했습니다. 잠시 후 다시 시도해주세요.' }
    }
  }

  const { error } = await supabase
    .from('university_wishlists')
    .update({ status: 'revising' })
    .eq('id', wishlist.id)

  if (error) {
    console.error('[recommendation-response] revise status error', error)
    return { error: '전송에 실패했습니다. 잠시 후 다시 시도해주세요.' }
  }

  revalidateRecommendationViews(publication.studentId, parsed.data.token)
  return { success: true }
}
