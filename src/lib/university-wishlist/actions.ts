'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { getAuthContext } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { getProgramPreset } from '@/lib/university-policy/presets'
import { resolveWishlistCategory } from '@/lib/university-policy/yedae'
import { fetchActiveSnapshot } from '@/lib/university-report/data'
import {
  notifyUniversityRecommendationReady,
  notifyUniversityRecommendationReply,
} from '@/lib/university-report/notifications'

export type WishlistActionResult = { success: true } | { error: string }

const GENERAL_LIMIT = 6

function revalidateForStudent(studentId: string) {
  revalidatePath(`/dashboard/principal/university-reports/${studentId}/report`)
  revalidatePath(`/dashboard/principal/university-reports/${studentId}/analysis`)
  revalidatePath('/dashboard/principal/university-reports/wishlists')
  revalidatePath('/dashboard/student/university-report/wishlist')
  revalidatePath('/dashboard/student')
}

/** 학생의 협의 세션을 가져오고, 없으면 원장 권한으로 생성한다. */
async function ensureWishlist(
  supabase: ReturnType<typeof createAdminClient>,
  studentId: string,
  createdBy: string
): Promise<{ id: string; status: string } | null> {
  const { data: existing } = await supabase
    .from('university_wishlists')
    .select('id, status')
    .eq('student_id', studentId)
    .maybeSingle()

  if (existing) return existing

  const snapshot = await fetchActiveSnapshot(studentId)
  const { data: created, error } = await supabase
    .from('university_wishlists')
    .insert({
      student_id: studentId,
      snapshot_id: snapshot?.id ?? null,
      status: 'draft',
      created_by: createdBy,
    })
    .select('id, status')
    .single()

  if (error || !created) {
    console.error('[university-wishlist] ensureWishlist insert error', error)
    return null
  }
  return created
}

// ── 항목 추가 (원장/학생 공용) ───────────────────────────────────────────────

const addItemSchema = z.object({
  studentId: z.string().uuid(),
  programKey: z.string().min(1),
  note: z.string().trim().max(500).optional(),
})

/**
 * 추천/희망 모집단위 1개를 협의에 추가한다.
 *  - 원장/교사: 세션이 없으면 생성 후 추가(proposed_by=principal).
 *  - 학생 본인: 기존 세션에만 추가(proposed_by=student). 확정 상태에서는 불가.
 * 일반대는 최대 6개로 제한한다(전문대·예대는 제한 없음).
 */
export async function addWishlistItemAction(payload: unknown): Promise<WishlistActionResult> {
  const { profile } = await getAuthContext()
  if (!profile) return { error: '로그인이 필요합니다.' }

  const parsed = addItemSchema.safeParse(payload)
  if (!parsed.success) return { error: '잘못된 요청입니다.' }

  const program = getProgramPreset(parsed.data.programKey)
  if (!program) return { error: '존재하지 않는 모집단위입니다.' }

  const isStaff = profile.role === 'principal' || profile.role === 'manager' || profile.role === 'teacher'
  const isStudentSelf = profile.role === 'student' && profile.id === parsed.data.studentId
  if (!isStaff && !isStudentSelf) return { error: '권한이 없습니다.' }

  const supabase = createAdminClient()

  let wishlist: { id: string; status: string } | null
  if (isStaff) {
    wishlist = await ensureWishlist(supabase, parsed.data.studentId, profile.id)
  } else {
    const { data } = await supabase
      .from('university_wishlists')
      .select('id, status')
      .eq('student_id', parsed.data.studentId)
      .maybeSingle()
    wishlist = data
  }

  if (!wishlist) {
    return { error: isStaff ? '협의를 시작하지 못했습니다.' : '아직 원장 선생님의 추천이 시작되지 않았습니다.' }
  }
  if (wishlist.status === 'confirmed') {
    return { error: '이미 확정된 희망대학입니다. 변경하려면 원장 선생님께 재검토를 요청해 주세요.' }
  }

  const category = resolveWishlistCategory(program.universityId)

  const { data: existingItems } = await supabase
    .from('university_wishlist_items')
    .select('id, program_key, category, sort_order')
    .eq('wishlist_id', wishlist.id)

  if ((existingItems ?? []).some((i) => i.program_key === parsed.data.programKey)) {
    return { error: '이미 추가된 모집단위입니다.' }
  }
  if (
    category === 'general' &&
    (existingItems ?? []).filter((i) => i.category === 'general').length >= GENERAL_LIMIT
  ) {
    return { error: `일반대는 최대 ${GENERAL_LIMIT}개까지 선택할 수 있습니다.` }
  }

  const maxOrder = (existingItems ?? []).reduce((max, i) => Math.max(max, i.sort_order ?? 0), 0)

  const { error: insertError } = await supabase.from('university_wishlist_items').insert({
    wishlist_id: wishlist.id,
    program_key: parsed.data.programKey,
    university_id: program.universityId,
    category,
    proposed_by: isStaff ? 'principal' : 'student',
    sort_order: maxOrder + 1,
    note: parsed.data.note && parsed.data.note.length > 0 ? parsed.data.note : null,
  })

  if (insertError) {
    console.error('[university-wishlist] addWishlistItemAction insert error', insertError)
    return { error: '추가에 실패했습니다.' }
  }

  revalidateForStudent(parsed.data.studentId)
  return { success: true }
}

