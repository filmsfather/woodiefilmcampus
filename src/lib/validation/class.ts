import { z } from 'zod'

const uuidField = z
  .string({ required_error: 'ID가 필요합니다.' })
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
  .array(uuidField, { invalid_type_error: '담당 교사를 선택해주세요.' })
  .min(1, '담당 교사를 최소 1명 선택해주세요.')

const studentIdsField = z.array(uuidField).optional().transform((value) => value ?? [])

const baseClassSchema = z.object({
  name: z
    .string({ required_error: '반 이름을 입력해주세요.' })
    .trim()
    .min(1, '반 이름을 입력해주세요.'),
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

