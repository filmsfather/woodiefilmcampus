'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { ensureManagerProfile } from '@/lib/authz'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  createClassSchema,
  updateClassSchema,
  type CreateClassInput,
} from '@/lib/validation/class'

import type { ActionState } from './action-state'

const MANAGER_CLASSES_PATH = '/dashboard/manager/classes'

function collectIds(formData: FormData, key: string) {
  return formData
    .getAll(key)
    .map((value) => value?.toString().trim())
    .filter((value): value is string => Boolean(value))
}

function parseCreatePayload(formData: FormData) {
  const payload = {
    name: formData.get('name')?.toString() ?? '',
    description: formData.get('description')?.toString(),
    homeroomTeacherId: formData.get('homeroomTeacherId')?.toString() ?? '',
    teacherIds: collectIds(formData, 'teacherIds'),
    studentIds: collectIds(formData, 'studentIds'),
  }

  const result = createClassSchema.safeParse(payload)

  if (!result.success) {
    return { success: false as const, error: result.error.flatten().fieldErrors }
  }

  return { success: true as const, data: result.data }
}

function parseUpdatePayload(formData: FormData) {
  const payload = {
    classId: formData.get('classId')?.toString() ?? '',
    name: formData.get('name')?.toString() ?? '',
    description: formData.get('description')?.toString(),
    homeroomTeacherId: formData.get('homeroomTeacherId')?.toString() ?? '',
    teacherIds: collectIds(formData, 'teacherIds'),
    studentIds: collectIds(formData, 'studentIds'),
  }

  const result = updateClassSchema.safeParse(payload)

  if (!result.success) {
    return { success: false as const, error: result.error.flatten().fieldErrors }
  }

  return { success: true as const, data: result.data }
}

function buildTeacherRows(input: Pick<CreateClassInput, 'teacherIds' | 'homeroomTeacherId'>) {
  const teacherSet = new Set(input.teacherIds)
  teacherSet.add(input.homeroomTeacherId)

  return Array.from(teacherSet).map((teacherId) => ({
    teacher_id: teacherId,
    is_homeroom: teacherId === input.homeroomTeacherId,
  }))
}

function buildStudentRows(studentIds: string[]) {
  return Array.from(new Set(studentIds)).map((studentId) => ({
    student_id: studentId,
  }))
}

function makeErrorState(message: string, fieldErrors?: Record<string, string[]>) {
  return {
    status: 'error' as const,
    message,
    fieldErrors,
  }
}

function makeSuccessState(message: string) {
  return {
    status: 'success' as const,
    message,
  }
}

export async function createClassAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const canManage = await ensureManagerProfile()

  if (!canManage) {
    return makeErrorState('반을 생성할 권한이 없습니다.')
  }

  const parsed = parseCreatePayload(formData)

  if (!parsed.success) {
    return makeErrorState('입력값을 다시 확인해주세요.', parsed.error)
  }

  const supabase = createAdminClient()
  const { name, description, homeroomTeacherId, teacherIds, studentIds } = parsed.data

  try {
    const { data: createdClass, error: createError } = await supabase
      .from('classes')
      .insert({
        name,
        description,
        homeroom_teacher_id: homeroomTeacherId,
      })
      .select('id')
      .maybeSingle()

    if (createError || !createdClass) {
      console.error('createClassAction insert error', createError)
      return makeErrorState('반 생성 중 오류가 발생했습니다.')
    }

    const classId = createdClass.id
    const teacherRows = buildTeacherRows({ teacherIds, homeroomTeacherId }).map((row) => ({
      class_id: classId,
      ...row,
    }))

    if (teacherRows.length > 0) {
      const { error: teacherInsertError } = await supabase
        .from('class_teachers')
        .insert(teacherRows)

      if (teacherInsertError) {
        console.error('createClassAction class_teachers insert error', teacherInsertError)
        return makeErrorState('담당 교사 정보를 저장하지 못했습니다.')
      }
    }

    const studentRows = buildStudentRows(studentIds).map((row) => ({
      class_id: classId,
      ...row,
    }))

    if (studentRows.length > 0) {
      const { error: studentInsertError } = await supabase
        .from('class_students')
        .insert(studentRows)

      if (studentInsertError) {
        console.error('createClassAction class_students insert error', studentInsertError)
        return makeErrorState('학생 배정 정보를 저장하지 못했습니다.')
      }
    }

    revalidatePath(MANAGER_CLASSES_PATH)
    return makeSuccessState('새 반을 생성했습니다.')
  } catch (error) {
    console.error('createClassAction unexpected error', error)
    return makeErrorState('반 생성 중 예상치 못한 오류가 발생했습니다.')
  }
}

