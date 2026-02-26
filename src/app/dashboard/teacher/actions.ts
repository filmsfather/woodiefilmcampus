'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { getAuthContext } from '@/lib/auth'
import DateUtil from '@/lib/date-util'
import type { UserProfile } from '@/lib/supabase'
import { createClient as createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ClassAssignmentListItem } from '@/components/dashboard/teacher/ClassOverview'

type DeleteResult = {
  success?: true
  error?: string
  message?: string
}

function isTeacherManagerOrPrincipal(profile: UserProfile | null | undefined): profile is UserProfile {
  return Boolean(profile && ['teacher', 'manager', 'principal'].includes(profile.role))
}

function canManageAssignment(profile: UserProfile, assignedBy: string | null | undefined) {
  if (profile.role === 'principal' || profile.role === 'manager') {
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

  if (!isTeacherManagerOrPrincipal(profile)) {
    return { error: '교사·실장·원장 계정으로만 평가할 수 있습니다.' }
  }

  const parsed = evaluationSchema.safeParse(input)

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]
    return { error: firstIssue?.message ?? '평가 정보를 확인해주세요.' }
  }

  const payload = parsed.data
  const supabase = await createServerSupabase()

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
    revalidatePath('/dashboard/student/tasks')
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

const reviewStateSchema = z.object({
  assignmentId: z.string().uuid('유효한 과제 ID가 아닙니다.'),
  studentTaskId: z.string().uuid('유효한 학생 과제 ID가 아닙니다.'),
  statusOverride: z
    .enum(['pending', 'not_started', 'in_progress', 'completed', 'canceled'])
    .nullable()
    .optional(),
  submittedLate: z.boolean(),
})

type UpdateReviewStateInput = z.infer<typeof reviewStateSchema>

export async function toggleStudentTaskStatus(input: ToggleInput) {
  const { profile } = await getAuthContext()

  if (!isTeacherManagerOrPrincipal(profile)) {
    return { error: '교사·실장·원장 계정으로만 변경할 수 있습니다.' }
  }

  const parsed = toggleSchema.safeParse(input)

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]
    return { error: firstIssue?.message ?? '요청 정보를 확인해주세요.' }
  }

  const payload = parsed.data
  const supabase = await createServerSupabase()

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
        .update({ status: 'canceled', completion_at: null, status_override: null, updated_at: now })
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
        .update({ status: nextStatus, completion_at: completionAt, status_override: null, updated_at: now })
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

export async function updateStudentTaskReviewState(input: UpdateReviewStateInput) {
  const { profile } = await getAuthContext()

  if (!isTeacherManagerOrPrincipal(profile)) {
    return { error: '교사·실장·원장 계정으로만 변경할 수 있습니다.' }
  }

  const parsed = reviewStateSchema.safeParse(input)

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]
    return { error: firstIssue?.message ?? '요청 정보를 확인해주세요.' }
  }

  const payload = parsed.data
  const desiredOverride =
    typeof payload.statusOverride === 'undefined' ? null : payload.statusOverride
  const supabase = await createServerSupabase()

  try {
    const { data: studentTask, error: fetchError } = await supabase
      .from('student_tasks')
      .select(
        'id, assignment_id, class_id, assignments:assignments!student_tasks_assignment_id_fkey(id, assigned_by), profiles:profiles!student_tasks_student_id_fkey(class_id)'
      )
      .eq('id', payload.studentTaskId)
      .maybeSingle()

    if (fetchError) {
      console.error('[teacher] updateStudentTaskReviewState fetch error', fetchError)
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
    const classId = studentTask.class_id ?? profileRecord?.class_id ?? null

    const now = new Date().toISOString()
    const { error: updateError } = await supabase
      .from('student_tasks')
      .update({
        status_override: desiredOverride,
        submitted_late: payload.submittedLate,
        updated_at: now,
      })
      .eq('id', payload.studentTaskId)

    if (updateError) {
      console.error('[teacher] updateStudentTaskReviewState update error', updateError)
      return { error: '과제 상태를 저장하지 못했습니다.' }
    }

    revalidatePath('/dashboard/teacher')
    revalidatePath('/dashboard/principal')
    revalidatePath(`/dashboard/teacher/assignments/${payload.assignmentId}`)
    if (classId) {
      revalidatePath(`/dashboard/teacher/review/${classId}`)
    }
    revalidatePath('/dashboard/student', 'layout')
    revalidatePath('/dashboard/student/tasks')
    revalidatePath(`/dashboard/student/tasks/${payload.studentTaskId}`)
    revalidatePath('/dashboard/teacher/learning-journal', 'layout')

    return { success: true as const }
  } catch (error) {
    console.error('[teacher] updateStudentTaskReviewState unexpected error', error)
    return { error: '상태 변경 중 문제가 발생했습니다.' }
  }
}