// ── 항목 삭제 ───────────────────────────────────────────────────────────────

const removeItemSchema = z.object({ itemId: z.string().uuid() })

export async function removeWishlistItemAction(payload: unknown): Promise<WishlistActionResult> {
  const { profile } = await getAuthContext()
  if (!profile) return { error: '로그인이 필요합니다.' }

  const parsed = removeItemSchema.safeParse(payload)
  if (!parsed.success) return { error: '잘못된 요청입니다.' }

  const supabase = createAdminClient()
  const { data: item } = await supabase
    .from('university_wishlist_items')
    .select('id, proposed_by, wishlist_id, university_wishlists!inner(student_id, status)')
    .eq('id', parsed.data.itemId)
    .maybeSingle()

  if (!item) return { error: '항목을 찾을 수 없습니다.' }

  const wishlist = Array.isArray(item.university_wishlists)
    ? item.university_wishlists[0]
    : item.university_wishlists
  const studentId = wishlist?.student_id as string | undefined
  const status = wishlist?.status as string | undefined

  const isStaff = profile.role === 'principal' || profile.role === 'manager' || profile.role === 'teacher'
  const isStudentSelf = profile.role === 'student' && profile.id === studentId

  if (!isStaff && !isStudentSelf) return { error: '권한이 없습니다.' }
  if (status === 'confirmed') return { error: '확정된 희망대학은 변경할 수 없습니다.' }
  // 학생은 본인이 추가한 항목만 삭제 가능.
  if (isStudentSelf && !isStaff && item.proposed_by !== 'student') {
    return { error: '원장 선생님이 추천한 항목은 삭제할 수 없습니다. 의견으로 알려 주세요.' }
  }

  const { error } = await supabase
    .from('university_wishlist_items')
    .delete()
    .eq('id', parsed.data.itemId)

  if (error) {
    console.error('[university-wishlist] removeWishlistItemAction error', error)
    return { error: '삭제에 실패했습니다.' }
  }

  if (studentId) revalidateForStudent(studentId)
  return { success: true }
}

// ── 원장: 추천 전송 (draft/revising → proposed) ──────────────────────────────

const proposeSchema = z.object({
  studentId: z.string().uuid(),
  message: z.string().trim().max(2000).optional(),
})

