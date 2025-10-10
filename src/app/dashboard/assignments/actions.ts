'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { getAuthContext } from '@/lib/auth'
import { createClient as createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const uuidSchema = z
  .string()
  .min(1, { message: 'ID가 필요합니다.' })
  .uuid('유효한 ID 형식이 아닙니다.')

const createAssignmentInputSchema = z
  .object({
    workbookId: uuidSchema,
    dueAt: z
      .string()
      .optional()
      .transform((value, ctx) => {
        if (!value) {
          return null
        }

        const trimmed = value.trim()
        if (!trimmed) {
          return null
        }

        const parsed = new Date(trimmed)
        if (Number.isNaN(parsed.getTime())) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['dueAt'],
            message: '유효한 마감일이 아닙니다.',
          })
          return null
        }

        return parsed.toISOString()
      }),
    targetClassIds: z.array(uuidSchema).optional().transform((value) => [...new Set(value ?? [])]),
    targetStudentIds: z.array(uuidSchema).optional().transform((value) => [...new Set(value ?? [])]),
  })
  .superRefine((value, ctx) => {
    const classCount = value.targetClassIds?.length ?? 0
    const studentCount = value.targetStudentIds?.length ?? 0

    if (classCount === 0 && studentCount === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['targetClassIds'],
        message: '반 또는 학생을 최소 1개 이상 선택해주세요.',
      })
    }
  })

export type CreateAssignmentInput = z.infer<typeof createAssignmentInputSchema>

interface AssignmentTargetRow {
  assignment_id: string
  class_id?: string | null
  student_id?: string | null
}

