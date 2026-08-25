'use server'

import { revalidatePath } from 'next/cache'

import { getAuthContext } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  buildSlotTimeLabels,
  getPhaseOpenTimes,
  toPgTime,
} from '@/lib/practice/shared'
import {
  createPracticeSlotBlockSchema,
  deletePracticeSlotBlockSchema,
  deletePracticeSlotSchema,
  updatePracticeBookingStatusSchema,
  updatePracticeSlotStatusSchema,
} from '@/lib/validation/practice'
import type { UserProfile } from '@/lib/supabase'

type ActionResult = { success?: true; error?: string; createdCount?: number }

const MANAGER_ROLES = new Set<UserProfile['role']>(['manager', 'principal'])

const PATHS = [
  '/dashboard/manager/practice-feedback/slots',
  '/dashboard/manager/practice-feedback/board',
  '/dashboard/manager/practice-feedback/bookings',
  '/dashboard/teacher/practice-feedback/board',
  '/dashboard/teacher/practice-feedback/today',
  '/dashboard/student/practice-feedback',
  '/dashboard/student/practice-feedback/book',
]

function revalidatePractice() {
  for (const path of PATHS) {
    revalidatePath(path)
  }
}

async function ensureManager() {
  const { profile } = await getAuthContext()
  if (!profile || !MANAGER_ROLES.has(profile.role)) {
    return null
  }
  return profile
}

/**
 * 근무 블록을 등록하고 선생님 x 슬롯 길이만큼 슬롯을 일괄 생성한다.
 * 이미 같은 (선생님, 날짜, 시각) 슬롯이 있으면 건너뛴다.
 */
export async function createPracticeSlotBlockAction(payload: unknown): Promise<ActionResult> {
  const profile = await ensureManager()
  if (!profile) {
    return { error: '슬롯을 개설할 권한이 없습니다.' }
  }

  const parsed = createPracticeSlotBlockSchema.safeParse(payload)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다.' }
  }

  const input = parsed.data

  let timeLabels: string[]
  try {
    timeLabels = buildSlotTimeLabels(input.startTime, input.endTime, input.slotMinutes)
  } catch (error) {
    return { error: error instanceof Error ? error.message : '시간 범위가 올바르지 않습니다.' }
  }

  if (timeLabels.length === 0) {
    return { error: '선택한 시간 범위에 만들 수 있는 슬롯이 없습니다.' }
  }

  // 오픈 시각은 블록 날짜가 속한 주 기준으로 계산한다. 같은 주 블록은 같은 시각에 함께 열린다.
  let phaseOpenTimes: { phase1OpensAt: string; phase2OpensAt: string }
  try {
    phaseOpenTimes = getPhaseOpenTimes(input.blockDate)
  } catch (error) {
    return { error: error instanceof Error ? error.message : '날짜가 올바르지 않습니다.' }
  }

  const admin = createAdminClient()

  const { data: blockRow, error: blockError } = await admin
    .from('practice_slot_blocks')
    .insert({
      block_date: input.blockDate,
      start_time: toPgTime(input.startTime),
      end_time: toPgTime(input.endTime),
      slot_minutes: input.slotMinutes,
      free_booking_opens_at: phaseOpenTimes.phase1OpensAt,
      phase2_opens_at: phaseOpenTimes.phase2OpensAt,
      notes: input.notes ?? null,
      created_by: profile.id,
    })
    .select('id')
    .single()

  if (blockError || !blockRow?.id) {
    console.error('[practice] failed to insert slot block', blockError)
    return { error: '근무 블록 저장에 실패했습니다.' }
  }

  const blockId = blockRow.id as string

  const { error: teacherError } = await admin.from('practice_slot_block_teachers').insert(
    input.teachers.map((teacher) => ({
      block_id: blockId,
      teacher_id: teacher.teacherId,
      room_no: teacher.roomNo,
      break_times: teacher.breakTimes.map(toPgTime),
    }))
  )

  if (teacherError) {
    console.error('[practice] failed to link block teachers', teacherError)
    await admin.from('practice_slot_blocks').delete().eq('id', blockId)
    return { error: '선생님 배정에 실패했습니다.' }
  }

  const slotRows = input.teachers.flatMap((teacher) =>
    timeLabels.map((label) => ({
      block_id: blockId,
      teacher_id: teacher.teacherId,
      room_no: teacher.roomNo,
      slot_date: input.blockDate,
      start_time: toPgTime(label),
      duration_minutes: input.slotMinutes,
      status: teacher.breakTimes.includes(label) ? 'break' : 'open',
      free_booking_opens_at: phaseOpenTimes.phase1OpensAt,
      phase2_opens_at: phaseOpenTimes.phase2OpensAt,
      created_by: profile.id,
    }))
  )

  const { data: inserted, error: slotError } = await admin
    .from('practice_slots')
    .upsert(slotRows, { onConflict: 'teacher_id,slot_date,start_time', ignoreDuplicates: true })
    .select('id')

  if (slotError) {
    console.error('[practice] failed to create slots', slotError)
    await admin.from('practice_slot_blocks').delete().eq('id', blockId)
    return { error: '슬롯 생성에 실패했습니다.' }
  }

  revalidatePractice()
  return { success: true, createdCount: inserted?.length ?? 0 }
}

