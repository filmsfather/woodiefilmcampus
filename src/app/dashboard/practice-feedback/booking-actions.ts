'use server'

import { revalidatePath } from 'next/cache'

import { getAuthContext } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { cancelPracticeBooking, createPracticeBooking } from '@/lib/practice/booking'
import {
  cancelPracticeBookingSchema,
  createFreePracticeBookingSchema,
  createPracticeBookingSchema,
} from '@/lib/validation/practice'
import type { UserProfile } from '@/lib/supabase'

type ActionResult = { success?: true; error?: string; attemptId?: string }

const STAFF_ROLES = new Set<UserProfile['role']>(['teacher', 'manager', 'principal'])

const PATHS = [
  '/dashboard/manager/practice-feedback/board',
  '/dashboard/manager/practice-feedback/bookings',
  '/dashboard/teacher/practice-feedback/board',
  '/dashboard/teacher/practice-feedback/today',
  '/dashboard/student/practice-feedback',
  '/dashboard/student/practice-feedback/book',
]

function revalidateBookings() {
  for (const path of PATHS) {
    revalidatePath(path)
  }
}

/** 담임/실장이 슬롯에 학생을 배정한다. */
export async function assignPracticeBookingAction(payload: unknown): Promise<ActionResult> {
  const { profile } = await getAuthContext()
  if (!profile || !STAFF_ROLES.has(profile.role)) {
    return { error: '예약을 배정할 권한이 없습니다.' }
  }

  const parsed = createPracticeBookingSchema.safeParse(payload)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다.' }
  }

  const result = await createPracticeBooking({
    slotId: parsed.data.slotId,
    studentId: parsed.data.studentId,
    universityId: parsed.data.universityId,
    practiceType: parsed.data.practiceType,
    bookingType: 'homeroom',
    createdBy: profile.id,
  })

  if (!result.success) {
    return { error: result.error }
  }

  revalidateBookings()
  return { success: true, attemptId: result.attemptId }
}

/** 학생이 공개된 빈 슬롯을 직접 예약한다. 단계/일일 한도 판정은 DB 함수가 최종적으로 보장한다. */
export async function createFreePracticeBookingAction(payload: unknown): Promise<ActionResult> {
  const { profile } = await getAuthContext()
  if (!profile || profile.role !== 'student') {
    return { error: '학생만 자유 예약을 할 수 있습니다.' }
  }

  const parsed = createFreePracticeBookingSchema.safeParse(payload)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다.' }
  }

  const admin = createAdminClient()
  const nowIso = new Date().toISOString()

  const { data: slot, error: slotError } = await admin
    .from('practice_slots')
    .select('id, free_booking_opens_at, starts_at, status')
    .eq('id', parsed.data.slotId)
    .maybeSingle()

  if (slotError || !slot) {
    return { error: '슬롯을 찾을 수 없습니다.' }
  }

  const slotRow = slot as { free_booking_opens_at: string | null; starts_at: string; status: string }

  if (!slotRow.free_booking_opens_at || slotRow.free_booking_opens_at > nowIso) {
    return { error: '아직 1차 예약이 열리지 않은 슬롯입니다.' }
  }
  if (slotRow.starts_at <= nowIso) {
    return { error: '이미 지난 시간입니다.' }
  }

  const result = await createPracticeBooking({
    slotId: parsed.data.slotId,
    studentId: profile.id,
    universityId: parsed.data.universityId,
    practiceType: parsed.data.practiceType,
    bookingType: 'free',
    createdBy: profile.id,
  })

  if (!result.success) {
    return { error: result.error }
  }

  revalidateBookings()
  return { success: true, attemptId: result.attemptId }
}

export async function cancelPracticeBookingAction(payload: unknown): Promise<ActionResult> {
  const { profile } = await getAuthContext()
  if (!profile) {
    return { error: '로그인이 필요합니다.' }
  }

  const parsed = cancelPracticeBookingSchema.safeParse(payload)
  if (!parsed.success) {
    return { error: '잘못된 요청입니다.' }
  }

  // 학생은 본인의 자유 예약만 취소할 수 있다.
  if (profile.role === 'student') {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('practice_bookings')
      .select('student_id, booking_type')
      .eq('id', parsed.data.bookingId)
      .maybeSingle()

    if (error || !data) {
      return { error: '예약을 찾을 수 없습니다.' }
    }

    const booking = data as { student_id: string; booking_type: string }
    if (booking.student_id !== profile.id) {
      return { error: '본인의 예약만 취소할 수 있습니다.' }
    }
    if (booking.booking_type !== 'free') {
      return { error: '담임 선생님이 배정한 예약은 직접 취소할 수 없습니다.' }
    }
  } else if (!STAFF_ROLES.has(profile.role)) {
    return { error: '권한이 없습니다.' }
  }

  const result = await cancelPracticeBooking({
    bookingId: parsed.data.bookingId,
    canceledBy: profile.id,
  })

  if (!result.success) {
    return { error: result.error }
  }

  revalidateBookings()
  return { success: true }
}
