'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { getAuthContext } from '@/lib/auth'
import type { EquipmentSetType, EquipmentSlotStatus } from '@/lib/equipment-rental'
import { createAdminClient } from '@/lib/supabase/admin'

const TEACHER_ROLES = new Set(['teacher', 'manager', 'principal'])

async function requireTeacherProfile() {
  const { profile } = await getAuthContext()

  if (!profile || !TEACHER_ROLES.has(profile.role)) {
    throw new Error('선생님 권한이 필요합니다.')
  }

  return profile
}

const setTypeEnum: [EquipmentSetType, EquipmentSetType] = ['set_a', 'set_b']
const slotStatusEnum: [EquipmentSlotStatus, EquipmentSlotStatus, EquipmentSlotStatus] = [
  'open',
  'reserved',
  'closed',
]

// 슬롯 오픈/생성
const openSlotSchema = z.object({
  slotDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, '유효한 날짜를 선택해주세요.'),
  setType: z.enum(setTypeEnum),
})

export async function openEquipmentSlot(payload: unknown) {
  const teacher = await requireTeacherProfile()

  const parsed = openSlotSchema.safeParse(payload)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return { error: issue?.message ?? '입력값을 다시 확인해주세요.' }
  }

  const { slotDate, setType } = parsed.data
  const supabase = createAdminClient()

  const { error } = await supabase.from('equipment_slots').upsert(
    {
      slot_date: slotDate,
      set_type: setType,
      status: 'open' as EquipmentSlotStatus,
      created_by: teacher.id,
      updated_by: teacher.id,
    },
    { onConflict: 'slot_date,set_type', ignoreDuplicates: false }
  )

  if (error) {
    console.error('[equipment] open slot error', error)
    return { error: '예약 슬롯을 생성하지 못했습니다.' }
  }

  revalidatePath('/dashboard/teacher/film-production')
  revalidatePath('/dashboard/student/equipment-rental')
  return { success: true as const }
}

// 슬롯 상태 변경 (닫기/다시열기)
const updateSlotStatusSchema = z.object({
  slotId: z.string().uuid('유효한 슬롯 ID가 아닙니다.'),
  status: z.enum(slotStatusEnum),
})

export async function updateEquipmentSlotStatus(payload: unknown) {
  const teacher = await requireTeacherProfile()
  const parsed = updateSlotStatusSchema.safeParse(payload)

  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return { error: issue?.message ?? '요청 정보를 확인해주세요.' }
  }

  const { slotId, status } = parsed.data
  const supabase = createAdminClient()

  // 예약된 슬롯은 닫기 불가
  const { data: rental, error: rentalError } = await supabase
    .from('equipment_rentals')
    .select('id, status')
    .eq('slot_id', slotId)
    .in('status', ['pending', 'rented'])
    .maybeSingle()

  if (rentalError) {
    console.error('[equipment] fetch rental error', rentalError)
    return { error: '대여 상태를 확인하지 못했습니다.' }
  }

  if (rental && status === 'closed') {
    return { error: '활성 대여가 있는 슬롯은 닫을 수 없습니다.' }
  }

  const { error } = await supabase
    .from('equipment_slots')
    .update({ status, updated_by: teacher.id })
    .eq('id', slotId)

  if (error) {
    console.error('[equipment] update slot status error', error)
    return { error: '슬롯 상태를 변경하지 못했습니다.' }
  }

  revalidatePath('/dashboard/teacher/film-production')
  revalidatePath('/dashboard/student/equipment-rental')
  return { success: true as const }
}

// 일괄 슬롯 오픈
const batchOpenSlotsSchema = z.object({
  dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/u)).min(1, '날짜를 선택해주세요.'),
  setTypes: z.array(z.enum(setTypeEnum)).min(1, '세트를 선택해주세요.'),
})

export async function batchOpenEquipmentSlots(payload: unknown) {
  const teacher = await requireTeacherProfile()

  const parsed = batchOpenSlotsSchema.safeParse(payload)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return { error: issue?.message ?? '입력값을 다시 확인해주세요.' }
  }

  const { dates, setTypes } = parsed.data
  const supabase = createAdminClient()

  // 모든 날짜 x 세트 타입 조합 생성
  const records = dates.flatMap((date) =>
    setTypes.map((setType) => ({
      slot_date: date,
      set_type: setType,
      status: 'open' as EquipmentSlotStatus,
      created_by: teacher.id,
      updated_by: teacher.id,
    }))
  )

  const { error } = await supabase
    .from('equipment_slots')
    .upsert(records, { onConflict: 'slot_date,set_type', ignoreDuplicates: true })

  if (error) {
    console.error('[equipment] batch open slots error', error)
    return { error: '슬롯을 일괄 생성하지 못했습니다.' }
  }

  revalidatePath('/dashboard/teacher/film-production')
  revalidatePath('/dashboard/student/equipment-rental')
  return { success: true as const, count: records.length }
}

