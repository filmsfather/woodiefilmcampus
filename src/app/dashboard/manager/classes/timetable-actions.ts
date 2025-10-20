'use server'

import { revalidatePath } from 'next/cache'

import { ensureManagerProfile } from '@/lib/authz'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  addTimetableTeacherSchema,
  clearTimetableCellAssignmentsSchema,
  createTimetablePeriodSchema,
  createTimetableSchema,
  deleteTimetablePeriodSchema,
  deleteTimetableSchema,
  removeTimetableTeacherSchema,
  setTimetableCellAssignmentsSchema,
  updateTimetableNameSchema,
  updateTimetablePeriodSchema,
  type AddTimetableTeacherInput,
  type ClearTimetableCellAssignmentsInput,
  type CreateTimetableInput,
  type CreateTimetablePeriodInput,
  type DeleteTimetablePeriodInput,
  type DeleteTimetableInput,
  type RemoveTimetableTeacherInput,
  type SetTimetableCellAssignmentsInput,
  type UpdateTimetableNameInput,
  type UpdateTimetablePeriodInput,
} from '@/lib/validation/timetable'

const MANAGER_CLASSES_PATH = '/dashboard/manager/classes'

interface ActionResultBase {
  status: 'success' | 'error'
  message?: string
}

export interface CreateTimetableResult extends ActionResultBase {
  timetable?: {
    id: string
    name: string
    createdAt: string
    updatedAt: string
  }
}

export interface AddTimetableTeacherResult extends ActionResultBase {
  teacherColumn?: {
    id: string
    timetableId: string
    teacherId: string
    position: number
  }
}

export interface RemoveTimetableTeacherResult extends ActionResultBase {
  removedId?: string
}

export interface CreateTimetablePeriodResult extends ActionResultBase {
  period?: {
    id: string
    timetableId: string
    name: string
    position: number
  }
}

export interface UpdateTimetablePeriodResult extends ActionResultBase {
  period?: {
    id: string
    name: string
  }
}

export interface SetTimetableCellAssignmentsResult extends ActionResultBase {
  assignments?: Array<{
    id: string
    classId: string
  }>
}

export interface ClearTimetableCellAssignmentsResult extends ActionResultBase {
  cleared?: true
}

export interface UpdateTimetableNameResult extends ActionResultBase {
  timetable?: {
    id: string
    name: string
  }
}

export interface DeleteTimetableResult extends ActionResultBase {
  deletedId?: string
}

function makeError(message: string): ActionResultBase {
  return { status: 'error', message }
}

async function touchTimetable(supabase: ReturnType<typeof createAdminClient>, timetableId: string) {
  await supabase
    .from('timetables')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', timetableId)
}

export async function createTimetableAction(input: CreateTimetableInput): Promise<CreateTimetableResult> {
  const profile = await ensureManagerProfile()

  if (!profile) {
    return makeError('시간표를 생성할 권한이 없습니다.')
  }

  const parsed = createTimetableSchema.safeParse(input)

  if (!parsed.success) {
    return makeError(parsed.error.flatten().formErrors[0] ?? '입력값을 다시 확인해주세요.')
  }

  const supabase = createAdminClient()
  const { name } = parsed.data

  try {
    const { data, error } = await supabase
      .from('timetables')
      .insert({
        name,
        created_by: profile.id,
      })
      .select('id, name, created_at, updated_at')
      .maybeSingle()

    if (error || !data) {
      console.error('createTimetableAction insert error', error)
      return makeError('시간표 생성 중 오류가 발생했습니다.')
    }

    revalidatePath(MANAGER_CLASSES_PATH)
    return {
      status: 'success',
      message: '새 시간표를 생성했습니다.',
      timetable: {
        id: data.id,
        name: data.name,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      },
    }
  } catch (error) {
    console.error('createTimetableAction unexpected error', error)
    return makeError('시간표 생성 중 예상치 못한 오류가 발생했습니다.')
  }
}

