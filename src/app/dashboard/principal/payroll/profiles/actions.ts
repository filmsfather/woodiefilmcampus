'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { getAuthContext } from '@/lib/auth'
import {
  savePayrollProfile,
  setPayrollProfileEffectiveTo,
  type SavePayrollProfileInput,
} from '@/lib/payroll/profile-service'

const profileSchema = z
  .object({
    profileId: z
      .string()
      .optional()
      .transform((value) => (value && value.length > 0 ? value : null)),
    teacherId: z.string().uuid('선생님을 선택해주세요.'),
    hourlyRate: z.coerce.number().min(0, '시급은 0 이상으로 입력해주세요.'),
    baseSalaryAmount: z
      .string()
      .optional()
      .transform((value) => {
        if (!value) {
          return null
        }
        const parsed = Number.parseFloat(value)
        return Number.isNaN(parsed) ? Number.NaN : parsed
      }),
    contractType: z.enum(['employee', 'freelancer', 'none'] as const),
    insuranceEnrolled: z
      .enum(['true', 'false'] as const)
      .transform((value) => value === 'true'),
    effectiveFrom: z
      .string()
      .refine((value) => /^\d{4}-\d{2}-\d{2}$/.test(value), '적용 시작일을 YYYY-MM-DD 형식으로 입력해주세요.'),
    effectiveTo: z
      .string()
      .optional()
      .transform((value) => {
        if (!value) {
          return null
        }
        return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null
      }),
    notes: z
      .string()
      .optional()
      .transform((value) => {
        if (!value) {
          return null
        }
        const trimmed = value.trim()
        return trimmed.length > 0 ? trimmed : null
      }),
  })
  .superRefine((value, ctx) => {
    if (typeof value.baseSalaryAmount === 'number' && Number.isNaN(value.baseSalaryAmount)) {
      ctx.addIssue({
        path: ['baseSalaryAmount'],
        code: z.ZodIssueCode.custom,
        message: '기본급은 숫자로 입력해주세요.',
      })
    }
    if (value.effectiveTo && value.effectiveTo < value.effectiveFrom) {
      ctx.addIssue({
        path: ['effectiveTo'],
        code: z.ZodIssueCode.custom,
        message: '종료일은 시작일 이후여야 합니다.',
      })
    }
  })

const archiveSchema = z.object({
  profileId: z.string().uuid('프로필 ID가 올바르지 않습니다.'),
  effectiveTo: z
    .string()
    .optional()
    .transform((value) => {
      if (!value) {
        return null
      }
      return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null
    }),
})

function toSaveInput(parsed: z.infer<typeof profileSchema>): SavePayrollProfileInput {
  return {
    profileId: parsed.profileId,
    teacherId: parsed.teacherId,
    hourlyRate: parsed.hourlyRate,
    baseSalaryAmount:
      typeof parsed.baseSalaryAmount === 'number' && !Number.isNaN(parsed.baseSalaryAmount)
        ? parsed.baseSalaryAmount
        : null,
    contractType: parsed.contractType,
    insuranceEnrolled: parsed.insuranceEnrolled,
    effectiveFrom: parsed.effectiveFrom,
    effectiveTo: parsed.effectiveTo,
    notes: parsed.notes,
  }
}

function revalidatePayrollPages() {
  revalidatePath('/dashboard/principal/payroll')
  revalidatePath('/dashboard/principal/payroll/profiles')
}

export async function savePayrollProfileAction(formData: FormData) {
  const { profile } = await getAuthContext()

  if (!profile || profile.role !== 'principal') {
    return { error: '급여 프로필을 관리할 권한이 없습니다.' }
  }

  const parsed = profileSchema.safeParse(Object.fromEntries(formData.entries()))

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]
    return { error: firstIssue?.message ?? '입력한 정보를 다시 확인해주세요.' }
  }

  try {
    const result = await savePayrollProfile(toSaveInput(parsed.data), profile.id)
    revalidatePayrollPages()
    return { success: true, profileId: result.profile.id }
  } catch (error) {
    console.error('[payroll] save profile action error', error)
    return { error: '급여 프로필을 저장하지 못했습니다.' }
  }
}

export async function archivePayrollProfileAction(formData: FormData) {
  const { profile } = await getAuthContext()

  if (!profile || profile.role !== 'principal') {
    return { error: '급여 프로필을 수정할 권한이 없습니다.' }
  }

  const parsed = archiveSchema.safeParse(Object.fromEntries(formData.entries()))

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]
    return { error: firstIssue?.message ?? '종료일 정보를 확인해주세요.' }
  }

  try {
    const updated = await setPayrollProfileEffectiveTo(parsed.data.profileId, parsed.data.effectiveTo)
    if (!updated) {
      return { error: '지정한 급여 프로필을 찾을 수 없습니다.' }
    }
    revalidatePayrollPages()
    return { success: true }
  } catch (error) {
    console.error('[payroll] archive profile action error', error)
    return { error: '급여 프로필 종료 처리에 실패했습니다.' }
  }
}
