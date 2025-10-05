'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { getAuthContext } from '@/lib/auth'
import type { UserProfile } from '@/lib/supabase'
import { createClient as createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

function isTeacherOrPrincipal(profile: UserProfile | null | undefined): profile is UserProfile {
  return Boolean(profile && (profile.role === 'teacher' || profile.role === 'principal'))
}

function canManageAssignment(profile: UserProfile, assignedBy: string | null | undefined) {
  if (profile.role === 'principal') {
    return true
  }
  return Boolean(assignedBy && assignedBy === profile.id)
}

const evaluationSchema = z.object({
  assignmentId: z.string().uuid('유효한 과제 ID가 아닙니다.'),
  studentTaskId: z.string().uuid('유효한 학생 과제 ID가 아닙니다.'),
  studentTaskItemId: z.string().uuid('유효한 문항 ID가 아닙니다.'),
  submissionId: z.string().uuid('유효한 제출 ID가 아닙니다.'),
  score: z.enum(['pass', 'nonpass']),
  feedback: z
    .string()
    .max(2000, '피드백은 2000자 이하로 입력해주세요.')
    .optional(),
})

type EvaluationInput = z.infer<typeof evaluationSchema>

export async function evaluateSubmission(input: EvaluationInput) {
  const { profile } = await getAuthContext()

  if (!isTeacherOrPrincipal(profile)) {
    return { error: '교사 또는 원장 계정으로만 평가할 수 있습니다.' }
  }

  const parsed = evaluationSchema.safeParse(input)

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]
    return { error: firstIssue?.message ?? '평가 정보를 확인해주세요.' }
  }

  const payload = parsed.data
  const supabase = createServerSupabase()

  try {
    const { data: studentTask, error: fetchTaskError } = await supabase
      .from('student_tasks')
      .select(
        'id, status, completion_at, assignment_id, assignments:assignments!student_tasks_assignment_id_fkey(id, assigned_by), profiles!student_tasks_student_id_fkey(class_id)'
      )
      .eq('id', payload.studentTaskId)
      .maybeSingle()

    if (fetchTaskError) {
      console.error('[teacher] evaluateSubmission fetch task error', fetchTaskError)
      return { error: '과제 정보를 불러오지 못했습니다.' }
    }

    if (!studentTask || studentTask.assignment_id !== payload.assignmentId) {
      return { error: '평가할 과제 정보를 확인할 수 없습니다.' }
    }

    const assignment = Array.isArray(studentTask.assignments)
      ? studentTask.assignments[0]
      : studentTask.assignments

    if (!assignment || !canManageAssignment(profile, assignment.assigned_by)) {
      return { error: '해당 과제에 대한 평가 권한이 없습니다.' }
    }

    const studentProfile = Array.isArray(studentTask.profiles) ? studentTask.profiles[0] : studentTask.profiles
    const classId = studentProfile?.class_id ?? null

    const now = new Date().toISOString()

    const { error: updateSubmissionError } = await supabase
      .from('task_submissions')
      .update({
        score: payload.score,
        feedback: payload.feedback ?? null,
        evaluated_by: profile.id,
        evaluated_at: now,
        updated_at: now,
      })
      .eq('id', payload.submissionId)
      .eq('student_task_id', payload.studentTaskId)

    if (updateSubmissionError) {
      console.error('[teacher] evaluateSubmission update submission error', updateSubmissionError)
      return { error: '평가 결과 저장 중 오류가 발생했습니다.' }
    }

    const pass = payload.score === 'pass'

    const { error: updateItemError } = await supabase
      .from('student_task_items')
      .update({
        completed_at: pass ? now : null,
        last_result: pass ? 'pass' : 'nonpass',
        updated_at: now,
      })
      .eq('id', payload.studentTaskItemId)
      .eq('student_task_id', payload.studentTaskId)

    if (updateItemError) {
      console.error('[teacher] evaluateSubmission update task item error', updateItemError)
      return { error: '문항 상태 업데이트에 실패했습니다.' }
    }

    if (studentTask.status !== 'canceled') {
      const { data: taskItems, error: itemsError } = await supabase
        .from('student_task_items')
        .select('id, completed_at')
        .eq('student_task_id', payload.studentTaskId)

      if (itemsError) {
        console.error('[teacher] evaluateSubmission task item scan error', itemsError)
        return { error: '과제 진행 상태를 확인하지 못했습니다.' }
      }

      const totalCount = taskItems?.length ?? 0
      const remainingCount = taskItems?.filter((item) => !item.completed_at).length ?? 0
      const completedCount = totalCount - remainingCount
      const isCompleted = remainingCount === 0 && totalCount > 0
      const hasProgress = completedCount > 0

      let nextStatus = studentTask.status
      let completionAt = studentTask.completion_at

      if (isCompleted) {
        nextStatus = 'completed'
        completionAt = completionAt ?? now
      } else {
        completionAt = null
        if (studentTask.status === 'completed') {
          nextStatus = hasProgress ? 'in_progress' : 'pending'
        } else if (studentTask.status === 'pending' || studentTask.status === 'not_started') {
          nextStatus = hasProgress ? 'in_progress' : 'pending'
        } else {
          nextStatus = 'in_progress'
        }
      }

      const { error: updateTaskError } = await supabase
        .from('student_tasks')
        .update({
          status: nextStatus,
          completion_at: completionAt,
          updated_at: now,
        })
        .eq('id', payload.studentTaskId)

      if (updateTaskError) {
        console.error('[teacher] evaluateSubmission update student task error', updateTaskError)
        return { error: '과제 상태 업데이트에 실패했습니다.' }
      }
    }

    revalidatePath('/dashboard/teacher')
    revalidatePath('/dashboard/principal')
    revalidatePath(`/dashboard/teacher/assignments/${payload.assignmentId}`)
    if (classId) {
      revalidatePath(`/dashboard/teacher/review/${classId}`)
    }
    revalidatePath('/dashboard/student', 'layout')
    revalidatePath('/dashboard/student')
    revalidatePath(`/dashboard/student/tasks/${payload.studentTaskId}`)
    return { success: true as const }
  } catch (error) {
    console.error('[teacher] evaluateSubmission unexpected error', error)
    return { error: '평가 처리 중 예상치 못한 문제가 발생했습니다.' }
  }
}

