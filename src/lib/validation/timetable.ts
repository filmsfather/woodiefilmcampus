import { z } from 'zod'

const uuid = z.string().uuid()
const trimmedName = z
  .string()
  .trim()
  .min(1, '이름을 입력해주세요.')
  .max(120, '이름은 120자 이내로 입력해주세요.')

const periodName = z
  .string()
  .trim()
  .min(1, '교시 이름을 입력해주세요.')
  .max(120, '교시 이름은 120자 이내로 입력해주세요.')

export const createTimetableSchema = z.object({
  name: trimmedName,
})

export type CreateTimetableInput = z.infer<typeof createTimetableSchema>

export const updateTimetableNameSchema = z.object({
  timetableId: uuid,
  name: trimmedName,
})

export type UpdateTimetableNameInput = z.infer<typeof updateTimetableNameSchema>

export const addTimetableTeacherSchema = z.object({
  timetableId: uuid,
  teacherId: uuid,
})

export type AddTimetableTeacherInput = z.infer<typeof addTimetableTeacherSchema>

export const removeTimetableTeacherSchema = z.object({
  timetableTeacherId: uuid,
})

export type RemoveTimetableTeacherInput = z.infer<typeof removeTimetableTeacherSchema>

export const createTimetablePeriodSchema = z.object({
  timetableId: uuid,
  name: periodName,
})

export type CreateTimetablePeriodInput = z.infer<typeof createTimetablePeriodSchema>

export const updateTimetablePeriodSchema = z.object({
  periodId: uuid,
  name: periodName,
})

export type UpdateTimetablePeriodInput = z.infer<typeof updateTimetablePeriodSchema>

export const deleteTimetablePeriodSchema = z.object({
  periodId: uuid,
})

export type DeleteTimetablePeriodInput = z.infer<typeof deleteTimetablePeriodSchema>

export const setTimetableCellAssignmentsSchema = z.object({
  timetableId: uuid,
  teacherColumnId: uuid,
  periodId: uuid,
  classIds: z
    .array(uuid)
    .nonempty('반을 최소 한 개 이상 선택해주세요.')
    .max(10, '한 교시에 10개 이상의 반을 배정할 수 없습니다.')
    .transform((ids) => Array.from(new Set(ids))),
})

export type SetTimetableCellAssignmentsInput = z.infer<typeof setTimetableCellAssignmentsSchema>

export const clearTimetableCellAssignmentsSchema = z.object({
  timetableId: uuid,
  teacherColumnId: uuid,
  periodId: uuid,
})

export type ClearTimetableCellAssignmentsInput = z.infer<typeof clearTimetableCellAssignmentsSchema>

export const deleteTimetableSchema = z.object({
  timetableId: uuid,
})

export type DeleteTimetableInput = z.infer<typeof deleteTimetableSchema>