const printRequestSchema = z
  .object({
    assignmentId: z.string().uuid('유효한 과제 ID가 아닙니다.'),
    studentTaskId: z
      .string()
      .uuid('유효한 학생 과제 ID가 아닙니다.')
      .optional()
      .nullable(),
    studentTaskIds: z
      .array(z.string().uuid('유효한 학생 과제 ID가 아닙니다.'))
      .optional()
      .refine((value) => !value || value.length > 0, {
        message: '인쇄할 학생을 한 명 이상 선택해주세요.',
      }),
    desiredDate: z
      .string()
      .trim()
      .min(1, '희망일을 입력해주세요.')
      .refine((value) => !Number.isNaN(new Date(`${value}T00:00:00`).getTime()), {
        message: '유효한 희망일을 입력해주세요.',
      }),
    desiredPeriod: z
      .string()
      .optional()
      .transform((value) => (value && value.trim().length > 0 ? value : null)),
    copies: z.coerce
      .number()
      .int()
      .min(1, '부수는 1권 이상이어야 합니다.')
      .max(50, '부수는 50권 이하로 입력해주세요.'),
    colorMode: z.enum(['bw', 'color']).default('bw'),
    notes: z
      .string()
      .max(500, '요청 메모는 500자 이하로 입력해주세요.')
      .optional(),
  })

type PrintRequestInput = z.infer<typeof printRequestSchema>

type PrintRequestResult =
  | { success: true; skippedStudents?: string[] }
  | { error: string }

