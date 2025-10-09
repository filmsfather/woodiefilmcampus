'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { getAuthContext } from '@/lib/auth'
import {
  WORK_LOG_ENTRY_SELECT_FIELDS,
  mapWorkLogRow,
  type WorkLogEntry,
  type WorkLogEntryRow,
  type WorkLogStatus,
  type WorkLogSubstituteType,
} from '@/lib/work-logs'
import { createClient as createServerSupabase } from '@/lib/supabase/server'

const WORK_LOG_STATUS_VALUES = ['work', 'substitute', 'absence', 'tardy'] as const satisfies readonly WorkLogStatus[]
const SUBSTITUTE_TYPE_VALUES = ['internal', 'external'] as const satisfies readonly WorkLogSubstituteType[]

function canManageWorkJournal(role: string | null | undefined): role is 'teacher' | 'manager' {
  return role === 'teacher' || role === 'manager'
}

const formSchema = z
  .object({
    entryId: z
      .string()
      .uuid()
      .optional()
      .transform((value) => value ?? null),
    workDate: z
      .string()
      .min(1, '근무일을 선택해주세요.')
      .refine((value) => /^\d{4}-\d{2}-\d{2}$/.test(value), '근무일 형식이 올바르지 않습니다.'),
    status: z.enum(WORK_LOG_STATUS_VALUES),
    workHours: z
      .string()
      .optional()
      .transform((value) => {
        if (typeof value !== 'string') {
          return null
        }
        const trimmed = value.trim()
        if (!trimmed) {
          return null
        }
        const parsed = Number(trimmed)
        if (Number.isNaN(parsed)) {
          return Number.NaN
        }
        return Math.round(parsed * 100) / 100
      }),
    substituteType: z
      .string()
      .optional()
      .transform((value) => {
        if (!value) {
          return null
        }
        if (SUBSTITUTE_TYPE_VALUES.includes(value as WorkLogSubstituteType)) {
          return value as WorkLogSubstituteType
        }
        return null
      }),
    substituteTeacherId: z
      .string()
      .optional()
      .transform((value) => {
        if (!value) {
          return null
        }
        return value
      }),
    externalTeacherName: z
      .string()
      .optional()
      .transform((value) => {
        if (!value) {
          return null
        }
        return value.trim()
      }),
    externalTeacherPhone: z
      .string()
      .optional()
      .transform((value) => {
        if (!value) {
          return null
        }
        return value.trim()
      }),
    externalTeacherBank: z
      .string()
      .optional()
      .transform((value) => {
        if (!value) {
          return null
        }
        return value.trim()
      }),
    externalTeacherAccount: z
      .string()
      .optional()
      .transform((value) => {
        if (!value) {
          return null
        }
        return value.trim()
      }),
    externalTeacherHours: z
      .string()
      .optional()
      .transform((value) => {
        if (!value) {
          return null
        }
        const trimmed = value.trim()
        if (!trimmed) {
          return null
        }
        const parsed = Number(trimmed)
        if (Number.isNaN(parsed)) {
          return Number.NaN
        }
        return Math.round(parsed * 100) / 100
      }),
    notes: z
      .string()
      .optional()
      .transform((value) => {
        if (!value) {
          return null
        }
        return value.trim()
      }),
  })
  .superRefine((value, ctx) => {
    if ((value.status === 'work' || value.status === 'tardy') && (value.workHours === null || Number.isNaN(value.workHours))) {
      ctx.addIssue({
        path: ['workHours'],
        code: z.ZodIssueCode.custom,
        message: '근무 시간을 숫자로 입력해주세요.',
      })
    }

    if ((value.status === 'work' || value.status === 'tardy') && value.workHours !== null) {
      if (value.workHours < 0 || value.workHours > 24) {
        ctx.addIssue({
          path: ['workHours'],
          code: z.ZodIssueCode.custom,
          message: '근무 시간은 0 이상 24 이하로 입력해주세요.',
        })
      }
    }

    if (value.status !== 'work' && value.status !== 'tardy' && value.workHours !== null) {
      ctx.addIssue({
        path: ['workHours'],
        code: z.ZodIssueCode.custom,
        message: '해당 근무 유형에는 근무 시간을 입력하지 않습니다.',
      })
    }

    if (value.status === 'substitute') {
      if (!value.substituteType) {
        ctx.addIssue({
          path: ['substituteType'],
          code: z.ZodIssueCode.custom,
          message: '대타 유형을 선택해주세요.',
        })
      } else if (value.substituteType === 'internal') {
        if (!value.substituteTeacherId) {
          ctx.addIssue({
            path: ['substituteTeacherId'],
            code: z.ZodIssueCode.custom,
            message: '대타로 근무한 선생님을 선택해주세요.',
          })
        }
        if (
          value.externalTeacherName ||
          value.externalTeacherPhone ||
          value.externalTeacherBank ||
          value.externalTeacherAccount
        ) {
          ctx.addIssue({
            path: ['externalTeacherName'],
            code: z.ZodIssueCode.custom,
            message: '외부 선생님 정보는 내부 대타 선택 시 입력하지 않습니다.',
          })
        }
      } else if (value.substituteType === 'external') {
        if (!value.externalTeacherName) {
          ctx.addIssue({
            path: ['externalTeacherName'],
            code: z.ZodIssueCode.custom,
            message: '외부 선생님 성함을 입력해주세요.',
          })
        }
        if (!value.externalTeacherPhone) {
          ctx.addIssue({
            path: ['externalTeacherPhone'],
            code: z.ZodIssueCode.custom,
            message: '외부 선생님 연락처를 입력해주세요.',
          })
        }
        if (!value.externalTeacherBank) {
          ctx.addIssue({
            path: ['externalTeacherBank'],
            code: z.ZodIssueCode.custom,
            message: '은행명을 입력해주세요.',
          })
        }
        if (!value.externalTeacherAccount) {
          ctx.addIssue({
            path: ['externalTeacherAccount'],
            code: z.ZodIssueCode.custom,
            message: '계좌번호를 입력해주세요.',
          })
        }
        if (value.externalTeacherHours === null || Number.isNaN(value.externalTeacherHours)) {
          ctx.addIssue({
            path: ['externalTeacherHours'],
            code: z.ZodIssueCode.custom,
            message: '외부 선생님 근무 시간을 숫자로 입력해주세요.',
          })
        } else if (value.externalTeacherHours < 0 || value.externalTeacherHours > 24) {
          ctx.addIssue({
            path: ['externalTeacherHours'],
            code: z.ZodIssueCode.custom,
            message: '외부 선생님 근무 시간은 0 이상 24 이하로 입력해주세요.',
          })
        }
      }
    } else if (value.substituteType) {
      ctx.addIssue({
        path: ['substituteType'],
        code: z.ZodIssueCode.custom,
        message: '대타 유형은 대타 근무일에만 설정할 수 있습니다.',
      })
    }

    if (value.notes && value.notes.length > 1000) {
      ctx.addIssue({
        path: ['notes'],
        code: z.ZodIssueCode.custom,
        message: '메모는 1000자 이하로 입력해주세요.',
      })
    }
  })

