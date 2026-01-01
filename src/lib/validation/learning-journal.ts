import { z } from 'zod'

import {
  LEARNING_JOURNAL_COMMENT_SCOPES,
  LEARNING_JOURNAL_ENTRY_STATUSES,
  LEARNING_JOURNAL_PERIOD_STATUSES,
  LEARNING_JOURNAL_SUBJECTS,
} from '@/types/learning-journal'

const uuidSchema = z.string().uuid({ message: '잘못된 식별자입니다.' })

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/

export const isoDateSchema = z
  .string()
  .min(1, { message: '날짜를 선택해주세요.' })
  .regex(isoDatePattern, '날짜 형식이 올바르지 않습니다. (YYYY-MM-DD)')

export const monthTokenSchema = z
  .string()
  .min(1, { message: '월을 선택해주세요.' })
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, '월 형식은 YYYY-MM 이어야 합니다.')

export const createLearningJournalPeriodSchema = z.object({
  classIds: z.array(uuidSchema).min(1, { message: '반을 최소 1개 이상 선택해주세요.' }),
  startDate: isoDateSchema,
  label: z
    .string()
    .trim()
    .max(120, '라벨은 120자 이하로 입력해주세요.')
    .optional()
    .or(z.literal('')),
})

export const updateLearningJournalPeriodSchema = z.object({
  periodId: uuidSchema,
  startDate: isoDateSchema,
  endDate: isoDateSchema.optional(),
  label: z
    .string()
    .trim()
    .max(120, '라벨은 120자 이하로 입력해주세요.')
    .optional()
    .or(z.literal('')),
  status: z.enum(LEARNING_JOURNAL_PERIOD_STATUSES as [string, ...string[]]),
})

export const deleteLearningJournalPeriodSchema = z.object({
  periodId: uuidSchema,
})

export const upsertLearningJournalGreetingSchema = z.object({
  monthToken: monthTokenSchema,
  message: z
    .string()
    .trim()
    .min(1, { message: '인사말을 입력해주세요.' })
    .min(10, '인사말을 최소 10자 이상 입력해주세요.')
    .max(2_000, '인사말은 최대 2,000자까지 입력할 수 있습니다.'),
})

export const deleteLearningJournalGreetingSchema = z.object({
  monthToken: monthTokenSchema,
})

const nullableIsoDateInputSchema = z
  .union([isoDateSchema, z.literal('')])
  .transform((value) => (value === '' ? null : value))

export const upsertLearningJournalAnnualScheduleSchema = z
  .object({
    scheduleId: uuidSchema.optional(),
    category: z.enum(['annual', 'film_production']),
    periodLabel: z
      .string()
      .trim()
      .min(1, { message: '기간명을 입력해주세요.' })
      .max(120, '기간명은 최대 120자까지 입력할 수 있습니다.'),
    startDate: isoDateSchema,
    endDate: isoDateSchema,
    tuitionDueDate: nullableIsoDateInputSchema,
    tuitionAmount: z
      .string()
      .trim()
      .regex(/^[0-9,]*$/, '수업료는 숫자만 입력할 수 있습니다.')
      .max(15, '수업료는 15자리 이하의 숫자로 입력해주세요.')
      .optional()
      .or(z.literal('')),
    memo: z
      .string()
      .trim()
      .max(2_000, '비고는 최대 2,000자까지 입력할 수 있습니다.')
      .optional()
      .or(z.literal('')),
  })
  .superRefine((value, ctx) => {
    const start = new Date(value.startDate)
    const end = new Date(value.endDate)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['startDate'],
        message: '기간 날짜가 올바르지 않습니다.',
      })
      return
    }

    if (end < start) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endDate'],
        message: '종료일은 시작일 이후여야 합니다.',
      })
    }
  })

export const deleteLearningJournalAnnualScheduleSchema = z.object({
  scheduleId: uuidSchema,
})

export const upsertLearningJournalAcademicEventSchema = z.object({
  eventId: uuidSchema.optional(),
  monthToken: monthTokenSchema,
  title: z
    .string()
    .trim()
    .min(1, { message: '제목을 입력해주세요.' })
    .min(2, '제목을 최소 2자 이상 입력해주세요.')
    .max(200, '제목은 최대 200자까지 입력할 수 있습니다.'),
  startDate: isoDateSchema,
  endDate: isoDateSchema.optional(),
  memo: z
    .string()
    .trim()
    .max(2_000, '메모는 최대 2,000자까지 입력할 수 있습니다.')
    .optional()
    .or(z.literal('')),
})

