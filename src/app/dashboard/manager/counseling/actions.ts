'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { requireManagerProfile } from '@/lib/authz'
import {
  COUNSELING_SLOT_INTERVAL_MINUTES,
  CounselingReservationStatus,
  CounselingSlotStatus,
  generateQuestionFieldKey,
  toPgTime,
} from '@/lib/counseling'
import { createAdminClient } from '@/lib/supabase/admin'

const slotStatusEnum: [CounselingSlotStatus, CounselingSlotStatus, CounselingSlotStatus] = [
  'open',
  'booked',
  'closed',
]

const reservationStatusEnum: [CounselingReservationStatus, CounselingReservationStatus, CounselingReservationStatus] = [
  'confirmed',
  'completed',
  'canceled',
]

const createSlotsSchema = z.object({
  counselingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, '유효한 날짜를 선택해주세요.'),
  times: z.array(z.string()).min(1, '예약 가능 시간을 선택해주세요.'),
  notes: z.string().trim().max(500).optional(),
})

export async function createCounselingSlots(payload: unknown) {
  const manager = await requireManagerProfile()

  const parsed = createSlotsSchema.safeParse(payload)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return { error: issue?.message ?? '입력값을 다시 확인해주세요.' }
  }

  const { counselingDate, times, notes } = parsed.data
  const supabase = createAdminClient()

  const records = times.map((time) => ({
    counseling_date: counselingDate,
    start_time: toPgTime(time),
    duration_minutes: COUNSELING_SLOT_INTERVAL_MINUTES,
    status: 'open' as CounselingSlotStatus,
    notes: notes ?? null,
    created_by: manager.id,
    updated_by: manager.id,
  }))

  const { error } = await supabase
    .from('counseling_slots')
    .upsert(records, { onConflict: 'counseling_date,start_time', ignoreDuplicates: true })

  if (error) {
    console.error('[counseling] create slots error', error)
    return { error: '예약 가능 시간을 저장하지 못했습니다.' }
  }

  revalidatePath('/counseling/reserve')
  revalidatePath('/dashboard/manager/counseling/slots')
  revalidatePath('/dashboard/manager/counseling/reservations')
  return { success: true as const }
}

const updateSlotStatusSchema = z.object({
  slotId: z.string().uuid('유효한 슬롯 ID가 아닙니다.'),
  status: z.enum(slotStatusEnum),
})

export async function updateCounselingSlotStatus(payload: unknown) {
  const manager = await requireManagerProfile()
  const parsed = updateSlotStatusSchema.safeParse(payload)

  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return { error: issue?.message ?? '요청 정보를 확인해주세요.' }
  }

  const { slotId, status } = parsed.data
  const supabase = createAdminClient()

  const { data: reservation, error: reservationError } = await supabase
    .from('counseling_reservations')
    .select('id, status')
    .eq('slot_id', slotId)
    .eq('status', 'confirmed')
    .maybeSingle()

  if (reservationError) {
    console.error('[counseling] fetch reservation error', reservationError)
    return { error: '예약 상태를 확인하지 못했습니다.' }
  }

  if (reservation && status === 'open') {
    return { error: '이미 예약된 시간입니다. 상담 예약을 취소한 뒤 다시 열어주세요.' }
  }

  if (reservation && status === 'closed') {
    return { error: '예약이 확정된 시간은 닫을 수 없습니다.' }
  }

  const { error } = await supabase
    .from('counseling_slots')
    .update({ status, updated_by: manager.id })
    .eq('id', slotId)

  if (error) {
    console.error('[counseling] update slot status error', error)
    return { error: '슬롯 상태를 변경하지 못했습니다.' }
  }

  revalidatePath('/counseling/reserve')
  revalidatePath('/dashboard/manager/counseling/slots')
  revalidatePath('/dashboard/manager/counseling/reservations')
  return { success: true as const }
}

const deleteSlotSchema = z.object({
  slotId: z.string().uuid('유효한 슬롯 ID가 아닙니다.'),
})

export async function deleteCounselingSlot(payload: unknown) {
  await requireManagerProfile()
  const parsed = deleteSlotSchema.safeParse(payload)

  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return { error: issue?.message ?? '삭제할 슬롯을 확인해주세요.' }
  }

  const { slotId } = parsed.data
  const supabase = createAdminClient()

  const { data: reservation } = await supabase
    .from('counseling_reservations')
    .select('id')
    .eq('slot_id', slotId)
    .eq('status', 'confirmed')
    .maybeSingle()

  if (reservation) {
    return { error: '확정된 예약이 있는 시간은 삭제할 수 없습니다.' }
  }

  const { error } = await supabase
    .from('counseling_slots')
    .delete()
    .eq('id', slotId)

  if (error) {
    console.error('[counseling] delete slot error', error)
    return { error: '슬롯을 삭제하지 못했습니다.' }
  }

  revalidatePath('/counseling/reserve')
  revalidatePath('/dashboard/manager/counseling/slots')
  return { success: true as const }
}

const updateSlotNotesSchema = z.object({
  slotId: z.string().uuid(),
  notes: z.string().trim().max(500).nullable(),
})

