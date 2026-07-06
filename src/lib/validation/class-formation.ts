import { z } from 'zod'

import { WEEKDAY_PREFERENCE_VALUES } from '@/lib/university-confirmation/constants'

const uuidField = z
  .string()
  .min(1, { message: 'ID가 필요합니다.' })
  .uuid('유효한 ID 형식이 아닙니다.')

const nameField = z
  .string()
  .trim()
  .min(1, { message: '이름을 입력해주세요.' })
  .max(60, { message: '이름은 60자 이하로 입력해주세요.' })

const weekdayField = z
  .enum(WEEKDAY_PREFERENCE_VALUES as unknown as [string, ...string[]])
  .nullable()
  .optional()
  .transform((value) => value ?? null)

const homeroomTeacherField = uuidField
  .nullable()
  .optional()
  .transform((value) => value ?? null)

const noteField = z
  .string()
  .optional()
  .transform((value) => {
    const trimmed = value?.trim()
    return trimmed && trimmed.length > 0 ? trimmed : null
  })

export const createPlanSchema = z.object({
  name: nameField,
})

export const renamePlanSchema = z.object({
  planId: uuidField,
  name: nameField,
})

export const createGroupSchema = z.object({
  planId: uuidField,
  name: nameField,
  weekday: weekdayField,
  homeroomTeacherId: homeroomTeacherField,
  note: noteField,
})

export const updateGroupSchema = z.object({
  groupId: uuidField,
  name: nameField,
  weekday: weekdayField,
  homeroomTeacherId: homeroomTeacherField,
  note: noteField,
})

export const assignStudentSchema = z.object({
  planId: uuidField,
  groupId: uuidField,
  studentId: uuidField,
})

export const unassignStudentSchema = z.object({
  planId: uuidField,
  studentId: uuidField,
})

export type CreatePlanInput = z.infer<typeof createPlanSchema>
export type CreateGroupInput = z.infer<typeof createGroupSchema>
export type UpdateGroupInput = z.infer<typeof updateGroupSchema>