// 슬롯 삭제
const deleteSlotSchema = z.object({
  slotId: z.string().uuid('유효한 슬롯 ID가 아닙니다.'),
})

export async function deleteEquipmentSlot(payload: unknown) {
  await requireTeacherProfile()
  const parsed = deleteSlotSchema.safeParse(payload)

  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return { error: issue?.message ?? '삭제할 슬롯을 확인해주세요.' }
  }

  const { slotId } = parsed.data
  const supabase = createAdminClient()

  // 활성 대여가 있는지 확인
  const { data: rental } = await supabase
    .from('equipment_rentals')
    .select('id')
    .eq('slot_id', slotId)
    .in('status', ['pending', 'rented'])
    .maybeSingle()

  if (rental) {
    return { error: '활성 대여가 있는 슬롯은 삭제할 수 없습니다.' }
  }

  const { error } = await supabase.from('equipment_slots').delete().eq('id', slotId)

  if (error) {
    console.error('[equipment] delete slot error', error)
    return { error: '슬롯을 삭제하지 못했습니다.' }
  }

  revalidatePath('/dashboard/teacher/film-production')
  revalidatePath('/dashboard/student/equipment-rental')
  return { success: true as const }
}

// 예약 취소 (선생님이 학생 예약 취소)
const cancelRentalSchema = z.object({
  rentalId: z.string().uuid('유효한 예약 ID가 아닙니다.'),
})

export async function cancelEquipmentRental(payload: unknown) {
  const teacher = await requireTeacherProfile()
  const parsed = cancelRentalSchema.safeParse(payload)

  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return { error: issue?.message ?? '취소할 예약을 확인해주세요.' }
  }

  const { rentalId } = parsed.data
  const supabase = createAdminClient()

  // 예약 정보 조회
  const { data: rental, error: fetchError } = await supabase
    .from('equipment_rentals')
    .select('id, slot_id, status')
    .eq('id', rentalId)
    .single()

  if (fetchError || !rental) {
    console.error('[equipment] fetch rental error', fetchError)
    return { error: '예약 정보를 찾을 수 없습니다.' }
  }

  // 이미 반납 완료된 예약은 취소 불가
  if (rental.status === 'returned') {
    return { error: '이미 반납 완료된 예약은 취소할 수 없습니다.' }
  }

  // 예약 삭제
  const { error: deleteError } = await supabase
    .from('equipment_rentals')
    .delete()
    .eq('id', rentalId)

  if (deleteError) {
    console.error('[equipment] delete rental error', deleteError)
    return { error: '예약을 취소하지 못했습니다.' }
  }

  // 슬롯을 다시 'open' 상태로 변경
  const { error: updateError } = await supabase
    .from('equipment_slots')
    .update({ status: 'open' as EquipmentSlotStatus, updated_by: teacher.id })
    .eq('id', rental.slot_id)

  if (updateError) {
    console.error('[equipment] update slot status after cancel error', updateError)
    // 예약은 이미 삭제됨, 슬롯 상태만 실패 - 에러 로그만 남김
  }

  revalidatePath('/dashboard/teacher/film-production')
  revalidatePath('/dashboard/student/equipment-rental')
  return { success: true as const }
}

// 예약 메모 수정 (선생님이 학생 예약 메모 수정)
const updateRentalMemoSchema = z.object({
  rentalId: z.string().uuid('유효한 예약 ID가 아닙니다.'),
  memo: z.string().max(200, '메모는 200자 이내로 입력해주세요.').nullable(),
})

export async function updateEquipmentRentalMemo(payload: unknown) {
  await requireTeacherProfile()
  const parsed = updateRentalMemoSchema.safeParse(payload)

  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return { error: issue?.message ?? '수정할 내용을 확인해주세요.' }
  }

  const { rentalId, memo } = parsed.data
  const supabase = createAdminClient()

  const { error } = await supabase
    .from('equipment_rentals')
    .update({ memo })
    .eq('id', rentalId)

  if (error) {
    console.error('[equipment] update rental memo error', error)
    return { error: '메모를 수정하지 못했습니다.' }
  }

  revalidatePath('/dashboard/teacher/film-production')
  revalidatePath('/dashboard/student/equipment-rental')
  return { success: true as const }
}