export async function addTimetableTeacherAction(
  input: AddTimetableTeacherInput,
): Promise<AddTimetableTeacherResult> {
  const profile = await ensureManagerProfile()

  if (!profile) {
    return makeError('시간표를 수정할 권한이 없습니다.')
  }

  const parsed = addTimetableTeacherSchema.safeParse(input)

  if (!parsed.success) {
    return makeError(parsed.error.flatten().formErrors[0] ?? '입력값을 다시 확인해주세요.')
  }

  const supabase = createAdminClient()
  const { timetableId, teacherId } = parsed.data

  try {
    const { data: maxRow, error: maxError } = await supabase
      .from('timetable_teachers')
      .select('position')
      .eq('timetable_id', timetableId)
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (maxError) {
      console.error('addTimetableTeacherAction fetch max position error', maxError)
      return makeError('교사 정보를 불러오지 못했습니다.')
    }

    const nextPosition = (maxRow?.position ?? -1) + 1

    const { data, error } = await supabase
      .from('timetable_teachers')
      .insert({
        timetable_id: timetableId,
        teacher_id: teacherId,
        position: nextPosition,
      })
      .select('id, timetable_id, teacher_id, position')
      .maybeSingle()

    if (error) {
      console.error('addTimetableTeacherAction insert error', error)

      if (error.code === '23505') {
        return makeError('이미 추가된 선생님입니다.')
      }

      return makeError('선생님을 시간표에 추가하지 못했습니다.')
    }

    if (!data) {
      return makeError('선생님을 시간표에 추가하지 못했습니다.')
    }

    await touchTimetable(supabase, timetableId)
    revalidatePath(MANAGER_CLASSES_PATH)

    return {
      status: 'success',
      message: '선생님을 추가했습니다.',
      teacherColumn: {
        id: data.id,
        timetableId: data.timetable_id,
        teacherId: data.teacher_id,
        position: data.position,
      },
    }
  } catch (error) {
    console.error('addTimetableTeacherAction unexpected error', error)
    return makeError('선생님을 시간표에 추가하는 중 오류가 발생했습니다.')
  }
}

export async function removeTimetableTeacherAction(
  input: RemoveTimetableTeacherInput,
): Promise<RemoveTimetableTeacherResult> {
  const profile = await ensureManagerProfile()

  if (!profile) {
    return makeError('시간표를 수정할 권한이 없습니다.')
  }

  const parsed = removeTimetableTeacherSchema.safeParse(input)

  if (!parsed.success) {
    return makeError(parsed.error.flatten().formErrors[0] ?? '입력값을 다시 확인해주세요.')
  }

  const supabase = createAdminClient()
  const { timetableTeacherId } = parsed.data

  try {
    const { data: row, error: fetchError } = await supabase
      .from('timetable_teachers')
      .select('id, timetable_id')
      .eq('id', timetableTeacherId)
      .maybeSingle()

    if (fetchError) {
      console.error('removeTimetableTeacherAction fetch error', fetchError)
      return makeError('선생님 정보를 찾지 못했습니다.')
    }

    if (!row) {
      return makeError('이미 삭제된 선생님입니다.')
    }

    const { error } = await supabase
      .from('timetable_teachers')
      .delete()
      .eq('id', timetableTeacherId)

    if (error) {
      console.error('removeTimetableTeacherAction delete error', error)
      return makeError('선생님을 시간표에서 제거하지 못했습니다.')
    }

    await touchTimetable(supabase, row.timetable_id)
    revalidatePath(MANAGER_CLASSES_PATH)

    return {
      status: 'success',
      message: '선생님을 시간표에서 제거했습니다.',
      removedId: timetableTeacherId,
    }
  } catch (error) {
    console.error('removeTimetableTeacherAction unexpected error', error)
    return makeError('선생님 제거 중 예상치 못한 오류가 발생했습니다.')
  }
}

