
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { createAdminClient } from '@/lib/supabase/admin'
import { sendCounselingReservationConfirmationSMS } from '@/lib/solapi'

const reservationSchema = z.object({
  slotId: z.string().uuid('유효한 상담 슬롯이 아닙니다.'),
  studentName: z.string().trim().min(1, '학생 이름을 입력해주세요.'),
  contactPhone: z
    .string()
    .trim()
    .transform((value) => value.replace(/\D/g, ''))
    .refine((value) => /^01[0-9]{8,9}$/.test(value), {
      message: '휴대폰 번호는 010으로 시작하는 숫자만 입력해주세요.',
    }),
  academicRecord: z.string().trim().max(200).optional().nullable(),
  targetUniversity: z.string().trim().max(200).optional().nullable(),
  question: z.string().trim().max(500).optional().nullable(),
  additionalAnswers: z.record(z.string(), z.any()).optional().nullable(),
})

function normalizeAnswers(value: Record<string, unknown> | null | undefined) {
  if (!value) {
    return {}
  }
  const entries = Object.entries(value)
  return entries.reduce<Record<string, string>>((acc, [key, raw]) => {
    if (raw === undefined || raw === null) {
      return acc
    }
    acc[key] = String(raw)
    return acc
  }, {})
}

export async function POST(request: Request) {
  try {
    const payload = await request.json()
    const parsed = reservationSchema.safeParse(payload)

    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      return NextResponse.json({ error: issue?.message ?? '입력값을 확인해주세요.' }, { status: 400 })
    }

    const { slotId, studentName, contactPhone, academicRecord, targetUniversity, question, additionalAnswers } = parsed.data

    const supabase = createAdminClient()

    const { data: slot, error: slotError } = await supabase
      .from('counseling_slots')
      .select('id, status, counseling_date, start_time')
      .eq('id', slotId)
      .maybeSingle()

    if (slotError) {
      console.error('[counseling] fetch slot error', slotError)
      return NextResponse.json({ error: '상담 시간을 확인하지 못했습니다.' }, { status: 500 })
    }

    if (!slot) {
      return NextResponse.json({ error: '예약 가능한 시간이 없습니다.' }, { status: 400 })
    }

    if (slot.status !== 'open') {
      return NextResponse.json({ error: '이미 예약이 완료되었거나 닫힌 시간입니다.' }, { status: 400 })
    }

    const { data: existingReservation, error: existingError } = await supabase
      .from('counseling_reservations')
      .select('id')
      .eq('slot_id', slotId)
      .eq('status', 'confirmed')
      .maybeSingle()

    if (existingError) {
      console.error('[counseling] reservation check error', existingError)
      return NextResponse.json({ error: '예약 가능 여부를 확인하지 못했습니다.' }, { status: 500 })
    }

    if (existingReservation) {
      return NextResponse.json({ error: '이미 예약이 확정된 시간입니다.' }, { status: 400 })
    }

    const answers = normalizeAnswers(additionalAnswers ?? {})

    const { error: insertError } = await supabase
      .from('counseling_reservations')
      .insert({
        slot_id: slotId,
        student_name: studentName,
        contact_phone: contactPhone,
        academic_record: academicRecord ?? null,
        target_university: targetUniversity ?? null,
        question: question ?? null,
        additional_answers: answers,
        status: 'confirmed',
      })

    if (insertError) {
      console.error('[counseling] reservation insert error', insertError)
      return NextResponse.json({ error: '예약 신청을 저장하지 못했습니다.' }, { status: 500 })
    }

    const { error: updateError } = await supabase
      .from('counseling_slots')
      .update({ status: 'booked' })
      .eq('id', slotId)

    if (updateError) {
      console.error('[counseling] slot update error', updateError)
    }

    revalidatePath('/counseling/reserve')
    revalidatePath('/dashboard/manager/counseling/slots')
    revalidatePath('/dashboard/manager/counseling/reservations')

    if (slot?.start_time) {
      const smsResult = await sendCounselingReservationConfirmationSMS({
        phoneNumber: contactPhone,
        studentName,
        counselingDate: slot.counseling_date,
        startTime: slot.start_time,
      })

      if (!smsResult) {
        console.warn('[counseling] 예약 확인 문자 발송에 실패했습니다.', {
          slotId,
          contactPhone,
        })
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[counseling] reservation api unexpected error', error)
    return NextResponse.json({ error: '예약 신청 처리 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