function chunkArray<T>(items: T[], size: number): T[][] {
  if (size <= 0 || items.length === 0) {
    return items.length > 0 ? [items] : []
  }

  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

function deriveTargetScope(classCount: number, studentCount: number) {
  if (classCount > 0 && studentCount > 0) {
    return 'mixed'
  }

  if (classCount > 0) {
    return 'class'
  }

  return 'student'
}

export async function createAssignment(input: CreateAssignmentInput) {
  let parsedInput: ReturnType<typeof createAssignmentInputSchema.parse>

  try {
    parsedInput = createAssignmentInputSchema.parse(input)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        error: error.issues[0]?.message ?? '입력 값을 확인해주세요.',
      }
    }

    return { error: '입력 값을 확인해주세요.' }
  }

  const { workbookId, dueAt, targetClassIds = [], targetStudentIds = [] } = parsedInput

  const supabase = createServerSupabase()
  const { profile } = await getAuthContext()
  const writeClient = profile?.role === 'principal' ? createAdminClient() : supabase

  const canAssignRoles = new Set(['teacher', 'principal'])

  if (!profile || !canAssignRoles.has(profile.role)) {
    return { error: '과제를 생성할 권한이 없습니다.' }
  }

  try {
    const { data: workbook, error: workbookError } = await supabase
      .from('workbooks')
      .select('id, teacher_id')
      .eq('id', workbookId)
      .maybeSingle()

    if (workbookError) {
      console.error('[createAssignment] failed to fetch workbook', workbookError)
      return { error: '문제집 정보를 불러오지 못했습니다.' }
    }

    if (!workbook) {
      return { error: '해당 문제집을 찾을 수 없습니다.' }
    }

    const accessibleClassIds = new Set<string>()

    if (profile.role === 'principal') {
      const { data: allClasses, error: allClassesError } = await supabase
        .from('classes')
        .select('id')

      if (allClassesError) {
        console.error('[createAssignment] failed to load classes for principal', allClassesError)
        return { error: '반 정보를 불러오지 못했습니다.' }
      }

      allClasses?.forEach((row) => {
        if (row?.id) {
          accessibleClassIds.add(row.id)
        }
      })
    } else {
      const { data: teacherClasses, error: teacherClassesError } = await supabase
        .from('class_teachers')
        .select('class_id')
        .eq('teacher_id', profile.id)

      if (teacherClassesError) {
        console.error('[createAssignment] failed to load class assignments', teacherClassesError)
        return { error: '반 정보를 불러오지 못했습니다.' }
      }

      teacherClasses?.forEach((row) => {
        if (row?.class_id) {
          accessibleClassIds.add(row.class_id)
        }
      })
    }

    const invalidClassId = targetClassIds.find((classId) => !accessibleClassIds.has(classId))

    if (invalidClassId) {
      return { error: '선택한 반 중 접근할 수 없는 반이 있습니다.' }
    }

    let classStudents: Array<{ class_id: string; student_id: string }> = []

    if (profile.role === 'principal') {
      const { data: allClassStudents, error: allClassStudentsError } = await supabase
        .from('class_students')
        .select('class_id, student_id')

      if (allClassStudentsError) {
        console.error('[createAssignment] failed to load all class students', allClassStudentsError)
        return { error: '반 학생 정보를 불러오지 못했습니다.' }
      }

      classStudents = allClassStudents ?? []
    } else if (accessibleClassIds.size > 0) {
      const { data: classStudentRows, error: classStudentsError } = await supabase
        .from('class_students')
        .select('class_id, student_id')
        .in('class_id', Array.from(accessibleClassIds))

      if (classStudentsError) {
        console.error('[createAssignment] failed to load class students', classStudentsError)
        return { error: '반 학생 정보를 불러오지 못했습니다.' }
      }

      classStudents = classStudentRows ?? []
    }

    const studentsByClass = new Map<string, Set<string>>()

    for (const row of classStudents) {
      const current = studentsByClass.get(row.class_id) ?? new Set<string>()
      current.add(row.student_id)
      studentsByClass.set(row.class_id, current)
    }

    const studentsFromClasses = new Set<string>()
    const studentClassAssignments = new Map<string, string>()

    for (const classId of targetClassIds) {
      const students = studentsByClass.get(classId)
      if (!students) {
        continue
      }
      students.forEach((studentId) => {
        studentsFromClasses.add(studentId)
        if (!studentClassAssignments.has(studentId)) {
          studentClassAssignments.set(studentId, classId)
        }
      })
    }

    const resolveAccessibleClassForStudent = (studentId: string) => {
      for (const [classId, students] of studentsByClass.entries()) {
        if (students.has(studentId)) {
          return classId
        }
      }
      return null
    }

    const invalidStudentId = targetStudentIds.find((studentId) => {
      if (studentsFromClasses.has(studentId)) {
        return false
      }

      for (const studentSet of studentsByClass.values()) {
        if (studentSet.has(studentId)) {
          return false
        }
      }

      return true
    })

    if (invalidStudentId) {
      return { error: '선택한 학생 중 담당 반에 속하지 않은 학생이 있습니다.' }
    }

    const studentIdsForTasks = new Set<string>()
    studentsFromClasses.forEach((studentId) => studentIdsForTasks.add(studentId))
    targetStudentIds.forEach((studentId) => {
      studentIdsForTasks.add(studentId)
      if (!studentClassAssignments.has(studentId)) {
        const inferredClassId = resolveAccessibleClassForStudent(studentId)
        if (inferredClassId) {
          studentClassAssignments.set(studentId, inferredClassId)
        }
      }
    })

    if (studentIdsForTasks.size === 0) {
      return { error: '선택한 대상에 학생이 없습니다. 반 구성원을 확인해주세요.' }
    }

    const targetScope = deriveTargetScope(targetClassIds.length, targetStudentIds.length)

    const { data: assignment, error: assignmentError } = await writeClient
      .from('assignments')
      .insert({
        workbook_id: workbookId,
        assigned_by: profile.id,
        due_at: dueAt,
        target_scope: targetScope,
      })
      .select('id')
      .maybeSingle()

    if (assignmentError || !assignment) {
      console.error('[createAssignment] failed to insert assignment', assignmentError)
      return { error: '과제 생성 중 오류가 발생했습니다.' }
    }

    const assignmentId = assignment.id

    const targetRows: AssignmentTargetRow[] = []

    targetClassIds.forEach((classId) => {
      targetRows.push({ assignment_id: assignmentId, class_id: classId })
    })

    const classStudentSet = new Set<string>(studentsFromClasses)

    targetStudentIds.forEach((studentId) => {
      if (!classStudentSet.has(studentId)) {
        targetRows.push({ assignment_id: assignmentId, student_id: studentId })
      }
    })

    let insertedTargetIds: string[] = []

    if (targetRows.length > 0) {
      const { data: insertedTargets, error: targetsError } = await writeClient
        .from('assignment_targets')
        .insert(targetRows)
        .select('id')

      if (targetsError) {
        console.error('[createAssignment] failed to insert assignment targets', targetsError)
        await writeClient.from('assignments').delete().eq('id', assignmentId)
        return { error: '과제 대상 저장 중 오류가 발생했습니다.' }
      }

      insertedTargetIds = (insertedTargets ?? []).map((row) => row.id)
    }

    const taskRows = Array.from(studentIdsForTasks).map((studentId) => ({
      assignment_id: assignmentId,
      student_id: studentId,
      class_id: studentClassAssignments.get(studentId) ?? null,
    }))

    const { data: insertedTasks, error: tasksError } = await writeClient
      .from('student_tasks')
      .insert(taskRows)
      .select('id')

    if (tasksError) {
      console.error('[createAssignment] failed to insert student tasks', tasksError)

      if (insertedTargetIds.length > 0) {
        await writeClient.from('assignment_targets').delete().in('id', insertedTargetIds)
      }

      await writeClient.from('assignments').delete().eq('id', assignmentId)

      return { error: '학생 과제 생성 중 오류가 발생했습니다.' }
    }

    if (!insertedTasks || insertedTasks.length === 0) {
      if (insertedTargetIds.length > 0) {
        await writeClient.from('assignment_targets').delete().in('id', insertedTargetIds)
      }
      await writeClient.from('assignments').delete().eq('id', assignmentId)
      return { error: '학생 과제가 생성되지 않았습니다. 다시 시도해주세요.' }
    }

    const insertedTaskIds = insertedTasks.map((row) => row.id)

    const rollbackAssignment = async () => {
      await writeClient.from('assignments').delete().eq('id', assignmentId)
    }

    const { data: workbookItems, error: workbookItemsError } = await writeClient
      .from('workbook_items')
      .select('id')
      .eq('workbook_id', workbookId)
      .order('position')

    if (workbookItemsError) {
      console.error('[createAssignment] failed to load workbook items', workbookItemsError)
      await rollbackAssignment()
      return { error: '문제집 문항 정보를 불러오지 못했습니다.' }
    }

    if (workbookItems && workbookItems.length > 0) {
      const taskItemRows = insertedTaskIds.flatMap((studentTaskId) =>
        workbookItems.map((item) => ({ student_task_id: studentTaskId, item_id: item.id }))
      )

      const batches = chunkArray(taskItemRows, 500)

      for (const batch of batches) {
        if (batch.length === 0) {
          continue
        }

        const { error: taskItemsError } = await writeClient.from('student_task_items').insert(batch)

        if (taskItemsError) {
          console.error('[createAssignment] failed to insert student_task_items', taskItemsError)
          await rollbackAssignment()
          return { error: '학생 과제 문항 생성 중 오류가 발생했습니다.' }
        }
      }
    }

    const pathsToRevalidate = ['/dashboard/teacher']
    pathsToRevalidate.forEach((path) => revalidatePath(path))

    return {
      success: true as const,
      assignmentId,
      studentCount: insertedTasks.length,
    }
  } catch (error) {
    console.error('[createAssignment] unexpected error', error)
    return { error: '과제 생성 중 예상치 못한 오류가 발생했습니다.' }
  }
}