export async function createTimetablePeriodAction(
  input: CreateTimetablePeriodInput,
): Promise<CreateTimetablePeriodResult> {
  const profile = await ensureManagerProfile()

  if (!profile) {
    return makeError('시간표를 수정할 권한이 없습니다.')
  }

  const parsed = createTimetablePeriodSchema.safeParse(input)

  if (!parsed.success) {
    return makeError(parsed.error.flatten().formErrors[0] ?? '입력값을 다시 확인해주세요.')
  }

  const supabase = createAdminClient()
  const { timetableId, name } = parsed.data

  try {
    const { data: maxRow, error: maxError } = await supabase
      .from('timetable_periods')
      .select('position')
      .eq('timetable_id', timetableId)
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (maxError) {
      console.error('createTimetablePeriodAction fetch max position error', maxError)
      return makeError('교시 정보를 불러오지 못했습니다.')
    }

    const nextPosition = (maxRow?.position ?? -1) + 1

    const { data, error } = await supabase
      .from('timetable_periods')
      .insert({
        timetable_id: timetableId,
        name,
        position: nextPosition,
      })
      .select('id, timetable_id, name, position')
      .maybeSingle()

    if (error || !data) {
      console.error('createTimetablePeriodAction insert error', error)
      return makeError('교시를 추가하지 못했습니다.')
    }

    await touchTimetable(supabase, timetableId)
    revalidatePath(MANAGER_CLASSES_PATH)

    return {
      status: 'success',
      message: '새 교시를 추가했습니다.',
      period: {
        id: data.id,
        timetableId: data.timetable_id,
        name: data.name,
        position: data.position,
      },
    }
  } catch (error) {
    console.error('createTimetablePeriodAction unexpected error', error)
    return makeError('교시를 추가하는 중 오류가 발생했습니다.')
  }
}

export async function updateTimetablePeriodAction(
  input: UpdateTimetablePeriodInput,
): Promise<UpdateTimetablePeriodResult> {
  const profile = await ensureManagerProfile()

  if (!profile) {
    return makeError('시간표를 수정할 권한이 없습니다.')
  }

  const parsed = updateTimetablePeriodSchema.safeParse(input)

  if (!parsed.success) {
    return makeError(parsed.error.flatten().formErrors[0] ?? '입력값을 다시 확인해주세요.')
  }

  const supabase = createAdminClient()
  const { periodId, name } = parsed.data

  try {
    const { data: row, error: fetchError } = await supabase
      .from('timetable_periods')
      .select('id, timetable_id')
      .eq('id', periodId)
      .maybeSingle()

    if (fetchError) {
      console.error('updateTimetablePeriodAction fetch error', fetchError)
      return makeError('교시 정보를 찾지 못했습니다.')
    }

    if (!row) {
      return makeError('존재하지 않는 교시입니다.')
    }

    const { error } = await supabase
      .from('timetable_periods')
      .update({ name })
      .eq('id', periodId)

    if (error) {
      console.error('updateTimetablePeriodAction update error', error)
      return makeError('교시 이름을 변경하지 못했습니다.')
    }

    await touchTimetable(supabase, row.timetable_id)
    revalidatePath(MANAGER_CLASSES_PATH)

    return {
      status: 'success',
      message: '교시 이름을 변경했습니다.',
      period: {
        id: periodId,
        name,
      },
    }
  } catch (error) {
    console.error('updateTimetablePeriodAction unexpected error', error)
    return makeError('교시 이름 변경 중 오류가 발생했습니다.')
  }
}