export const deleteLearningJournalAcademicEventSchema = z.object({
  eventId: uuidSchema,
})

export const saveLearningJournalCommentSchema = z.object({
  entryId: uuidSchema,
  roleScope: z.enum(LEARNING_JOURNAL_COMMENT_SCOPES),
  subject: z
    .enum(LEARNING_JOURNAL_SUBJECTS)
    .optional()
    .nullable(),
  body: z
    .string()
    .trim()
    .max(4_000, '코멘트는 최대 4,000자까지 입력할 수 있습니다.'),
})
  .superRefine((value, ctx) => {
    if (value.roleScope === 'homeroom' && value.subject) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['subject'],
        message: '담임 코멘트는 과목을 선택할 수 없습니다.',
      })
    }

    if (value.roleScope === 'subject' && !value.subject) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['subject'],
        message: '과목 코멘트는 과목을 반드시 선택해야 합니다.',
      })
    }
  })

export const updateLearningJournalEntryStatusSchema = z.object({
  entryId: uuidSchema,
  status: z.enum(LEARNING_JOURNAL_ENTRY_STATUSES as [string, ...string[]]),
})

export type CreateLearningJournalPeriodInput = z.infer<typeof createLearningJournalPeriodSchema>
export type UpdateLearningJournalPeriodInput = z.infer<typeof updateLearningJournalPeriodSchema>
export type UpsertLearningJournalGreetingInput = z.infer<typeof upsertLearningJournalGreetingSchema>
export type UpsertLearningJournalAcademicEventInput = z.infer<typeof upsertLearningJournalAcademicEventSchema>
export type SaveLearningJournalCommentInput = z.infer<typeof saveLearningJournalCommentSchema>
export type UpdateLearningJournalEntryStatusInput = z.infer<typeof updateLearningJournalEntryStatusSchema>
export type UpsertLearningJournalAnnualScheduleInput = z.infer<
  typeof upsertLearningJournalAnnualScheduleSchema
>
export type DeleteLearningJournalAnnualScheduleInput = z.infer<
  typeof deleteLearningJournalAnnualScheduleSchema
>

export const upsertClassLearningJournalWeekSchema = z
  .object({
    classId: uuidSchema,
    periodId: uuidSchema,
    weekIndex: z
      .number()
      .int('주차는 정수여야 합니다.')
      .min(1, '1주차부터 선택할 수 있습니다.')
      .max(4, '4주차까지만 입력할 수 있습니다.'),
    subject: z.enum(LEARNING_JOURNAL_SUBJECTS),
    // 직접 입력한 자료는 빈 문자열 ID를 가지므로 UUID 또는 빈 문자열 허용
    materialIds: z.array(z.string().uuid().or(z.literal(''))).max(20, '자료는 최대 20개까지 선택할 수 있습니다.'),
    materialTitles: z.array(z.string().trim().max(200, '자료 제목은 200자 이하여야 합니다.')),
    materialNotes: z
      .string()
      .trim()
      .max(2000, '메모는 최대 2000자까지 입력할 수 있습니다.')
      .optional()
      .or(z.literal('').transform(() => null)),
  })
  .superRefine((value, ctx) => {
    if (value.materialIds.length !== value.materialTitles.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['materialTitles'],
        message: '자료 제목의 개수가 선택한 자료 수와 일치하지 않습니다.',
      })
    }
  })

export const deleteClassLearningJournalWeekSchema = z.object({
  classId: uuidSchema,
  periodId: uuidSchema,
  weekIndex: z
    .number()
    .int('주차는 정수여야 합니다.')
    .min(1)
    .max(4),
  subject: z.enum(LEARNING_JOURNAL_SUBJECTS),
})

export type UpsertClassLearningJournalWeekInputDto = z.infer<typeof upsertClassLearningJournalWeekSchema>
export type DeleteClassLearningJournalWeekInputDto = z.infer<typeof deleteClassLearningJournalWeekSchema>