export async function createPrintRequest(input: PrintRequestInput): Promise<PrintRequestResult> {
  const { profile } = await getAuthContext()

  if (!isTeacherManagerOrPrincipal(profile)) {
    return { error: '교사·실장·원장 계정으로만 인쇄를 요청할 수 있습니다.' }
  }

  const parsed = printRequestSchema.safeParse(input)

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]
    return { error: firstIssue?.message ?? '요청 정보를 확인해주세요.' }
  }

  const payload = parsed.data
  const supabase = await createServerSupabase()

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

    const explicitTaskIds = payload.studentTaskIds && payload.studentTaskIds.length > 0
      ? Array.from(new Set(payload.studentTaskIds))
      : payload.studentTaskId
        ? [payload.studentTaskId]
        : []

    const taskQuery = supabase
      .from('student_tasks')
      .select(
        `id,
         assignment_id,
         student_id,
         profiles:profiles!student_tasks_student_id_fkey(id, name),
         task_submissions(
           id,
           submission_type,
           media_asset_id,
           created_at,
           task_submission_assets(id, order_index, media_asset_id, media_asset:media_assets(id, bucket, path, mime_type, metadata))
         )
        `
      )
      .eq('assignment_id', payload.assignmentId)
      .order('created_at', { ascending: false, foreignTable: 'task_submissions' })

    if (explicitTaskIds.length > 0) {
      taskQuery.in('id', explicitTaskIds)
    }

    const { data: taskRows, error: studentTasksError } = await taskQuery

    if (studentTasksError) {
      console.error('[teacher] createPrintRequest student tasks error', studentTasksError)
      return { error: '학생 제출 정보를 불러오지 못했습니다.' }
    }

    const taskList = (taskRows ?? []) as Array<{
      id: string
      assignment_id: string
      student_id: string
      profiles?: { id: string; name: string | null } | Array<{ id: string; name: string | null }>
      task_submissions?: Array<{
        id: string
        submission_type: string | null
        media_asset_id: string | null
        created_at: string
        task_submission_assets?: Array<{
          id: string
          media_asset_id: string | null
          media_asset?:
          | { id: string; bucket: string | null; path: string; mime_type: string | null; metadata: Record<string, unknown> | null }
          | Array<{ id: string; bucket: string | null; path: string; mime_type: string | null; metadata: Record<string, unknown> | null }>
        }>
      }>
    }>

    if (explicitTaskIds.length > 0 && taskList.length !== explicitTaskIds.length) {
      return { error: '선택한 학생 과제를 찾을 수 없습니다.' }
    }

    const filteredTasks = explicitTaskIds.length > 0
      ? taskList
      : taskList.filter((task) => (task.task_submissions ?? []).some((submission) => submission.media_asset_id))

    if (filteredTasks.length === 0) {
      return { error: '인쇄할 수 있는 PDF 제출물을 찾지 못했습니다.' }
    }

    const printableItems: Array<{
      studentTaskId: string
      submissionId: string
      mediaAssetId: string
      assetMetadata: Record<string, unknown> | null
      assetFilename: string | null
    }> = []
    const skippedStudents: string[] = []

    filteredTasks.forEach((task) => {
      const submissions = task.task_submissions ?? []
      const collectedAssets: Array<{
        submissionId: string
        mediaAssetId: string
        assetFilename: string | null
        assetMetadata: Record<string, unknown> | null
      }> = []

      submissions.forEach((submission) => {
        if (submission.submission_type !== 'pdf') {
          return
        }

        const submissionAssets = submission.task_submission_assets ?? []

        submissionAssets.forEach((asset) => {
          const relation = Array.isArray(asset.media_asset) ? asset.media_asset[0] : asset.media_asset
          if (!relation?.id) {
            return
          }

          const metadata = (relation.metadata as Record<string, unknown> | null) ?? null
          const filenameValue = (() => {
            if (!metadata) {
              return null
            }
            const candidate = metadata.originalName ?? metadata.filename ?? metadata.name
            return typeof candidate === 'string' ? candidate : null
          })()

          collectedAssets.push({
            submissionId: submission.id,
            mediaAssetId: relation.id,
            assetFilename: filenameValue,
            assetMetadata: metadata,
          })
        })
      })

      if (collectedAssets.length === 0) {
        const profileRow = Array.isArray(task.profiles) ? task.profiles[0] : task.profiles
        skippedStudents.push(profileRow?.name ?? '이름 미정')
        return
      }

      collectedAssets.forEach((asset) => {
        printableItems.push({
          studentTaskId: task.id,
          submissionId: asset.submissionId,
          mediaAssetId: asset.mediaAssetId,
          assetMetadata: asset.assetMetadata,
          assetFilename: asset.assetFilename,
        })
      })
    })

    if (printableItems.length === 0) {
      return {
        error:
          '선택한 학생들의 PDF 제출물을 찾지 못했습니다. 제출 파일이 업로드되었는지 확인해주세요.',
      }
    }

    const desiredDate = new Date(`${payload.desiredDate}T00:00:00`)
    const formattedDate = desiredDate.toISOString().slice(0, 10)
    const bundleMode: 'merged' | 'separate' = 'merged'

    const primaryStudentTaskId =
      explicitTaskIds.length === 1 ? explicitTaskIds[0] : payload.studentTaskId ?? null

    const { data: requestRow, error: insertError } = await supabase
      .from('print_requests')
      .insert({
        assignment_id: payload.assignmentId,
        student_task_id: primaryStudentTaskId,
        teacher_id: profile.id,
        desired_date: formattedDate,
        desired_period: payload.desiredPeriod ?? null,
        copies: payload.copies,
        color_mode: payload.colorMode,
        status: 'requested',
        notes: payload.notes ?? null,
        bundle_mode: bundleMode,
        bundle_status: 'pending',
      })
      .select('id')
      .maybeSingle()

    if (insertError || !requestRow?.id) {
      console.error('[teacher] createPrintRequest insert error', insertError)
      return { error: '인쇄 요청 저장 중 오류가 발생했습니다.' }
    }

    const itemsPayload = printableItems.map((item) => ({
      request_id: requestRow.id,
      student_task_id: item.studentTaskId,
      submission_id: item.submissionId,
      media_asset_id: item.mediaAssetId,
      asset_filename: item.assetFilename,
      asset_metadata: item.assetMetadata,
    }))

    const { error: itemsError } = await supabase.from('print_request_items').insert(itemsPayload)

    if (itemsError) {
      console.error('[teacher] createPrintRequest items insert error', itemsError)
      await supabase.from('print_requests').delete().eq('id', requestRow.id)
      return { error: '인쇄 요청 항목 저장 중 오류가 발생했습니다.' }
    }

    revalidatePath('/dashboard/teacher')
    revalidatePath('/dashboard/principal')
    revalidatePath(`/dashboard/teacher/assignments/${payload.assignmentId}`)
    revalidatePath('/dashboard/manager')
    revalidatePath('/dashboard/teacher/review')

    return skippedStudents.length > 0
      ? { success: true, skippedStudents }
      : { success: true }
  } catch (error) {
    console.error('[teacher] createPrintRequest unexpected error', error)
    return { error: '인쇄 요청 처리 중 예상치 못한 문제가 발생했습니다.' }
  }
}

