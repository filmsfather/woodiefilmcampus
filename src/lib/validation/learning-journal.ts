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
  classId: uuidSchema,
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
    .min(1, '코멘트를 최소 1자 이상 입력해주세요.')
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