export async function proposeWishlistAction(payload: unknown): Promise<WishlistActionResult> {
  const { profile } = await getAuthContext()
  if (!profile) return { error: '로그인이 필요합니다.' }
  if (profile.role !== 'principal' && profile.role !== 'manager' && profile.role !== 'teacher') {
    return { error: '권한이 없습니다.' }
  }

  const parsed = proposeSchema.safeParse(payload)
  if (!parsed.success) return { error: '잘못된 요청입니다.' }

  const supabase = createAdminClient()
  const { data: wishlist } = await supabase
    .from('university_wishlists')
    .select('id, status')
    .eq('student_id', parsed.data.studentId)
    .maybeSingle()

  if (!wishlist) return { error: '먼저 추천 대학을 추가해 주세요.' }

  const { count } = await supabase
    .from('university_wishlist_items')
    .select('id', { count: 'exact', head: true })
    .eq('wishlist_id', wishlist.id)
  if (!count || count === 0) return { error: '추천 대학을 1개 이상 추가해 주세요.' }

  // 재전송(이미 학생에게 보낸 적 있음) 여부를 갱신 전 상태로 판별한다.
  const isResend = wishlist.status === 'proposed' || wishlist.status === 'revising'

  const { error } = await supabase
    .from('university_wishlists')
    .update({ status: 'proposed' })
    .eq('id', wishlist.id)

  if (error) {
    console.error('[university-wishlist] proposeWishlistAction error', error)
    return { error: '전송에 실패했습니다.' }
  }

  if (parsed.data.message && parsed.data.message.length > 0) {
    await supabase.from('university_wishlist_messages').insert({
      wishlist_id: wishlist.id,
      author_id: profile.id,
      author_role: profile.role === 'principal' ? 'principal' : 'teacher',
      body: parsed.data.message,
    })
  }

  // 첫 전송이면 "추천 도착", 재전송(학생 의견 이후)이면 "원장 답변" 문구로 문자를 보낸다(best-effort).
  if (isResend) {
    await notifyUniversityRecommendationReply({ studentId: parsed.data.studentId })
  } else {
    await notifyUniversityRecommendationReady({ studentId: parsed.data.studentId })
  }

  revalidateForStudent(parsed.data.studentId)
  return { success: true }
}

// ── 원장: 답변 (revising → proposed, 메시지 필수) ────────────────────────────

const replySchema = z.object({
  studentId: z.string().uuid(),
  message: z.string().trim().min(1).max(2000),
})

export async function principalReplyAction(payload: unknown): Promise<WishlistActionResult> {
  const { profile } = await getAuthContext()
  if (!profile) return { error: '로그인이 필요합니다.' }
  if (profile.role !== 'principal' && profile.role !== 'manager' && profile.role !== 'teacher') {
    return { error: '권한이 없습니다.' }
  }

  const parsed = replySchema.safeParse(payload)
  if (!parsed.success) return { error: '답변 내용을 입력해 주세요.' }

  const supabase = createAdminClient()
  const { data: wishlist } = await supabase
    .from('university_wishlists')
    .select('id, status')
    .eq('student_id', parsed.data.studentId)
    .maybeSingle()

  if (!wishlist) return { error: '협의 정보를 찾을 수 없습니다.' }

  const { error: msgError } = await supabase.from('university_wishlist_messages').insert({
    wishlist_id: wishlist.id,
    author_id: profile.id,
    author_role: profile.role === 'principal' ? 'principal' : 'teacher',
    body: parsed.data.message,
  })
  if (msgError) {
    console.error('[university-wishlist] principalReplyAction message error', msgError)
    return { error: '답변 전송에 실패했습니다.' }
  }

  // 재검토를 위해 학생에게 다시 검토 대기(proposed) 상태로 돌린다.
  if (wishlist.status === 'revising') {
    await supabase.from('university_wishlists').update({ status: 'proposed' }).eq('id', wishlist.id)
  }

  // 학생·학부모에게 원장 답변 도착을 문자로 알린다(best-effort).
  await notifyUniversityRecommendationReply({ studentId: parsed.data.studentId })

  revalidateForStudent(parsed.data.studentId)
  return { success: true }
}

// ── 학생: 응답 (동의 → confirmed / 수정요청 → revising) ──────────────────────