const cancelPrintRequestSchema = z.object({
  requestId: z.string().uuid('유효한 인쇄 요청 ID가 아닙니다.'),
})

type CancelPrintRequestInput = z.infer<typeof cancelPrintRequestSchema>

export async function cancelPrintRequest(input: CancelPrintRequestInput) {
  const { profile } = await getAuthContext()

  if (!isTeacherManagerOrPrincipal(profile)) {
    return { error: '교사·실장·원장 계정으로만 취소할 수 있습니다.' }
  }

  const parsed = cancelPrintRequestSchema.safeParse(input)
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]
    return { error: firstIssue?.message ?? '인쇄 요청 정보를 확인해주세요.' }
  }

  const payload = parsed.data
  const supabase = await createServerSupabase()

  try {
    const { data: request, error: fetchError } = await supabase
      .from('print_requests')
      .select('id, teacher_id, assignment_id, status')
      .eq('id', payload.requestId)
      .maybeSingle()

    if (fetchError) {
      console.error('[teacher] cancelPrintRequest fetch error', fetchError)
      return { error: '인쇄 요청 정보를 불러오지 못했습니다.' }
    }

    if (!request) {
      return { error: '인쇄 요청을 찾을 수 없습니다.' }
    }

    if (request.status !== 'requested') {
      return { error: '이미 처리된 인쇄 요청입니다.' }
    }

    const isOwner = request.teacher_id === profile.id
    if (!isOwner && profile.role !== 'principal') {
      return { error: '해당 인쇄 요청을 취소할 권한이 없습니다.' }
    }

    const { error: updateError } = await supabase
      .from('print_requests')
      .update({
        status: 'canceled',
        bundle_status: 'failed',
        bundle_error: '교사에 의해 취소되었습니다.',
      })
      .eq('id', payload.requestId)

    if (updateError) {
      console.error('[teacher] cancelPrintRequest update error', updateError)
      return { error: '인쇄 요청 취소에 실패했습니다.' }
    }

    revalidatePath('/dashboard/teacher')
    revalidatePath('/dashboard/principal')
    revalidatePath('/dashboard/manager')
    if (request.assignment_id) {
      revalidatePath(`/dashboard/teacher/assignments/${request.assignment_id}`)
    }
    revalidatePath('/dashboard/teacher/review')

    return { success: true as const }
  } catch (error) {
    console.error('[teacher] cancelPrintRequest unexpected error', error)
    return { error: '인쇄 요청 취소 중 문제가 발생했습니다.' }
  }
}

