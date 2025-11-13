import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { createAdminClient } from '@/lib/supabase/admin'
import { sendEnrollmentApplicationConfirmationSMS } from '@/lib/solapi'

const classEnum = z.enum(['weekday', 'saturday', 'sunday', 'regular', 'online'])

const applicationSchema = z
  .object({
    studentName: z.string().trim().min(1, '학생 이름을 입력해주세요.'),
    parentPhone: z
      .string()
      .trim()
      .transform((value) => value.replace(/\D/g, ''))
      .refine((value) => /^01[0-9]{8,9}$/.test(value), {
        message: '휴대폰 번호는 010으로 시작하는 숫자만 입력해주세요.',
      }),
    studentPhone: z
      .string()
      .trim()
      .optional()
      .transform((value) => (value ? value.replace(/\D/g, '') : ''))
      .refine((value) => !value || /^01[0-9]{8,9}$/.test(value), {
        message: '학생 연락처는 010으로 시작하는 숫자만 입력해주세요.',
      }),
    desiredClass: classEnum,
    saturdayBriefing: z.enum(['yes', 'no']).optional(),
    scheduleFeeConfirmed: z.enum(['confirmed', 'unconfirmed']),
  })
  .superRefine((value, ctx) => {
    if (value.desiredClass === 'saturday' && !value.saturdayBriefing) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '토요반 안내 여부를 선택해주세요.',
        path: ['saturdayBriefing'],
      })
    }
  })

export async function POST(request: Request) {
  try {
    const json = await request.json().catch(() => null)
    const parsed = applicationSchema.safeParse(json)

    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      return NextResponse.json({ error: issue?.message ?? '입력값을 확인해주세요.' }, { status: 400 })
    }

    const {
      studentName,
      parentPhone,
      studentPhone,
      desiredClass,
      saturdayBriefing,
      scheduleFeeConfirmed,
    } =
      parsed.data

    const supabase = createAdminClient()
    const { error } = await supabase.from('enrollment_applications').insert({
      student_name: studentName.trim(),
      parent_phone: parentPhone,
      student_phone: studentPhone ? studentPhone : null,
      desired_class: desiredClass,
      saturday_briefing_received:
        desiredClass === 'saturday' ? saturdayBriefing === 'yes' : null,
      schedule_fee_confirmed: scheduleFeeConfirmed === 'confirmed',
    })

    if (error) {
      console.error('[enrollment] insert application error', error)
      return NextResponse.json({ error: '등록원서를 저장하지 못했습니다.' }, { status: 500 })
    }

    revalidatePath('/dashboard/manager/enrollment')

    const classLabelMap: Record<typeof desiredClass, string> = {
      weekday: '평일반',
      saturday: '토요반',
      sunday: '일요반',
      regular: '정시반',
      online: '온라인반',
    }

    const desiredClassLabel = classLabelMap[desiredClass] ?? desiredClass

    const recipients = new Set<string>([parentPhone])
    if (studentPhone) {
      recipients.add(studentPhone)
    }

    const smsTasks = Array.from(recipients).map((phoneNumber) =>
      sendEnrollmentApplicationConfirmationSMS({
        phoneNumber,
        studentName,
        desiredClassLabel,
      })
    )

    try {
      await Promise.allSettled(smsTasks)
    } catch (smsError) {
      console.error('[enrollment] application sms send error', smsError)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[enrollment] application api unexpected error', error)
    return NextResponse.json({ error: '등록 처리 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