const toggleSchema = z.object({
  assignmentId: z.string().uuid('유효한 과제 ID가 아닙니다.'),
  studentTaskId: z.string().uuid('유효한 학생 과제 ID가 아닙니다.'),
  cancel: z.boolean(),
})

type ToggleInput = z.infer<typeof toggleSchema>

export async function toggleStudentTaskStatus(input: ToggleInput) {
  const { profile } = await getAuthContext()

  if (!isTeacherOrPrincipal(profile)) {
    return { error: '교사 또는 원장 계정으로만 변경할 수 있습니다.' }
  }

  const parsed = toggleSchema.safeParse(input)

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]
    return { error: firstIssue?.message ?? '요청 정보를 확인해주세요.' }
  }

  const payload = parsed.data
  const supabase = createServerSupabase()

  try {
    const { data: studentTask, error: fetchError } = await supabase
      .from('student_tasks')
      .select('id, status, completion_at, assignment_id, assignments:assignments!student_tasks_assignment_id_fkey(id, assigned_by), profiles!student_tasks_student_id_fkey(class_id)')
      .eq('id', payload.studentTaskId)
      .maybeSingle()

    if (fetchError) {
      console.error('[teacher] toggleStudentTaskStatus fetch error', fetchError)
      return { error: '과제 정보를 불러오지 못했습니다.' }
    }

    if (!studentTask || studentTask.assignment_id !== payload.assignmentId) {
      return { error: '학생 과제 정보를 확인할 수 없습니다.' }
    }

    const assignment = Array.isArray(studentTask.assignments)
      ? studentTask.assignments[0]
      : studentTask.assignments

    if (!assignment || !canManageAssignment(profile, assignment.assigned_by)) {
      return { error: '해당 과제에 대한 권한이 없습니다.' }
    }

    const profileRecord = Array.isArray(studentTask.profiles) ? studentTask.profiles[0] : studentTask.profiles
    const classId = profileRecord?.class_id ?? null

    const now = new Date().toISOString()

    if (payload.cancel) {
      const { error: cancelError } = await supabase
        .from('student_tasks')
        .update({ status: 'canceled', completion_at: null, updated_at: now })
        .eq('id', payload.studentTaskId)

      if (cancelError) {
        console.error('[teacher] toggleStudentTaskStatus cancel error', cancelError)
        return { error: '과제 취소 중 오류가 발생했습니다.' }
      }
    } else {
      const { data: taskItems, error: itemsError } = await supabase
        .from('student_task_items')
        .select('id, completed_at')
        .eq('student_task_id', payload.studentTaskId)

      if (itemsError) {
        console.error('[teacher] toggleStudentTaskStatus items error', itemsError)
        return { error: '과제 항목 정보를 확인하지 못했습니다.' }
      }

      const totalCount = taskItems?.length ?? 0
      const remainingCount = taskItems?.filter((item) => !item.completed_at).length ?? 0
      const completedCount = totalCount - remainingCount
      const isCompleted = remainingCount === 0 && totalCount > 0
      const hasProgress = completedCount > 0

      const nextStatus = isCompleted ? 'completed' : hasProgress ? 'in_progress' : 'pending'
      const completionAt = isCompleted ? studentTask.completion_at ?? now : null

      const { error: reopenError } = await supabase
        .from('student_tasks')
        .update({ status: nextStatus, completion_at: completionAt, updated_at: now })
        .eq('id', payload.studentTaskId)

      if (reopenError) {
        console.error('[teacher] toggleStudentTaskStatus reopen error', reopenError)
        return { error: '과제 상태 변경에 실패했습니다.' }
      }
    }

    revalidatePath('/dashboard/teacher')
    revalidatePath('/dashboard/principal')
    revalidatePath(`/dashboard/teacher/assignments/${payload.assignmentId}`)
    if (classId) {
      revalidatePath(`/dashboard/teacher/review/${classId}`)
    }
    return { success: true as const }
  } catch (error) {
    console.error('[teacher] toggleStudentTaskStatus unexpected error', error)
    return { error: '상태 변경 중 예상치 못한 문제가 발생했습니다.' }
  }
}