const deleteStudentSchema = z.object({
  assignmentId: z.string().uuid('유효한 과제 ID가 아닙니다.'),
  studentTaskId: z.string().uuid('유효한 학생 과제 ID가 아닙니다.'),
})

type DeleteStudentInput = z.infer<typeof deleteStudentSchema>

export async function deleteStudentTask(input: DeleteStudentInput): Promise<DeleteResult> {
  let stage = 'start'
  const { profile } = await getAuthContext()

  if (!isTeacherManagerOrPrincipal(profile)) {
    return { error: `교사·실장·원장 계정으로만 삭제할 수 있습니다. [stage=${stage}]`, message: stage }
  }

  const parsed = deleteStudentSchema.safeParse(input)
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]
    stage = 'validation_failed'
    return { error: `${firstIssue?.message ?? '삭제할 학생 과제 정보를 확인해주세요.'} [stage=${stage}]`, message: stage }
  }

  const payload = parsed.data
  const admin = createAdminClient()

  console.info('[teacher] deleteStudentTask start', {
    assignmentId: payload.assignmentId,
    studentTaskId: payload.studentTaskId,
  })

  try {
    const { data: studentTask, error: fetchTaskError } = await admin
      .from('student_tasks')
      .select(
        'id, assignment_id, student_id, assignments:assignments!student_tasks_assignment_id_fkey(id, assigned_by), profiles!student_tasks_student_id_fkey(class_id)'
      )
      .eq('id', payload.studentTaskId)
      .maybeSingle()

    if (fetchTaskError) {
      stage = 'fetch_student_task_error'
      console.error('[teacher] deleteStudentTask fetch error', fetchTaskError)
      return { error: `학생 과제 정보를 불러오지 못했습니다. [stage=${stage}]`, message: stage }
    }

    if (!studentTask || studentTask.assignment_id !== payload.assignmentId) {
      console.warn('[teacher] deleteStudentTask missing student task', {
        studentTask,
        payload,
      })
      stage = 'student_task_missing'
      return { error: `학생 과제 정보를 확인할 수 없습니다. [stage=${stage}]`, message: stage }
    }

    const assignment = Array.isArray(studentTask.assignments)
      ? studentTask.assignments[0]
      : studentTask.assignments

    if (!assignment || !canManageAssignment(profile, assignment.assigned_by)) {
      stage = 'permission_denied'
      return { error: `해당 과제에 대한 삭제 권한이 없습니다. [stage=${stage}]`, message: stage }
    }

    const profileRecord = Array.isArray(studentTask.profiles) ? studentTask.profiles[0] : studentTask.profiles
    const classId = profileRecord?.class_id ?? null

    stage = 'cascade_start'
    const deleteResult = await deleteStudentTaskCascade(payload.studentTaskId)
    if (deleteResult.error) {
      stage = 'cascade_error'
      return { error: `${deleteResult.error} [stage=${stage}]`, message: deleteResult.message ?? stage }
    }

    revalidatePath('/dashboard/teacher')
    revalidatePath('/dashboard/principal')
    revalidatePath(`/dashboard/teacher/assignments/${payload.assignmentId}`)
    if (classId) {
      revalidatePath(`/dashboard/teacher/review/${classId}`)
    }
    console.info('[teacher] deleteStudentTask success', {
      assignmentId: payload.assignmentId,
      studentTaskId: payload.studentTaskId,
      classId,
    })
    stage = 'completed'
    return {
      success: true as const,
      message: deleteResult.message ? `${stage}>${deleteResult.message}` : stage,
    }
  } catch (error) {
    console.error('[teacher] deleteStudentTask unexpected error', {
      error,
      studentTaskId: payload.studentTaskId,
      assignmentId: payload.assignmentId,
    })
    stage = 'unexpected_error'
    return { error: `학생 과제 삭제 중 문제가 발생했습니다. [stage=${stage}]`, message: stage }
  }
}

const deleteTargetSchema = z.object({
  assignmentId: z.string().uuid('유효한 과제 ID가 아닙니다.'),
  classId: z.string().uuid('유효한 반 ID가 아닙니다.'),
})