/** 블록 삭제. 예약이 없는 슬롯만 함께 지운다. */
export async function deletePracticeSlotBlockAction(payload: unknown): Promise<ActionResult> {
  const profile = await ensureManager()
  if (!profile) {
    return { error: '권한이 없습니다.' }
  }

  const parsed = deletePracticeSlotBlockSchema.safeParse(payload)
  if (!parsed.success) {
    return { error: '잘못된 요청입니다.' }
  }

  const admin = createAdminClient()

  const { data: slotRows, error: slotError } = await admin
    .from('practice_slots')
    .select('id, status')
    .eq('block_id', parsed.data.blockId)

  if (slotError) {
    console.error('[practice] failed to load block slots', slotError)
    return { error: '블록 정보를 불러오지 못했습니다.' }
  }

  const slots = (slotRows ?? []) as Array<{ id: string; status: string }>
  const bookedSlots = slots.filter((slot) => slot.status === 'booked')

  if (bookedSlots.length > 0) {
    return { error: `예약이 있는 슬롯이 ${bookedSlots.length}개 있습니다. 먼저 예약을 취소해주세요.` }
  }

  const { error: deleteSlotsError } = await admin
    .from('practice_slots')
    .delete()
    .eq('block_id', parsed.data.blockId)

  if (deleteSlotsError) {
    console.error('[practice] failed to delete block slots', deleteSlotsError)
    return { error: '슬롯 삭제에 실패했습니다.' }
  }

  const { error } = await admin.from('practice_slot_blocks').delete().eq('id', parsed.data.blockId)

  if (error) {
    console.error('[practice] failed to delete block', error)
    return { error: '블록 삭제에 실패했습니다.' }
  }

  revalidatePractice()
  return { success: true }
}

export async function updatePracticeSlotStatusAction(payload: unknown): Promise<ActionResult> {
  const profile = await ensureManager()
  if (!profile) {
    return { error: '권한이 없습니다.' }
  }

  const parsed = updatePracticeSlotStatusSchema.safeParse(payload)
  if (!parsed.success) {
    return { error: '잘못된 요청입니다.' }
  }

  const admin = createAdminClient()

  if (parsed.data.status === 'closed' || parsed.data.status === 'break') {
    const { count, error: countError } = await admin
      .from('practice_bookings')
      .select('id', { count: 'exact', head: true })
      .eq('slot_id', parsed.data.slotId)
      .eq('status', 'reserved')

    if (countError) {
      console.error('[practice] failed to check slot bookings', countError)
      return { error: '슬롯 상태를 확인하지 못했습니다.' }
    }
    if ((count ?? 0) > 0) {
      return { error: '예약이 있는 슬롯은 닫거나 쉬는 시간으로 바꿀 수 없습니다.' }
    }
  }

  const { error } = await admin
    .from('practice_slots')
    .update({ status: parsed.data.status })
    .eq('id', parsed.data.slotId)

  if (error) {
    console.error('[practice] failed to update slot status', error)
    return { error: '슬롯 상태 변경에 실패했습니다.' }
  }

  revalidatePractice()
  return { success: true }
}

export async function deletePracticeSlotAction(payload: unknown): Promise<ActionResult> {
  const profile = await ensureManager()
  if (!profile) {
    return { error: '권한이 없습니다.' }
  }

  const parsed = deletePracticeSlotSchema.safeParse(payload)
  if (!parsed.success) {
    return { error: '잘못된 요청입니다.' }
  }

  const admin = createAdminClient()

  const { count, error: countError } = await admin
    .from('practice_bookings')
    .select('id', { count: 'exact', head: true })
    .eq('slot_id', parsed.data.slotId)
    .eq('status', 'reserved')

  if (countError) {
    console.error('[practice] failed to check slot bookings', countError)
    return { error: '슬롯 상태를 확인하지 못했습니다.' }
  }
  if ((count ?? 0) > 0) {
    return { error: '예약이 있는 슬롯은 삭제할 수 없습니다.' }
  }

  const { error } = await admin.from('practice_slots').delete().eq('id', parsed.data.slotId)

  if (error) {
    console.error('[practice] failed to delete slot', error)
    return { error: '슬롯 삭제에 실패했습니다.' }
  }

  revalidatePractice()
  return { success: true }
}

/** 진행 완료 / 노쇼 처리 */
export async function updatePracticeBookingStatusAction(payload: unknown): Promise<ActionResult> {
  const { profile } = await getAuthContext()
  if (!profile || !['teacher', 'manager', 'principal'].includes(profile.role)) {
    return { error: '권한이 없습니다.' }
  }

  const parsed = updatePracticeBookingStatusSchema.safeParse(payload)
  if (!parsed.success) {
    return { error: '잘못된 요청입니다.' }
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('practice_bookings')
    .update({ status: parsed.data.status })
    .eq('id', parsed.data.bookingId)

  if (error) {
    console.error('[practice] failed to update booking status', error)
    return { error: '예약 상태 변경에 실패했습니다.' }
  }

  if (parsed.data.status === 'no_show') {
    await admin
      .from('practice_attempts')
      .update({ status: 'missed' })
      .eq('booking_id', parsed.data.bookingId)
      .is('submitted_at', null)
  }

  revalidatePractice()
  return { success: true }
}