const respondSchema = z.object({
  wishlistId: z.string().uuid(),
  decision: z.enum(['approve', 'revise']),
  message: z.string().trim().max(2000).optional(),
})

export async function studentRespondAction(payload: unknown): Promise<WishlistActionResult> {
  const { profile } = await getAuthContext()
  if (!profile) return { error: '로그인이 필요합니다.' }
  if (profile.role !== 'student') return { error: '학생만 응답할 수 있습니다.' }

  const parsed = respondSchema.safeParse(payload)
  if (!parsed.success) return { error: '잘못된 요청입니다.' }

  const supabase = createAdminClient()
  const { data: wishlist } = await supabase
    .from('university_wishlists')
    .select('id, student_id, status')
    .eq('id', parsed.data.wishlistId)
    .maybeSingle()

  if (!wishlist || wishlist.student_id !== profile.id) return { error: '권한이 없습니다.' }
  if (wishlist.status === 'confirmed') return { error: '이미 확정되었습니다.' }
  if (wishlist.status === 'draft') return { error: '아직 원장 선생님의 추천이 전송되지 않았습니다.' }

  if (parsed.data.decision === 'revise' && (!parsed.data.message || parsed.data.message.length === 0)) {
    return { error: '수정 요청 시 의견이나 질문을 입력해 주세요.' }
  }

  if (parsed.data.message && parsed.data.message.length > 0) {
    const { error: msgError } = await supabase.from('university_wishlist_messages').insert({
      wishlist_id: wishlist.id,
      author_id: profile.id,
      author_role: 'student',
      body: parsed.data.message,
    })
    if (msgError) {
      console.error('[university-wishlist] studentRespondAction message error', msgError)
      return { error: '전송에 실패했습니다.' }
    }
  }

  const nextStatus = parsed.data.decision === 'approve' ? 'confirmed' : 'revising'
  const { error } = await supabase
    .from('university_wishlists')
    .update({
      status: nextStatus,
      confirmed_at: nextStatus === 'confirmed' ? new Date().toISOString() : null,
    })
    .eq('id', wishlist.id)

  if (error) {
    console.error('[university-wishlist] studentRespondAction update error', error)
    return { error: '처리에 실패했습니다.' }
  }

  revalidateForStudent(wishlist.student_id)
  return { success: true }
}

// ── 원장: 확정 해제(재검토 열기) confirmed → proposed ────────────────────────

const reopenSchema = z.object({ studentId: z.string().uuid() })

export async function reopenWishlistAction(payload: unknown): Promise<WishlistActionResult> {
  const { profile } = await getAuthContext()
  if (!profile) return { error: '로그인이 필요합니다.' }
  if (profile.role !== 'principal' && profile.role !== 'manager') {
    return { error: '권한이 없습니다.' }
  }

  const parsed = reopenSchema.safeParse(payload)
  if (!parsed.success) return { error: '잘못된 요청입니다.' }

  const supabase = createAdminClient()
  const { error } = await supabase
    .from('university_wishlists')
    .update({ status: 'proposed', confirmed_at: null })
    .eq('student_id', parsed.data.studentId)
    .eq('status', 'confirmed')

  if (error) {
    console.error('[university-wishlist] reopenWishlistAction error', error)
    return { error: '재검토 열기에 실패했습니다.' }
  }

  revalidateForStudent(parsed.data.studentId)
  return { success: true }
}

// ── 원장: 생기부 제출 요청 ───────────────────────────────────────────────────

const requestRecordSchema = z.object({ studentId: z.string().uuid() })

/**
 * 학생에게 생기부(학교생활기록부) 제출을 요청한다. 협의 세션이 없으면 생성한다.
 * 이미 제출된 상태에서 다시 요청하면 기존 파일 메타데이터를 비우고 'requested'로 되돌린다.
 */