type DeleteTargetInput = z.infer<typeof deleteTargetSchema>

export async function deleteAssignmentTarget(input: DeleteTargetInput): Promise<DeleteResult> {
  const { profile } = await getAuthContext()

  if (!isTeacherManagerOrPrincipal(profile)) {
    return { error: '교사·실장·원장 계정만 과제를 삭제할 수 있습니다.' }
  }

  const parsed = deleteTargetSchema.safeParse(input)
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]
    return { error: firstIssue?.message ?? '삭제할 반 정보를 확인해주세요.' }
  }

  const payload = parsed.data
  const admin = createAdminClient()

  console.info('[teacher] deleteAssignmentTarget start', {
    assignmentId: payload.assignmentId,
    classId: payload.classId,
  })

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
      console.warn('[teacher] deleteAssignmentTarget missing target', {
        target,
        payload,
      })
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

    const { data: classMembers, error: classMemberError } = await admin
      .from('class_students')
      .select('student_id')
      .eq('class_id', payload.classId)

    if (classMemberError) {
      console.error('[teacher] deleteAssignmentTarget class member fetch error', classMemberError)
      return { error: '반 소속 학생 목록을 확인하지 못했습니다.' }
    }

    const studentIdsInClass = new Set((classMembers ?? []).map((row) => row.student_id))
    console.info('[teacher] deleteAssignmentTarget student scan', {
      assignmentId: payload.assignmentId,
      classId: payload.classId,
      totalTasks: tasks?.length ?? 0,
      classMemberCount: studentIdsInClass.size,
    })

    const impactedStudentIds = new Set<string>()
    const studentTaskIds = (tasks ?? [])
      .filter((task) => {
        const profileRecord = Array.isArray(task.profiles) ? task.profiles[0] : task.profiles
        const byProfile = profileRecord?.class_id === payload.classId
        const byMembership = task.student_id ? studentIdsInClass.has(task.student_id) : false
        if (byProfile || byMembership) {
          if (task.student_id) {
            impactedStudentIds.add(task.student_id)
          }
          return true
        }
        return false
      })
      .map((task) => task.id)

    if (studentTaskIds.length > 0) {
      console.info('[teacher] deleteAssignmentTarget deleting student tasks', {
        studentTaskIds,
      })
      const deleteResults = await Promise.all(
        studentTaskIds.map((studentTaskId) => deleteStudentTaskCascade(studentTaskId))
      )
      const failed = deleteResults.find((result) => result.error)
      if (failed) {
        console.error('[teacher] deleteAssignmentTarget failed cascade', failed)
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
      revalidatePath('/dashboard/student/tasks')
    }
    console.info('[teacher] deleteAssignmentTarget success', {
      assignmentId: payload.assignmentId,
      classId: payload.classId,
      studentTaskIds,
    })
    return {
      success: true as const,
      message: JSON.stringify({ deletedStudentTasks: studentTaskIds }),
    }
  } catch (error) {
    console.error('[teacher] deleteAssignmentTarget unexpected error', {
      error,
      assignmentId: payload.assignmentId,
      classId: payload.classId,
    })
    return { error: '반 과제 삭제 중 문제가 발생했습니다.' }
  }
}

async function deleteStudentTaskCascade(studentTaskId: string): Promise<DeleteResult> {
  const admin = createAdminClient()

  const directDelete = await admin
    .from('student_tasks')
    .delete()
    .eq('id', studentTaskId)
    .select('id')
    .maybeSingle()

  if (!directDelete.error) {
    return { success: true as const, message: 'student_tasks:direct_deleted' }
  }

  if (directDelete.error.code && directDelete.error.code !== '23503') {
    console.error('[teacher] deleteStudentTask direct delete error', directDelete.error)
    return { error: `학생 과제 삭제 중 오류가 발생했습니다. [code=${directDelete.error.code}]` }
  }

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

  return { success: true as const, message: 'student_tasks:deleted_after_children' }
}

// ─────────────────────────────────────────────────────────────────────────────
// Student Photo Management
// ─────────────────────────────────────────────────────────────────────────────