export async function updateCounselingSlotNotes(payload: unknown) {
  const manager = await requireManagerProfile()
  const parsed = updateSlotNotesSchema.safeParse(payload)

  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return { error: issue?.message ?? '메모를 확인해주세요.' }
  }

  const { slotId, notes } = parsed.data
  const supabase = createAdminClient()

  const { error } = await supabase
    .from('counseling_slots')
    .update({ notes, updated_by: manager.id })
    .eq('id', slotId)

  if (error) {
    console.error('[counseling] update slot notes error', error)
    return { error: '메모를 저장하지 못했습니다.' }
  }

  revalidatePath('/dashboard/manager/counseling/slots')
  return { success: true as const }
}

const updateReservationStatusSchema = z.object({
  reservationId: z.string().uuid('유효한 예약 ID가 아닙니다.'),
  status: z.enum(reservationStatusEnum),
})

export async function updateCounselingReservationStatus(payload: unknown) {
  const manager = await requireManagerProfile()
  const parsed = updateReservationStatusSchema.safeParse(payload)

  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return { error: issue?.message ?? '예약 상태를 다시 확인해주세요.' }
  }

  const { reservationId, status } = parsed.data
  const supabase = createAdminClient()

  const { data: reservation, error: fetchError } = await supabase
    .from('counseling_reservations')
    .select('id, slot_id')
    .eq('id', reservationId)
    .maybeSingle()

  if (fetchError) {
    console.error('[counseling] reservation fetch error', fetchError)
    return { error: '예약 정보를 불러오지 못했습니다.' }
  }

  if (!reservation) {
    return { error: '존재하지 않는 예약입니다.' }
  }

  const now = new Date().toISOString()
  const { error: updateError } = await supabase
    .from('counseling_reservations')
    .update({
      status,
      managed_by: manager.id,
      managed_at: now,
      updated_at: now,
    })
    .eq('id', reservationId)

  if (updateError) {
    console.error('[counseling] update reservation status error', updateError)
    return { error: '예약 상태를 업데이트하지 못했습니다.' }
  }

  if (status === 'canceled') {
    await supabase
      .from('counseling_slots')
      .update({ status: 'open', updated_by: manager.id })
      .eq('id', reservation.slot_id)
  } else if (status === 'confirmed' || status === 'completed') {
    await supabase
      .from('counseling_slots')
      .update({ status: 'booked', updated_by: manager.id })
      .eq('id', reservation.slot_id)
  }

  revalidatePath('/counseling/reserve')
  revalidatePath('/dashboard/manager/counseling/slots')
  revalidatePath('/dashboard/manager/counseling/reservations')
  return { success: true as const }
}

const updateReservationMemoSchema = z.object({
  reservationId: z.string().uuid('유효한 예약 ID가 아닙니다.'),
  memo: z.string().trim().max(1000).optional(),
})

export async function updateCounselingReservationMemo(payload: unknown) {
  const manager = await requireManagerProfile()
  const parsed = updateReservationMemoSchema.safeParse(payload)

  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return { error: issue?.message ?? '메모 내용을 확인해주세요.' }
  }

  const { reservationId, memo } = parsed.data
  const supabase = createAdminClient()

  const { error } = await supabase
    .from('counseling_reservations')
    .update({ memo: memo ?? null, managed_by: manager.id, managed_at: new Date().toISOString() })
    .eq('id', reservationId)

  if (error) {
    console.error('[counseling] update reservation memo error', error)
    return { error: '메모를 저장하지 못했습니다.' }
  }

  revalidatePath('/dashboard/manager/counseling/reservations')
  return { success: true as const }
}

const createQuestionSchema = z.object({
  prompt: z.string().trim().min(1, '질문 내용을 입력해주세요.').max(200),
  fieldType: z.enum(['text', 'textarea']).default('text'),
  isRequired: z.boolean().default(false),
})

export async function createCounselingQuestion(input: unknown) {
  const manager = await requireManagerProfile()
  const parsed = createQuestionSchema.safeParse(input)

  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return { error: issue?.message ?? '질문 정보를 확인해주세요.' }
  }

  const { prompt, fieldType, isRequired } = parsed.data
  const supabase = createAdminClient()

  const { data: lastQuestion } = await supabase
    .from('counseling_questions')
    .select('position')
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()

  const position = (lastQuestion?.position ?? 0) + 10

  const { error } = await supabase
    .from('counseling_questions')
    .insert({
      prompt,
      field_type: fieldType,
      is_required: isRequired,
      field_key: generateQuestionFieldKey('question'),
      position,
      created_by: manager.id,
      updated_by: manager.id,
    })

  if (error) {
    console.error('[counseling] create question error', error)
    return { error: '질문을 추가하지 못했습니다.' }
  }

  revalidatePath('/counseling/reserve')
  revalidatePath('/dashboard/manager/counseling/questions')
  return { success: true as const }
}

const updateQuestionSchema = z.object({
  id: z.string().uuid('유효한 질문 ID가 아닙니다.'),
  prompt: z.string().trim().min(1, '질문 내용을 입력해주세요.').max(200),
  fieldType: z.enum(['text', 'textarea']).default('text'),
  isRequired: z.boolean().default(false),
  isActive: z.boolean().default(true),
})