const printRequestSchema = z.object({
  assignmentId: z.string().uuid('유효한 과제 ID가 아닙니다.'),
  studentTaskId: z
    .string()
    .uuid('유효한 학생 과제 ID가 아닙니다.')
    .optional()
    .nullable(),
  desiredDate: z
    .string()
    .optional()
    .transform((value) => (value && value.trim().length > 0 ? value : null)),
  desiredPeriod: z
    .string()
    .optional()
    .transform((value) => (value && value.trim().length > 0 ? value : null)),
  copies: z.coerce.number().int().min(1, '부수는 1권 이상이어야 합니다.').max(50, '부수는 50권 이하로 입력해주세요.'),
  colorMode: z.enum(['bw', 'color']).default('bw'),
  notes: z
    .string()
    .max(500, '요청 메모는 500자 이하로 입력해주세요.')
    .optional(),
})

type PrintRequestInput = z.infer<typeof printRequestSchema>

export async function createPrintRequest(input: PrintRequestInput) {
  const { profile } = await getAuthContext()

  if (!isTeacherOrPrincipal(profile)) {
    return { error: '교사 또는 원장 계정으로만 인쇄를 요청할 수 있습니다.' }
  }

  const parsed = printRequestSchema.safeParse(input)

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]
    return { error: firstIssue?.message ?? '요청 정보를 확인해주세요.' }
  }

  const payload = parsed.data
  const supabase = createServerSupabase()

  try {
    const { data: assignment, error: fetchError } = await supabase
      .from('assignments')
      .select('id, assigned_by')
      .eq('id', payload.assignmentId)
      .maybeSingle()

    if (fetchError) {
      console.error('[teacher] createPrintRequest fetch error', fetchError)
      return { error: '과제 정보를 불러오지 못했습니다.' }
    }

    if (!assignment || !canManageAssignment(profile, assignment.assigned_by)) {
      return { error: '해당 과제에 대한 인쇄 권한이 없습니다.' }
    }

    if (payload.studentTaskId) {
      const { data: studentTask, error: studentTaskError } = await supabase
        .from('student_tasks')
        .select('id, assignment_id')
        .eq('id', payload.studentTaskId)
        .maybeSingle()

      if (studentTaskError) {
        console.error('[teacher] createPrintRequest task error', studentTaskError)
        return { error: '학생 과제 정보를 확인하지 못했습니다.' }
      }

      if (!studentTask || studentTask.assignment_id !== payload.assignmentId) {
        return { error: '해당 학생 과제를 찾을 수 없습니다.' }
      }
    }

    const desiredDate = payload.desiredDate ? new Date(payload.desiredDate) : null
    const formattedDate = desiredDate ? desiredDate.toISOString().slice(0, 10) : null

    const { error: insertError } = await supabase.from('print_requests').insert({
      assignment_id: payload.assignmentId,
      student_task_id: payload.studentTaskId ?? null,
      teacher_id: profile.id,
      desired_date: formattedDate,
      desired_period: payload.desiredPeriod ?? null,
      copies: payload.copies,
      color_mode: payload.colorMode,
      status: 'requested',
      notes: payload.notes ?? null,
    })

    if (insertError) {
      console.error('[teacher] createPrintRequest insert error', insertError)
      return { error: '인쇄 요청 저장 중 오류가 발생했습니다.' }
    }

    revalidatePath('/dashboard/teacher')
    revalidatePath('/dashboard/principal')
    revalidatePath(`/dashboard/teacher/assignments/${payload.assignmentId}`)
    revalidatePath('/dashboard/manager')
    return { success: true as const }
  } catch (error) {
    console.error('[teacher] createPrintRequest unexpected error', error)
    return { error: '인쇄 요청 처리 중 예상치 못한 문제가 발생했습니다.' }
  }
}