const updatePhotoSchema = z.object({
  studentId: z.string().uuid('유효한 학생 ID가 아닙니다.'),
  photoPath: z.string().min(1, '사진 경로가 필요합니다.'),
})

type UpdatePhotoInput = z.infer<typeof updatePhotoSchema>

export async function updateStudentPhoto(input: UpdatePhotoInput) {
  const { profile } = await getAuthContext()

  if (!isTeacherManagerOrPrincipal(profile)) {
    return { error: '교사·실장·원장 계정으로만 학생 사진을 변경할 수 있습니다.' }
  }

  const parsed = updatePhotoSchema.safeParse(input)
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]
    return { error: firstIssue?.message ?? '요청 정보를 확인해주세요.' }
  }

  const payload = parsed.data
  // RLS 정책이 본인 프로필만 수정 허용하므로, admin client 사용
  const supabase = createAdminClient()

  try {
    // 학생 프로필 존재 확인
    const { data: student, error: fetchError } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('id', payload.studentId)
      .maybeSingle()

    if (fetchError) {
      console.error('[teacher] updateStudentPhoto fetch error', fetchError)
      return { error: '학생 정보를 불러오지 못했습니다.' }
    }

    if (!student) {
      return { error: '학생을 찾을 수 없습니다.' }
    }

    if (student.role !== 'student') {
      return { error: '학생 계정에만 사진을 등록할 수 있습니다.' }
    }

    // photo_url 업데이트
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ photo_url: payload.photoPath })
      .eq('id', payload.studentId)

    if (updateError) {
      console.error('[teacher] updateStudentPhoto update error', updateError)
      return { error: '학생 사진 저장 중 오류가 발생했습니다.' }
    }

    revalidatePath('/dashboard/teacher')
    revalidatePath('/dashboard/principal')
    revalidatePath('/dashboard/manager')

    return { success: true as const }
  } catch (error) {
    console.error('[teacher] updateStudentPhoto unexpected error', error)
    return { error: '학생 사진 업데이트 중 문제가 발생했습니다.' }
  }
}

const deletePhotoSchema = z.object({
  studentId: z.string().uuid('유효한 학생 ID가 아닙니다.'),
})

type DeletePhotoInput = z.infer<typeof deletePhotoSchema>

export async function deleteStudentPhoto(input: DeletePhotoInput) {
  const { profile } = await getAuthContext()

  if (!isTeacherManagerOrPrincipal(profile)) {
    return { error: '교사·실장·원장 계정으로만 학생 사진을 삭제할 수 있습니다.' }
  }

  const parsed = deletePhotoSchema.safeParse(input)
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]
    return { error: firstIssue?.message ?? '요청 정보를 확인해주세요.' }
  }

  const payload = parsed.data
  // RLS 정책이 본인 프로필만 수정 허용하므로, admin client 사용
  const supabase = createAdminClient()

  try {
    // 기존 사진 경로 가져오기
    const { data: student, error: fetchError } = await supabase
      .from('profiles')
      .select('id, photo_url')
      .eq('id', payload.studentId)
      .maybeSingle()

    if (fetchError) {
      console.error('[teacher] deleteStudentPhoto fetch error', fetchError)
      return { error: '학생 정보를 불러오지 못했습니다.' }
    }

    if (!student) {
      return { error: '학생을 찾을 수 없습니다.' }
    }

    // 스토리지에서 파일 삭제 (경로가 있는 경우)
    if (student.photo_url) {
      const { error: storageError } = await supabase.storage
        .from('profile-photos')
        .remove([student.photo_url])

      if (storageError) {
        console.error('[teacher] deleteStudentPhoto storage error', storageError)
        // 스토리지 삭제 실패해도 DB는 업데이트 (파일이 이미 없을 수도 있음)
      }
    }

    // photo_url을 null로 업데이트
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ photo_url: null })
      .eq('id', payload.studentId)

    if (updateError) {
      console.error('[teacher] deleteStudentPhoto update error', updateError)
      return { error: '학생 사진 삭제 중 오류가 발생했습니다.' }
    }

    revalidatePath('/dashboard/teacher')
    revalidatePath('/dashboard/principal')
    revalidatePath('/dashboard/manager')

    return { success: true as const }
  } catch (error) {
    console.error('[teacher] deleteStudentPhoto unexpected error', error)
    return { error: '학생 사진 삭제 중 문제가 발생했습니다.' }
  }
}

