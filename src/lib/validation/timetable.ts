import { z } from 'zod'

const uuid = z.string().uuid()
const timeValue = z
  .string()
  .regex(/^\d{2}:\d{2}$/, '시간은 HH:MM 형식으로 입력해주세요.')

export const upsertClassScheduleEntrySchema = z
  .object({
    entryId: uuid.optional(),
    classId: uuid,
    dayOfWeek: z.number().int().min(0, '요일을 선택해주세요.').max(6, '요일을 선택해주세요.'),
    period: z.number().int().min(1, '교시는 1 이상이어야 합니다.').max(20, '교시는 20 이하여야 합니다.'),
    startTime: timeValue,
    endTime: timeValue,
    teacherId: uuid.nullable(),
  })
  .refine((value) => value.startTime < value.endTime, {
    message: '종료 시간은 시작 시간보다 늦어야 합니다.',
  })

export type UpsertClassScheduleEntryInput = z.infer<typeof upsertClassScheduleEntrySchema>

export const deleteClassScheduleEntrySchema = z.object({
  entryId: uuid,
})

export type DeleteClassScheduleEntryInput = z.infer<typeof deleteClassScheduleEntrySchema>
