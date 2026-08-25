import { createAdminClient } from '@/lib/supabase/admin'
import type { PracticeBookingType, PracticeType } from '@/types/practice'

export type PracticeBookingErrorCode =
  | 'SLOT_NOT_FOUND'
  | 'SLOT_UNAVAILABLE'
  | 'SLOT_TAKEN'
  | 'PROBLEM_EXHAUSTED'
  | 'PHASE_NOT_OPEN'
  | 'BOOKING_CLOSED'
  | 'DAILY_QUOTA_EXCEEDED'
  | 'ALREADY_BOOKED'
  | 'BOOKING_NOT_FOUND'
  | 'NOT_CANCELABLE'
  | 'ALREADY_SUBMITTED'
  | 'UNKNOWN'

const ERROR_MESSAGES: Record<PracticeBookingErrorCode, string> = {
  SLOT_NOT_FOUND: '슬롯을 찾을 수 없습니다.',
  SLOT_UNAVAILABLE: '예약할 수 없는 슬롯입니다.',
  SLOT_TAKEN: '방금 다른 예약이 확정된 슬롯입니다. 다른 시간을 선택해주세요.',
  PROBLEM_EXHAUSTED: '이 대학의 문제를 모두 응시했습니다. 선생님께 문제 추가를 요청해주세요.',
  PHASE_NOT_OPEN: '아직 예약이 열리지 않았습니다.',
  BOOKING_CLOSED: '예약이 마감된 주입니다. 변경이 필요하면 선생님께 문의해주세요.',
  DAILY_QUOTA_EXCEEDED: '해당 날짜의 예약 가능 횟수를 모두 사용했습니다.',
  ALREADY_BOOKED: '같은 시간에 이미 다른 예약이 있습니다.',
  BOOKING_NOT_FOUND: '예약을 찾을 수 없습니다.',
  NOT_CANCELABLE: '이미 취소되었거나 종료된 예약입니다.',
  ALREADY_SUBMITTED: '이미 제출된 예약은 취소할 수 없습니다.',
  UNKNOWN: '예약 처리 중 오류가 발생했습니다.',
}

export function describePracticeBookingError(code: string): string {
  return ERROR_MESSAGES[(code as PracticeBookingErrorCode) ?? 'UNKNOWN'] ?? ERROR_MESSAGES.UNKNOWN
}

type RpcResult = { ok: boolean; error?: string; bookingId?: string; attemptId?: string; problemId?: string }

/**
 * 예약 생성. 슬롯 잠금 -> 단계/일일 한도 확인 -> 문제 배정 -> 예약/응시 insert가
 * DB 함수 안에서 원자적으로 일어난다. booking_cycle에는 슬롯 날짜(KST)를 기록한다.
 */
export async function createPracticeBooking(params: {
  slotId: string
  studentId: string
  universityId: string
  practiceType: PracticeType
  bookingType: PracticeBookingType
  createdBy: string
}): Promise<{ success: true; bookingId: string; attemptId: string } | { success: false; error: string }> {
  const admin = createAdminClient()

  const { data: slot, error: slotError } = await admin
    .from('practice_slots')
    .select('id, slot_date')
    .eq('id', params.slotId)
    .maybeSingle()

  if (slotError || !slot) {
    return { success: false, error: ERROR_MESSAGES.SLOT_NOT_FOUND }
  }

  const bookingCycle = (slot as { slot_date: string }).slot_date

  const { data, error } = await admin.rpc('create_practice_booking', {
    p_slot_id: params.slotId,
    p_student_id: params.studentId,
    p_university_id: params.universityId,
    p_practice_type: params.practiceType,
    p_booking_type: params.bookingType,
    p_booking_cycle: bookingCycle,
    p_created_by: params.createdBy,
  })

  if (error) {
    console.error('[practice] create booking rpc failed', error)
    return { success: false, error: ERROR_MESSAGES.UNKNOWN }
  }

  const result = data as RpcResult | null

  if (!result?.ok) {
    return { success: false, error: describePracticeBookingError(result?.error ?? 'UNKNOWN') }
  }

  return {
    success: true,
    bookingId: result.bookingId as string,
    attemptId: result.attemptId as string,
  }
}

export async function cancelPracticeBooking(params: {
  bookingId: string
  canceledBy: string
}): Promise<{ success: true } | { success: false; error: string }> {
  const admin = createAdminClient()

  const { data, error } = await admin.rpc('cancel_practice_booking', {
    p_booking_id: params.bookingId,
    p_canceled_by: params.canceledBy,
  })

  if (error) {
    console.error('[practice] cancel booking rpc failed', error)
    return { success: false, error: ERROR_MESSAGES.UNKNOWN }
  }

  const result = data as RpcResult | null

  if (!result?.ok) {
    return { success: false, error: describePracticeBookingError(result?.error ?? 'UNKNOWN') }
  }

  return { success: true }
}
