'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { getAuthContext } from '@/lib/auth'
import type { EquipmentRentalStatus } from '@/lib/equipment-rental'
import { createAdminClient } from '@/lib/supabase/admin'

async function requireStudentProfile() {
  const { profile } = await getAuthContext()

  if (!profile || profile.role !== 'student') {
    throw new Error('학생 권한이 필요합니다.')
  }

  return profile
}

// 예약 생성 (세트 선택)
const createRentalSchema = z.object({
  slotId: z.string().uuid('유효한 슬롯 ID가 아닙니다.'),
  classId: z.string().uuid('유효한 반 ID가 아닙니다.').nullable().optional(),
  memo: z.string().trim().max(500).optional(),
})

export async function createEquipmentRental(payload: unknown) {
  const student = await requireStudentProfile()

  const parsed = createRentalSchema.safeParse(payload)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return { error: issue?.message ?? '입력값을 다시 확인해주세요.' }
  }

  const { slotId, classId, memo } = parsed.data
  const supabase = createAdminClient()

  // 슬롯 확인
  const { data: slot, error: slotError } = await supabase
    .from('equipment_slots')
    .select('id, status')
    .eq('id', slotId)
    .maybeSingle()

  if (slotError) {
    console.error('[equipment] fetch slot error', slotError)
    return { error: '슬롯 정보를 확인하지 못했습니다.' }
  }

  if (!slot) {
    return { error: '존재하지 않는 예약 슬롯입니다.' }
  }

  if (slot.status !== 'open') {
    return { error: '이미 예약되었거나 닫힌 슬롯입니다.' }
  }

  // 이미 해당 슬롯에 대여가 있는지 확인
  const { data: existingRental } = await supabase
    .from('equipment_rentals')
    .select('id')
    .eq('slot_id', slotId)
    .in('status', ['pending', 'rented'])
    .maybeSingle()

  if (existingRental) {
    return { error: '이미 예약된 슬롯입니다.' }
  }

  // 대여 생성
  const { data: rental, error: insertError } = await supabase
    .from('equipment_rentals')
    .insert({
      slot_id: slotId,
      student_id: student.id,
      class_id: classId ?? null,
      memo: memo ?? null,
      status: 'pending' as EquipmentRentalStatus,
    })
    .select('id')
    .single()

  if (insertError) {
    console.error('[equipment] create rental error', insertError)
    return { error: '예약을 생성하지 못했습니다.' }
  }

  // 슬롯 상태 변경
  await supabase.from('equipment_slots').update({ status: 'reserved' }).eq('id', slotId)

  revalidatePath('/dashboard/teacher/film-production')
  revalidatePath('/dashboard/student/equipment-rental')

  return { success: true as const, rentalId: rental.id }
}

// 메모 업데이트 (포커스 아웃 시 자동 저장)
const updateMemoSchema = z.object({
  rentalId: z.string().uuid('유효한 대여 ID가 아닙니다.'),
  memo: z.string().trim().max(500).nullable(),
})

export async function updateRentalMemo(payload: unknown) {
  const student = await requireStudentProfile()

  const parsed = updateMemoSchema.safeParse(payload)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return { error: issue?.message ?? '메모를 확인해주세요.' }
  }

  const { rentalId, memo } = parsed.data
  const supabase = createAdminClient()

  const { error } = await supabase
    .from('equipment_rentals')
    .update({ memo: memo ?? null })
    .eq('id', rentalId)
    .eq('student_id', student.id)

  if (error) {
    console.error('[equipment] update memo error', error)
    return { error: '메모를 저장하지 못했습니다.' }
  }

  return { success: true as const }
}

// 대여 완료 (사진 경로 저장 후 상태 변경)
const completeCheckoutSchema = z.object({
  rentalId: z.string().uuid('유효한 대여 ID가 아닙니다.'),
  photoPath: z.string().min(1, '사진 경로가 필요합니다.'),
})

export async function completeCheckout(payload: unknown) {
  const student = await requireStudentProfile()

  const parsed = completeCheckoutSchema.safeParse(payload)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return { error: issue?.message ?? '입력값을 확인해주세요.' }
  }

  const { rentalId, photoPath } = parsed.data
  const supabase = createAdminClient()

  // 본인 대여인지 확인
  const { data: rental, error: fetchError } = await supabase
    .from('equipment_rentals')
    .select('id, status')
    .eq('id', rentalId)
    .eq('student_id', student.id)
    .maybeSingle()

  if (fetchError || !rental) {
    return { error: '대여 정보를 찾을 수 없습니다.' }
  }

  if (rental.status !== 'pending') {
    return { error: '대여 대기 상태에서만 대여 완료할 수 있습니다.' }
  }

  const { error } = await supabase
    .from('equipment_rentals')
    .update({
      checkout_photo_path: photoPath,
      status: 'rented' as EquipmentRentalStatus,
      checked_out_at: new Date().toISOString(),
    })
    .eq('id', rentalId)
    .eq('student_id', student.id)

  if (error) {
    console.error('[equipment] complete checkout error', error)
    return { error: '대여 완료 처리에 실패했습니다.' }
  }

  revalidatePath('/dashboard/teacher/film-production')
  revalidatePath('/dashboard/student/equipment-rental')
  revalidatePath(`/dashboard/student/equipment-rental/${rentalId}`)

  return { success: true as const }
}

// 반납 완료 (사진 경로 저장 후 상태 변경)
const completeReturnSchema = z.object({
  rentalId: z.string().uuid('유효한 대여 ID가 아닙니다.'),
  photoPath: z.string().min(1, '사진 경로가 필요합니다.'),
})

export async function completeReturn(payload: unknown) {
  const student = await requireStudentProfile()

  const parsed = completeReturnSchema.safeParse(payload)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return { error: issue?.message ?? '입력값을 확인해주세요.' }
  }

  const { rentalId, photoPath } = parsed.data
  const supabase = createAdminClient()

  // 본인 대여인지 확인
  const { data: rental, error: fetchError } = await supabase
    .from('equipment_rentals')
    .select('id, status, slot_id')
    .eq('id', rentalId)
    .eq('student_id', student.id)
    .maybeSingle()

  if (fetchError || !rental) {
    return { error: '대여 정보를 찾을 수 없습니다.' }
  }

  if (rental.status !== 'rented') {
    return { error: '대여 중인 상태에서만 반납할 수 있습니다.' }
  }

  const { error } = await supabase
    .from('equipment_rentals')
    .update({
      return_photo_path: photoPath,
      status: 'returned' as EquipmentRentalStatus,
      returned_at: new Date().toISOString(),
    })
    .eq('id', rentalId)
    .eq('student_id', student.id)

  if (error) {
    console.error('[equipment] complete return error', error)
    return { error: '반납 처리에 실패했습니다.' }
  }

  // 슬롯 상태를 open으로 되돌리기 (재사용 가능하게)
  await supabase.from('equipment_slots').update({ status: 'open' }).eq('id', rental.slot_id)

  revalidatePath('/dashboard/teacher/film-production')
  revalidatePath('/dashboard/student/equipment-rental')
  revalidatePath(`/dashboard/student/equipment-rental/${rentalId}`)

  return { success: true as const }
}