export async function deleteTimetablePeriodAction(
  input: DeleteTimetablePeriodInput,
): Promise<RemoveTimetableTeacherResult> {
  const profile = await ensureManagerProfile()

  if (!profile) {
    return makeError('시간표를 수정할 권한이 없습니다.')
  }

  const parsed = deleteTimetablePeriodSchema.safeParse(input)

  if (!parsed.success) {
    return makeError(parsed.error.flatten().formErrors[0] ?? '입력값을 다시 확인해주세요.')
  }

  const supabase = createAdminClient()
  const { periodId } = parsed.data

  try {
    const { data: row, error: fetchError } = await supabase
      .from('timetable_periods')
      .select('id, timetable_id')
      .eq('id', periodId)
      .maybeSingle()

    if (fetchError) {
      console.error('deleteTimetablePeriodAction fetch error', fetchError)
      return makeError('교시 정보를 찾지 못했습니다.')
    }

    if (!row) {
      return makeError('이미 삭제된 교시입니다.')
    }

    const { error } = await supabase
      .from('timetable_periods')
      .delete()
      .eq('id', periodId)

    if (error) {
      console.error('deleteTimetablePeriodAction delete error', error)
      return makeError('교시를 삭제하지 못했습니다.')
    }

    await touchTimetable(supabase, row.timetable_id)
    revalidatePath(MANAGER_CLASSES_PATH)

    return {
      status: 'success',
      message: '교시를 삭제했습니다.',
      removedId: periodId,
    }
  } catch (error) {
    console.error('deleteTimetablePeriodAction unexpected error', error)
    return makeError('교시 삭제 중 오류가 발생했습니다.')
  }
}

export async function setTimetableCellAssignmentsAction(
  input: SetTimetableCellAssignmentsInput,
): Promise<SetTimetableCellAssignmentsResult> {
  const profile = await ensureManagerProfile()

  if (!profile) {
    return makeError('시간표를 수정할 권한이 없습니다.')
  }

  const parsed = setTimetableCellAssignmentsSchema.safeParse(input)

  if (!parsed.success) {
    const message = parsed.error.flatten().formErrors[0] ?? '입력값을 다시 확인해주세요.'
    return makeError(message)
  }

  const supabase = createAdminClient()
  const { timetableId, teacherColumnId, periodId, classIds } = parsed.data

  try {
    const [{ data: teacherRow, error: teacherError }, { data: periodRow, error: periodError }] = await Promise.all([
      supabase
        .from('timetable_teachers')
        .select('id, timetable_id')
        .eq('id', teacherColumnId)
        .maybeSingle(),
      supabase
        .from('timetable_periods')
        .select('id, timetable_id')
        .eq('id', periodId)
        .maybeSingle(),
    ])

    if (teacherError) {
      console.error('setTimetableCellAssignmentsAction teacher fetch error', teacherError)
      return makeError('선생님 정보를 확인하지 못했습니다.')
    }

    if (periodError) {
      console.error('setTimetableCellAssignmentsAction period fetch error', periodError)
      return makeError('교시 정보를 확인하지 못했습니다.')
    }

    if (!teacherRow || teacherRow.timetable_id !== timetableId) {
      return makeError('해당 시간표에 속한 선생님이 아닙니다.')
    }

    if (!periodRow || periodRow.timetable_id !== timetableId) {
      return makeError('해당 시간표에 속한 교시가 아닙니다.')
    }

    const { error: deleteError } = await supabase
      .from('timetable_assignments')
      .delete()
      .eq('teacher_column_id', teacherColumnId)
      .eq('period_id', periodId)

    if (deleteError) {
      console.error('setTimetableCellAssignmentsAction delete error', deleteError)
      return makeError('기존 배정 정보를 정리하지 못했습니다.')
    }

    const rows = classIds.map((classId) => ({
      timetable_id: timetableId,
      teacher_column_id: teacherColumnId,
      period_id: periodId,
      class_id: classId,
    }))

    const { data, error: insertError } = await supabase
      .from('timetable_assignments')
      .insert(rows)
      .select('id, class_id')

    if (insertError) {
      console.error('setTimetableCellAssignmentsAction insert error', insertError)
      return makeError('반을 배정하지 못했습니다.')
    }

    await touchTimetable(supabase, timetableId)
    revalidatePath(MANAGER_CLASSES_PATH)

    return {
      status: 'success',
      message: '반을 배정했습니다.',
      assignments: (data ?? []).map((row) => ({ id: row.id, classId: row.class_id })),
    }
  } catch (error) {
    console.error('setTimetableCellAssignmentsAction unexpected error', error)
    return makeError('반을 배정하는 중 오류가 발생했습니다.')
  }
}