const updateDatesSchema = z.object({
  assignmentId: z.string().uuid(),
  publishedAt: z.string().nullable().optional(),
  dueAt: z.string().nullable().optional(),
})

export async function updateAssignmentDates(
  input: z.infer<typeof updateDatesSchema>
): Promise<{ success?: true; error?: string }> {
  const parsed = updateDatesSchema.safeParse(input)
  if (!parsed.success) {
    return { error: '잘못된 입력입니다.' }
  }

  const { profile } = await getAuthContext()
  if (!isTeacherManagerOrPrincipal(profile)) {
    return { error: '권한이 없습니다.' }
  }

  const supabase = await createServerSupabase()

  const { data: assignment } = await supabase
    .from('assignments')
    .select('id, assigned_by')
    .eq('id', parsed.data.assignmentId)
    .single()

  if (!assignment) {
    return { error: '과제를 찾을 수 없습니다.' }
  }

  if (!canManageAssignment(profile, assignment.assigned_by)) {
    return { error: '이 과제를 수정할 권한이 없습니다.' }
  }

  const updates: Record<string, string | null> = {}
  if (parsed.data.publishedAt !== undefined) {
    updates.published_at = parsed.data.publishedAt
  }
  if (parsed.data.dueAt !== undefined) {
    updates.due_at = parsed.data.dueAt
  }

  if (Object.keys(updates).length === 0) {
    return { success: true }
  }

  const { error } = await supabase
    .from('assignments')
    .update(updates)
    .eq('id', parsed.data.assignmentId)

  if (error) {
    console.error('[teacher] updateAssignmentDates error', error)
    return { error: '날짜 수정 중 문제가 발생했습니다.' }
  }

  revalidatePath('/dashboard/teacher/review')
  return { success: true }
}

interface RawOverviewAssignmentRow {
  id: string
  due_at: string | null
  published_at: string | null
  created_at: string
  workbooks?:
    | { id: string; title: string | null; subject: string | null; type: string | null }
    | Array<{ id: string; title: string | null; subject: string | null; type: string | null }>
  assignment_targets?: Array<{ class_id: string | null }>
}

export async function fetchAllAssignmentsForClass(
  classId: string
): Promise<ClassAssignmentListItem[]> {
  const { profile } = await getAuthContext()
  if (!isTeacherManagerOrPrincipal(profile)) {
    return []
  }

  const canSeeAll = profile.role === 'principal' || profile.role === 'manager'
  const supabase = await createServerSupabase()

  const query = supabase
    .from('assignments')
    .select(
      `id, due_at, published_at, created_at,
       workbooks(id, title, subject, type),
       assignment_targets!inner(class_id)`
    )
    .eq('assignment_targets.class_id', classId)
    .order('due_at', { ascending: false })

  if (!canSeeAll) {
    query.eq('assigned_by', profile.id)
  }

  const { data, error } = await query.returns<RawOverviewAssignmentRow[]>()

  if (error) {
    console.error('[teacher] fetchAllAssignmentsForClass error', error)
    return []
  }

  return (data ?? []).map((row) => {
    const workbook = Array.isArray(row.workbooks) ? row.workbooks[0] : row.workbooks
    const publishedAt = row.published_at ?? row.created_at
    return {
      id: row.id,
      title: workbook?.title ?? '제목 없음',
      subject: workbook?.subject ?? null,
      type: workbook?.type ?? null,
      dueAt: row.due_at,
      dueAtLabel: row.due_at
        ? DateUtil.formatForDisplay(row.due_at, {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })
        : null,
      publishedAtLabel: publishedAt
        ? DateUtil.formatForDisplay(publishedAt, {
            month: 'short',
            day: 'numeric',
          })
        : null,
    }
  })
}
