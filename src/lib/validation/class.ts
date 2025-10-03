import { z } from 'zod'

const uuidField = z
  .string()
  .min(1, { message: 'ID가 필요합니다.' })
  .uuid('유효한 ID 형식이 아닙니다.')

const descriptionField = z
  .string()
  .optional()
  .transform((value) => {
    if (!value) {
      return null
    }

    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
  })

const teacherIdsField = z
  .array(uuidField)
  .min(1, { message: '담당 교사를 최소 1명 선택해주세요.' })

const studentIdsField = z.array(uuidField).optional().transform((value) => value ?? [])

const baseClassSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { message: '반 이름을 입력해주세요.' }),
  description: descriptionField,
  homeroomTeacherId: uuidField,
  teacherIds: teacherIdsField,
  studentIds: studentIdsField,
})

export const createClassSchema = baseClassSchema

export const updateClassSchema = baseClassSchema.extend({
  classId: uuidField,
})

export type CreateClassInput = z.infer<typeof createClassSchema>
export type UpdateClassInput = z.infer<typeof updateClassSchema>