type FormInput = z.infer<typeof formSchema>

type ActionResult = {
  success?: true
  entry?: WorkLogEntry
  error?: string
}

function normalizeFormData(formData: FormData) {
  const entries: Record<string, string> = {}
  formData.forEach((value, key) => {
    if (typeof value === 'string') {
      entries[key] = value
    }
  })
  return entries
}

export async function saveWorkLogEntry(formData: FormData): Promise<ActionResult> {
  const { profile } = await getAuthContext()

  if (!profile || !canManageWorkJournal(profile.role)) {
    return { error: '근무일지를 작성할 수 있는 권한이 없습니다.' }
  }

  const parsed = formSchema.safeParse(normalizeFormData(formData))

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]
    return { error: firstIssue?.message ?? '입력값을 확인해주세요.' }
  }

  const input: FormInput = parsed.data

  if (input.substituteType === 'internal' && input.substituteTeacherId === profile.id) {
    return { error: '본인을 대타로 지정할 수 없습니다.' }
  }

  const supabase = createServerSupabase()

  const { data: existing, error: fetchError } = await supabase
    .from('work_log_entries')
    .select(WORK_LOG_ENTRY_SELECT_FIELDS)
    .eq('teacher_id', profile.id)
    .eq('work_date', input.workDate)
    .maybeSingle<WorkLogEntryRow>()

  if (fetchError) {
    console.error('[work-log] fetch existing error', fetchError)
    return { error: '근무일지를 불러오는 중 오류가 발생했습니다.' }
  }

  if (existing && existing.review_status === 'approved') {
    return { error: '승인 완료된 근무일지는 수정할 수 없습니다.' }
  }

  const shouldStoreWorkHours = input.status === 'work' || input.status === 'tardy'

  const payload = {
    teacher_id: profile.id,
    work_date: input.workDate,
    status: input.status,
    work_hours: shouldStoreWorkHours ? input.workHours ?? null : null,
    substitute_type: input.status === 'substitute' ? input.substituteType : null,
    substitute_teacher_id:
      input.status === 'substitute' && input.substituteType === 'internal' ? input.substituteTeacherId : null,
    external_teacher_name:
      input.status === 'substitute' && input.substituteType === 'external' ? input.externalTeacherName : null,
    external_teacher_phone:
      input.status === 'substitute' && input.substituteType === 'external' ? input.externalTeacherPhone : null,
    external_teacher_bank:
      input.status === 'substitute' && input.substituteType === 'external' ? input.externalTeacherBank : null,
    external_teacher_account:
      input.status === 'substitute' && input.substituteType === 'external' ? input.externalTeacherAccount : null,
    external_teacher_hours:
      input.status === 'substitute' && input.substituteType === 'external' ? input.externalTeacherHours ?? null : null,
    notes: input.notes ?? null,
    review_status: 'pending' as const,
    review_note: null,
    reviewed_by: null,
    reviewed_at: null,
  }

  if (existing) {
    const { data: row, error: updateError } = await supabase
      .from('work_log_entries')
      .update(payload)
      .eq('id', existing.id)
      .select(WORK_LOG_ENTRY_SELECT_FIELDS)
      .maybeSingle<WorkLogEntryRow>()

    if (updateError || !row) {
      console.error('[work-log] update error', updateError)
      return { error: '근무일지 저장에 실패했습니다.' }
    }

    revalidatePath('/dashboard/teacher/work-journal')
    revalidatePath('/dashboard/principal/work-logs')
    return {
      success: true,
      entry: mapWorkLogRow(row),
    }
  }

  const { data: row, error: insertError } = await supabase
    .from('work_log_entries')
    .insert(payload)
    .select(WORK_LOG_ENTRY_SELECT_FIELDS)
    .maybeSingle<WorkLogEntryRow>()

  if (insertError || !row) {
    console.error('[work-log] insert error', insertError)
    return { error: '근무일지 저장에 실패했습니다.' }
  }

  revalidatePath('/dashboard/teacher/work-journal')
  revalidatePath('/dashboard/principal/work-logs')
  return {
    success: true,
    entry: mapWorkLogRow(row),
  }
}