const deleteStudentSchema = z.object({
  assignmentId: z.string().uuid('유효한 과제 ID가 아닙니다.'),
  studentTaskId: z.string().uuid('유효한 학생 과제 ID가 아닙니다.'),
})

type DeleteStudentInput = z.infer<typeof deleteStudentSchema>

export async function deleteStudentTask(input: DeleteStudentInput) {
  const { profile } = await getAuthContext()

  if (!isTeacherOrPrincipal(profile)) {
    return { error: '교사 또는 원장 계정으로만 삭제할 수 있습니다.' }
  }

  const parsed = deleteStudentSchema.safeParse(input)
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]
    return { error: firstIssue?.message ?? '삭제할 학생 과제 정보를 확인해주세요.' }
  }

  const payload = parsed.data
  const admin = createAdminClient()

  try {
    const { data: studentTask, error: fetchTaskError } = await admin
      .from('student_tasks')
      .select(
        'id, assignment_id, student_id, assignments:assignments!student_tasks_assignment_id_fkey(id, assigned_by), profiles!student_tasks_student_id_fkey(class_id)'
      )
      .eq('id', payload.studentTaskId)
      .maybeSingle()

    if (fetchTaskError) {
      console.error('[teacher] deleteStudentTask fetch error', fetchTaskError)
      return { error: '학생 과제 정보를 불러오지 못했습니다.' }
    }

    if (!studentTask || studentTask.assignment_id !== payload.assignmentId) {
      return { error: '학생 과제 정보를 확인할 수 없습니다.' }
    }

    const assignment = Array.isArray(studentTask.assignments)
      ? studentTask.assignments[0]
      : studentTask.assignments

    if (!assignment || !canManageAssignment(profile, assignment.assigned_by)) {
      return { error: '해당 과제에 대한 삭제 권한이 없습니다.' }
    }

    const profileRecord = Array.isArray(studentTask.profiles) ? studentTask.profiles[0] : studentTask.profiles
    const classId = profileRecord?.class_id ?? null

    const deleteResult = await deleteStudentTaskCascade(payload.studentTaskId)
    if (deleteResult.error) {
      return deleteResult
    }

    revalidatePath('/dashboard/teacher')
    revalidatePath('/dashboard/principal')
    revalidatePath(`/dashboard/teacher/assignments/${payload.assignmentId}`)
    if (classId) {
      revalidatePath(`/dashboard/teacher/review/${classId}`)
    }
    return { success: true as const }
  } catch (error) {
    console.error('[teacher] deleteStudentTask unexpected error', error)
    return { error: '학생 과제 삭제 중 문제가 발생했습니다.' }
  }
}

const deleteTargetSchema = z.object({
  assignmentId: z.string().uuid('유효한 과제 ID가 아닙니다.'),
  classId: z.string().uuid('유효한 반 ID가 아닙니다.'),
})

type DeleteTargetInput = z.infer<typeof deleteTargetSchema>