export async function updateClassAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const canManage = await ensureManagerProfile()

  if (!canManage) {
    return makeErrorState('반을 수정할 권한이 없습니다.')
  }

  const parsed = parseUpdatePayload(formData)

  if (!parsed.success) {
    return makeErrorState('입력값을 다시 확인해주세요.', parsed.error)
  }

  const supabase = createAdminClient()
  const { classId, name, description, homeroomTeacherId, teacherIds, studentIds } = parsed.data

  try {
    const { error: updateError } = await supabase
      .from('classes')
      .update({
        name,
        description,
        homeroom_teacher_id: homeroomTeacherId,
      })
      .eq('id', classId)

    if (updateError) {
      console.error('updateClassAction update error', updateError)
      return makeErrorState('반 정보를 수정하지 못했습니다.')
    }

    const teacherRows = buildTeacherRows({ teacherIds, homeroomTeacherId }).map((row) => ({
      class_id: classId,
      ...row,
    }))

    const { error: deleteTeachersError } = await supabase
      .from('class_teachers')
      .delete()
      .eq('class_id', classId)

    if (deleteTeachersError) {
      console.error('updateClassAction delete class_teachers error', deleteTeachersError)
      return makeErrorState('기존 담당 교사 정보를 정리하지 못했습니다.')
    }

    if (teacherRows.length > 0) {
      const { error: insertTeachersError } = await supabase
        .from('class_teachers')
        .insert(teacherRows)

      if (insertTeachersError) {
        console.error('updateClassAction insert class_teachers error', insertTeachersError)
        return makeErrorState('담당 교사 정보를 저장하지 못했습니다.')
      }
    }

    const studentRows = buildStudentRows(studentIds).map((row) => ({
      class_id: classId,
      ...row,
    }))

    const { error: deleteStudentsError } = await supabase
      .from('class_students')
      .delete()
      .eq('class_id', classId)

    if (deleteStudentsError) {
      console.error('updateClassAction delete class_students error', deleteStudentsError)
      return makeErrorState('기존 학생 배정 정보를 정리하지 못했습니다.')
    }

    if (studentRows.length > 0) {
      const { error: insertStudentsError } = await supabase
        .from('class_students')
        .insert(studentRows)

      if (insertStudentsError) {
        console.error('updateClassAction insert class_students error', insertStudentsError)
        return makeErrorState('학생 배정 정보를 저장하지 못했습니다.')
      }
    }

    revalidatePath(MANAGER_CLASSES_PATH)
    return makeSuccessState('반 정보를 업데이트했습니다.')
  } catch (error) {
    console.error('updateClassAction unexpected error', error)
    return makeErrorState('반 수정 중 예상치 못한 오류가 발생했습니다.')
  }
}

export async function deleteClassAction(classId: string): Promise<ActionState> {
  const canManage = await ensureManagerProfile()

  if (!canManage) {
    return makeErrorState('반을 삭제할 권한이 없습니다.')
  }

  const trimmedId = classId?.trim()

  if (!trimmedId) {
    return makeErrorState('삭제할 반 ID가 필요합니다.')
  }

  const parsedId = z.string().uuid().safeParse(trimmedId)

  if (!parsedId.success) {
    return makeErrorState('유효한 반 ID가 아닙니다.')
  }

  try {
    const supabase = createAdminClient()
    const { error } = await supabase.from('classes').delete().eq('id', parsedId.data)

    if (error) {
      console.error('deleteClassAction delete error', error)
      return makeErrorState('반 삭제 중 오류가 발생했습니다.')
    }

    revalidatePath(MANAGER_CLASSES_PATH)
    return makeSuccessState('반을 삭제했습니다.')
  } catch (error) {
    console.error('deleteClassAction unexpected error', error)
    return makeErrorState('반 삭제 중 예상치 못한 오류가 발생했습니다.')
  }
}