export async function requestStudentRecordAction(payload: unknown): Promise<WishlistActionResult> {
  const { profile } = await getAuthContext()
  if (!profile) return { error: '로그인이 필요합니다.' }
  if (profile.role !== 'principal' && profile.role !== 'manager' && profile.role !== 'teacher') {
    return { error: '권한이 없습니다.' }
  }

  const parsed = requestRecordSchema.safeParse(payload)
  if (!parsed.success) return { error: '잘못된 요청입니다.' }

  const supabase = createAdminClient()
  const wishlist = await ensureWishlist(supabase, parsed.data.studentId, profile.id)
  if (!wishlist) return { error: '협의를 시작하지 못했습니다.' }

  const { error } = await supabase
    .from('university_wishlists')
    .update({
      record_request_status: 'requested',
      record_requested_at: new Date().toISOString(),
      record_submitted_at: null,
      record_file_bucket: null,
      record_file_path: null,
      record_file_name: null,
      record_file_mime: null,
      record_file_size: null,
    })
    .eq('id', wishlist.id)

  if (error) {
    console.error('[university-wishlist] requestStudentRecordAction error', error)
    return { error: '생기부 제출 요청에 실패했습니다.' }
  }

  revalidateForStudent(parsed.data.studentId)
  return { success: true }
}

// ── 학생: 생기부 제출 (파일 업로드는 클라이언트에서 선행) ─────────────────────

const submitRecordSchema = z.object({
  studentId: z.string().uuid(),
  bucket: z.string().min(1),
  path: z.string().min(1),
  fileName: z.string().min(1).max(255),
  mimeType: z.string().max(255).optional(),
  size: z.number().int().nonnegative().optional(),
})

/**
 * 학생이 업로드한 생기부 파일 메타데이터를 협의에 저장하고 'submitted'로 전환한다.
 * 제출 시 협의 스레드에 학생 메시지를 1건 남겨 원장 화면 및 워크플로우에 노출되도록 한다.
 */
export async function submitStudentRecordAction(payload: unknown): Promise<WishlistActionResult> {
  const { profile } = await getAuthContext()
  if (!profile) return { error: '로그인이 필요합니다.' }
  if (profile.role !== 'student') return { error: '학생만 제출할 수 있습니다.' }

  const parsed = submitRecordSchema.safeParse(payload)
  if (!parsed.success) return { error: '잘못된 요청입니다.' }
  if (profile.id !== parsed.data.studentId) return { error: '권한이 없습니다.' }

  // 업로드 경로는 본인 폴더(첫 세그먼트 = studentId)여야 한다(스토리지 RLS와 동일 가드).
  if (parsed.data.path.split('/')[0] !== parsed.data.studentId) {
    return { error: '잘못된 업로드 경로입니다.' }
  }

  const supabase = createAdminClient()
  const { data: wishlist } = await supabase
    .from('university_wishlists')
    .select('id, status, record_request_status')
    .eq('student_id', parsed.data.studentId)
    .maybeSingle()

  if (!wishlist) return { error: '아직 생기부 제출 요청이 도착하지 않았습니다.' }

  const { error } = await supabase
    .from('university_wishlists')
    .update({
      record_request_status: 'submitted',
      record_submitted_at: new Date().toISOString(),
      record_file_bucket: parsed.data.bucket,
      record_file_path: parsed.data.path,
      record_file_name: parsed.data.fileName,
      record_file_mime: parsed.data.mimeType ?? null,
      record_file_size: parsed.data.size ?? null,
    })
    .eq('id', wishlist.id)

  if (error) {
    console.error('[university-wishlist] submitStudentRecordAction error', error)
    return { error: '생기부 제출에 실패했습니다.' }
  }

  // 협의 스레드에 제출 완료 메시지를 남긴다(원장 화면 의견·질문 + 워크플로우 노출).
  await supabase.from('university_wishlist_messages').insert({
    wishlist_id: wishlist.id,
    author_id: profile.id,
    author_role: 'student',
    body: '생기부를 제출했습니다.',
  })

  revalidateForStudent(parsed.data.studentId)
  return { success: true }
}