export async function deleteWorkLogEntry(formData: FormData): Promise<ActionResult> {
  const { profile } = await getAuthContext()

  if (!profile || !canManageWorkJournal(profile.role)) {
    return { error: '근무일지를 삭제할 수 있는 권한이 없습니다.' }
  }

  const workDateValue = formData.get('workDate')
  if (typeof workDateValue !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(workDateValue)) {
    return { error: '삭제할 근무일 정보가 올바르지 않습니다.' }
  }

  const supabase = createServerSupabase()

  const { data: existing, error: fetchError } = await supabase
    .from('work_log_entries')
    .select(WORK_LOG_ENTRY_SELECT_FIELDS)
    .eq('teacher_id', profile.id)
    .eq('work_date', workDateValue)
    .maybeSingle<WorkLogEntryRow>()

  if (fetchError) {
    console.error('[work-log] delete fetch error', fetchError)
    return { error: '근무일지를 확인하는 중 오류가 발생했습니다.' }
  }

  if (!existing) {
    return { error: '삭제할 근무일지를 찾을 수 없습니다.' }
  }

  if (existing.review_status === 'approved') {
    return { error: '승인 완료된 근무일지는 삭제할 수 없습니다.' }
  }

  const { error: deleteError } = await supabase
    .from('work_log_entries')
    .delete()
    .eq('id', existing.id)

  if (deleteError) {
    console.error('[work-log] delete error', deleteError)
    return { error: '근무일지 삭제에 실패했습니다.' }
  }

  revalidatePath('/dashboard/teacher/work-journal')
  revalidatePath('/dashboard/principal/work-logs')

  return { success: true }
}