export async function updateCounselingQuestion(payload: unknown) {
  const manager = await requireManagerProfile()
  const parsed = updateQuestionSchema.safeParse(payload)

  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return { error: issue?.message ?? '질문 정보를 확인해주세요.' }
  }

  const { id, prompt, isRequired, fieldType, isActive } = parsed.data
  const supabase = createAdminClient()

  const { error } = await supabase
    .from('counseling_questions')
    .update({
      prompt,
      is_required: isRequired,
      field_type: fieldType,
      is_active: isActive,
      updated_by: manager.id,
    })
    .eq('id', id)

  if (error) {
    console.error('[counseling] update question error', error)
    return { error: '질문을 수정하지 못했습니다.' }
  }

  revalidatePath('/counseling/reserve')
  revalidatePath('/dashboard/manager/counseling/questions')
  return { success: true as const }
}

const deleteQuestionSchema = z.object({
  id: z.string().uuid('유효한 질문 ID가 아닙니다.'),
})

export async function deleteCounselingQuestion(payload: unknown) {
  await requireManagerProfile()
  const parsed = deleteQuestionSchema.safeParse(payload)

  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return { error: issue?.message ?? '삭제할 질문을 확인해주세요.' }
  }

  const { id } = parsed.data
  const supabase = createAdminClient()

  const { error } = await supabase
    .from('counseling_questions')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('[counseling] delete question error', error)
    return { error: '질문을 삭제하지 못했습니다.' }
  }

  revalidatePath('/counseling/reserve')
  revalidatePath('/dashboard/manager/counseling/questions')
  return { success: true as const }
}

const reorderQuestionSchema = z.object({
  id: z.string().uuid('유효한 질문 ID가 아닙니다.'),
  direction: z.enum(['up', 'down']),
})

export async function moveCounselingQuestion(payload: unknown) {
  const manager = await requireManagerProfile()
  const parsed = reorderQuestionSchema.safeParse(payload)

  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return { error: issue?.message ?? '질문 순서를 확인해주세요.' }
  }

  const { id, direction } = parsed.data
  const supabase = createAdminClient()

  const { data: questions, error } = await supabase
    .from('counseling_questions')
    .select('id, position')
    .order('position', { ascending: true })

  if (error) {
    console.error('[counseling] fetch questions error', error)
    return { error: '질문 목록을 불러오지 못했습니다.' }
  }

  const index = questions.findIndex((q) => q.id === id)
  if (index < 0) {
    return { error: '질문을 찾을 수 없습니다.' }
  }

  const targetIndex = direction === 'up' ? index - 1 : index + 1
  if (targetIndex < 0 || targetIndex >= questions.length) {
    return { error: '더 이상 이동할 수 없습니다.' }
  }

  const current = questions[index]
  const target = questions[targetIndex]

  const updates = [
    { id: current.id, position: target.position, updated_by: manager.id },
    { id: target.id, position: current.position, updated_by: manager.id },
  ]

  const { error: updateError } = await supabase
    .from('counseling_questions')
    .upsert(updates)

  if (updateError) {
    console.error('[counseling] reorder questions error', updateError)
    return { error: '질문 순서를 변경하지 못했습니다.' }
  }

  revalidatePath('/counseling/reserve')
  revalidatePath('/dashboard/manager/counseling/questions')
  return { success: true as const }
}

const duplicateSlotSchema = z.object({
  sourceSlotId: z.string().uuid('유효한 슬롯 ID가 아닙니다.'),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, '유효한 날짜를 입력해주세요.'),
})

export async function duplicateCounselingSlot(payload: unknown) {
  const manager = await requireManagerProfile()
  const parsed = duplicateSlotSchema.safeParse(payload)

  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return { error: issue?.message ?? '복제할 슬롯 정보를 확인해주세요.' }
  }

  const { sourceSlotId, targetDate } = parsed.data
  const supabase = createAdminClient()

  const { data: source, error: fetchError } = await supabase
    .from('counseling_slots')
    .select('start_time, duration_minutes, notes')
    .eq('id', sourceSlotId)
    .maybeSingle()

  if (fetchError || !source) {
    console.error('[counseling] source slot fetch error', fetchError)
    return { error: '원본 슬롯을 찾을 수 없습니다.' }
  }

  const { error } = await supabase
    .from('counseling_slots')
    .upsert(
      {
        counseling_date: targetDate,
        start_time: source.start_time,
        duration_minutes: source.duration_minutes ?? COUNSELING_SLOT_INTERVAL_MINUTES,
        status: 'open',
        notes: source.notes ?? null,
        created_by: manager.id,
        updated_by: manager.id,
      },
      { onConflict: 'counseling_date,start_time', ignoreDuplicates: true }
    )

  if (error) {
    console.error('[counseling] duplicate slot error', error)
    return { error: '슬롯을 복제하지 못했습니다.' }
  }

  revalidatePath('/counseling/reserve')
  revalidatePath('/dashboard/manager/counseling/slots')
  return { success: true as const }
}