export async function clearTimetableCellAssignmentsAction(
  input: ClearTimetableCellAssignmentsInput,
): Promise<ClearTimetableCellAssignmentsResult> {
  const profile = await ensureManagerProfile()

  if (!profile) {
    return makeError('시간표를 수정할 권한이 없습니다.')
  }

  const parsed = clearTimetableCellAssignmentsSchema.safeParse(input)

  if (!parsed.success) {
    return makeError(parsed.error.flatten().formErrors[0] ?? '입력값을 다시 확인해주세요.')
  }

  const supabase = createAdminClient()
  const { timetableId, teacherColumnId, periodId } = parsed.data

  try {
    const { error } = await supabase
      .from('timetable_assignments')
      .delete()
      .eq('teacher_column_id', teacherColumnId)
      .eq('period_id', periodId)

    if (error) {
      console.error('clearTimetableCellAssignmentsAction delete error', error)
      return makeError('배정된 반을 제거하지 못했습니다.')
    }

    await touchTimetable(supabase, timetableId)
    revalidatePath(MANAGER_CLASSES_PATH)

    return {
      status: 'success',
      message: '배정된 반을 제거했습니다.',
      cleared: true,
    }
  } catch (error) {
    console.error('clearTimetableCellAssignmentsAction unexpected error', error)
    return makeError('배정 제거 중 오류가 발생했습니다.')
  }
}

export async function updateTimetableNameAction(
  input: UpdateTimetableNameInput,
): Promise<UpdateTimetableNameResult> {
  const profile = await ensureManagerProfile()

  if (!profile) {
    return makeError('시간표를 수정할 권한이 없습니다.')
  }

  const parsed = updateTimetableNameSchema.safeParse(input)

  if (!parsed.success) {
    return makeError(parsed.error.flatten().formErrors[0] ?? '입력값을 다시 확인해주세요.')
  }

  const supabase = createAdminClient()
  const { timetableId, name } = parsed.data

  try {
    const { error } = await supabase
      .from('timetables')
      .update({ name, updated_at: new Date().toISOString() })
      .eq('id', timetableId)

    if (error) {
      console.error('updateTimetableNameAction update error', error)
      return makeError('시간표 이름을 수정하지 못했습니다.')
    }

    revalidatePath(MANAGER_CLASSES_PATH)

    return {
      status: 'success',
      message: '시간표 이름을 변경했습니다.',
      timetable: {
        id: timetableId,
        name,
      },
    }
  } catch (error) {
    console.error('updateTimetableNameAction unexpected error', error)
    return makeError('시간표 이름 변경 중 오류가 발생했습니다.')
  }
}

export async function deleteTimetableAction(input: DeleteTimetableInput): Promise<DeleteTimetableResult> {
  const profile = await ensureManagerProfile()

  if (!profile) {
    return makeError('시간표를 삭제할 권한이 없습니다.')
  }

  const parsed = deleteTimetableSchema.safeParse(input)

  if (!parsed.success) {
    return makeError(parsed.error.flatten().formErrors[0] ?? '입력값을 다시 확인해주세요.')
  }

  const supabase = createAdminClient()

  try {
    const { error } = await supabase
      .from('timetables')
      .delete()
      .eq('id', parsed.data.timetableId)

    if (error) {
      console.error('deleteTimetableAction delete error', error)
      return makeError('시간표를 삭제하지 못했습니다.')
    }

    revalidatePath(MANAGER_CLASSES_PATH)

    return {
      status: 'success',
      message: '시간표를 삭제했습니다.',
      deletedId: parsed.data.timetableId,
    }
  } catch (error) {
    console.error('deleteTimetableAction unexpected error', error)
    return makeError('시간표 삭제 중 오류가 발생했습니다.')
  }
}
