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

