'use server'

import { z } from 'zod'

import { createAdminClient } from '@/lib/supabase/admin'
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
