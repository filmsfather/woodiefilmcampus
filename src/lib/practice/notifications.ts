import { createAdminClient } from '@/lib/supabase/admin'
import { resolveUniversityName } from '@/lib/practice/shared'
import {
  sendPracticeBookingCancellationSMS,
  sendPracticeBookingConfirmationSMS,
} from '@/lib/solapi'
import type { PracticeType } from '@/types/practice'

type BookingNotificationRow = {
  id: string
  student_id: string
  university_id: string
  practice_type: PracticeType
  practice_slots:
    | { starts_at: string; room_no: number | null }
    | Array<{ starts_at: string; room_no: number | null }>
    | null
  practice_attempts: Array<{ opens_at: string; deadline_at: string }> | null
  profiles:
    | { name: string | null; student_phone: string | null; parent_phone: string | null }
    | Array<{ name: string | null; student_phone: string | null; parent_phone: string | null }>
    | null
}

function firstOf<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null
  }
  return value ?? null
}

async function fetchBookingForNotification(bookingId: string): Promise<BookingNotificationRow | null> {
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('practice_bookings')
    .select(
      `id, student_id, university_id, practice_type,
       practice_slots(starts_at, room_no),
       practice_attempts(opens_at, deadline_at),
       profiles:profiles!practice_bookings_student_id_fkey(name, student_phone, parent_phone)`
    )
    .eq('id', bookingId)
    .maybeSingle()

  if (error || !data) {
    console.error('[practice] 문자 발송용 예약 조회에 실패했습니다.', error)
    return null
  }

  return data as unknown as BookingNotificationRow
}

/** 학생·학부모 연락처를 중복 없이 모은다. */
function collectPhones(row: BookingNotificationRow): string[] {
  const student = firstOf(row.profiles)
  const phones = [student?.student_phone, student?.parent_phone]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
  return Array.from(new Set(phones))
}

/**
 * 예약 확정 안내 문자(학생 + 학부모). 문자 실패가 예약 처리를 막지 않도록
 * 어떤 경우에도 throw 하지 않는다.
 */
export async function notifyPracticeBookingConfirmed(bookingId: string): Promise<void> {
  try {
    const row = await fetchBookingForNotification(bookingId)
    if (!row) {
      return
    }

    const slot = firstOf(row.practice_slots)
    const attempt = row.practice_attempts?.[0] ?? null

    if (!slot || !attempt) {
      console.warn('[practice] 슬롯/응시 정보가 없어 예약 확정 문자를 건너뜁니다.', bookingId)
      return
    }

    const timeLimitMinutes = Math.max(
      0,
      Math.round((new Date(attempt.deadline_at).getTime() - new Date(attempt.opens_at).getTime()) / 60_000)
    )

    const student = firstOf(row.profiles)
    const phones = collectPhones(row)

    if (phones.length === 0) {
      console.warn('[practice] 학생·학부모 연락처가 없어 예약 확정 문자를 건너뜁니다.', bookingId)
      return
    }

    await Promise.all(
      phones.map((phoneNumber) =>
        sendPracticeBookingConfirmationSMS({
          phoneNumber,
          studentName: student?.name ?? '학생',
          universityName: resolveUniversityName(row.university_id),
          practiceType: row.practice_type,
          timeLimitMinutes,
          opensAt: attempt.opens_at,
          startsAt: slot.starts_at,
          roomNo: slot.room_no,
        })
      )
    )
  } catch (error) {
    console.error('[practice] 예약 확정 문자 발송 중 오류가 발생했습니다.', error)
  }
}

/**
 * 예약 취소 안내 문자(학생 + 학부모). 취소 시 응시 행은 삭제되므로
 * 슬롯 시각만으로 안내한다. 어떤 경우에도 throw 하지 않는다.
 */
export async function notifyPracticeBookingCanceled(bookingId: string): Promise<void> {
  try {
    const row = await fetchBookingForNotification(bookingId)
    if (!row) {
      return
    }

    const slot = firstOf(row.practice_slots)
    if (!slot) {
      console.warn('[practice] 슬롯 정보가 없어 취소 문자를 건너뜁니다.', bookingId)
      return
    }

    const student = firstOf(row.profiles)
    const phones = collectPhones(row)

    if (phones.length === 0) {
      console.warn('[practice] 학생·학부모 연락처가 없어 취소 문자를 건너뜁니다.', bookingId)
      return
    }

    await Promise.all(
      phones.map((phoneNumber) =>
        sendPracticeBookingCancellationSMS({
          phoneNumber,
          studentName: student?.name ?? '학생',
          universityName: resolveUniversityName(row.university_id),
          practiceType: row.practice_type,
          startsAt: slot.starts_at,
        })
      )
    )
  } catch (error) {
    console.error('[practice] 취소 문자 발송 중 오류가 발생했습니다.', error)
  }
}