export async function deleteAssignmentTarget(input: DeleteTargetInput) {
  const { profile } = await getAuthContext()

  if (!isTeacherOrPrincipal(profile)) {
    return { error: '교사 또는 원장 계정만 과제를 삭제할 수 있습니다.' }
  }

  const parsed = deleteTargetSchema.safeParse(input)
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]
    return { error: firstIssue?.message ?? '삭제할 반 정보를 확인해주세요.' }
  }

  const payload = parsed.data
  const admin = createAdminClient()

  try {
    const { data: target, error: fetchTargetError } = await admin
      .from('assignment_targets')
      .select('id, assignment_id, class_id, assignments(id, assigned_by)')
      .eq('assignment_id', payload.assignmentId)
      .eq('class_id', payload.classId)
      .maybeSingle()

    if (fetchTargetError) {
      console.error('[teacher] deleteAssignmentTarget fetch error', fetchTargetError)
      return { error: '과제 대상 정보를 불러오지 못했습니다.' }
    }

    if (!target || target.assignment_id !== payload.assignmentId) {
      return { error: '삭제할 반 과제 정보를 찾을 수 없습니다.' }
    }

    const assignment = Array.isArray(target.assignments) ? target.assignments[0] : target.assignments
    if (!assignment || !canManageAssignment(profile, assignment.assigned_by)) {
      return { error: '해당 과제에 대한 삭제 권한이 없습니다.' }
    }

    const { data: tasks, error: fetchTasksError } = await admin
      .from('student_tasks')
      .select('id, student_id, profiles!student_tasks_student_id_fkey(class_id)')
      .eq('assignment_id', payload.assignmentId)

    if (fetchTasksError) {
      console.error('[teacher] deleteAssignmentTarget task list error', fetchTasksError)
      return { error: '학생 과제 목록을 확인하지 못했습니다.' }
    }

    const impactedStudentIds = new Set<string>()
    const studentTaskIds = (tasks ?? [])
      .filter((task) => {
        const profileRecord = Array.isArray(task.profiles) ? task.profiles[0] : task.profiles
        if (profileRecord?.class_id === payload.classId) {
          if (task.student_id) {
            impactedStudentIds.add(task.student_id)
          }
          return true
        }
        return false
      })
      .map((task) => task.id)

    if (studentTaskIds.length > 0) {
      const deleteResults = await Promise.all(
        studentTaskIds.map((studentTaskId) => deleteStudentTaskCascade(studentTaskId))
      )
      const failed = deleteResults.find((result) => result.error)
      if (failed?.error) {
        return failed
      }
    }

    const { error: deleteTargetError } = await admin
      .from('assignment_targets')
      .delete()
      .eq('assignment_id', payload.assignmentId)
      .eq('class_id', payload.classId)

    if (deleteTargetError) {
      console.error('[teacher] deleteAssignmentTarget delete error', deleteTargetError)
      return { error: '반 대상 삭제 중 오류가 발생했습니다.' }
    }

    revalidatePath('/dashboard/teacher')
    revalidatePath('/dashboard/principal')
    revalidatePath(`/dashboard/teacher/assignments/${payload.assignmentId}`)
    revalidatePath(`/dashboard/teacher/review/${payload.classId}`)
    revalidatePath('/dashboard/manager')
    if (impactedStudentIds.size > 0) {
      revalidatePath('/dashboard/student', 'layout')
      revalidatePath('/dashboard/student')
    }
    return { success: true as const }
  } catch (error) {
    console.error('[teacher] deleteAssignmentTarget unexpected error', error)
    return { error: '반 과제 삭제 중 문제가 발생했습니다.' }
  }
}

async function deleteStudentTaskCascade(studentTaskId: string): Promise<{ success?: true; error?: string }> {
  const admin = createAdminClient()

  const { error: deleteSubmissionsError } = await admin
    .from('task_submissions')
    .delete()
    .eq('student_task_id', studentTaskId)

  if (deleteSubmissionsError) {
    console.error('[teacher] deleteStudentTask submissions error', deleteSubmissionsError)
    return { error: '학생 제출물 삭제 중 오류가 발생했습니다.' }
  }

  const { error: deleteItemsError } = await admin
    .from('student_task_items')
    .delete()
    .eq('student_task_id', studentTaskId)

  if (deleteItemsError) {
    console.error('[teacher] deleteStudentTask items error', deleteItemsError)
    return { error: '학생 과제 문항 삭제 중 오류가 발생했습니다.' }
  }

  const { error: deletePrintsError } = await admin
    .from('print_requests')
    .delete()
    .eq('student_task_id', studentTaskId)

  if (deletePrintsError) {
    console.error('[teacher] deleteStudentTask print error', deletePrintsError)
    return { error: '인쇄 요청 삭제 중 오류가 발생했습니다.' }
  }

  const { error: deleteTaskError } = await admin
    .from('student_tasks')
    .delete()
    .eq('id', studentTaskId)

  if (deleteTaskError) {
    console.error('[teacher] deleteStudentTask task error', deleteTaskError)
    return { error: '학생 과제 삭제 중 오류가 발생했습니다.' }
  }

  return { success: true as const }
}
