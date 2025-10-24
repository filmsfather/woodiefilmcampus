'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { getAuthContext } from '@/lib/auth'
import { createClient as createServerSupabase } from '@/lib/supabase/server'
import { ABSENCE_REASON_OPTIONS, type AbsenceReasonType, isAdminRole, isTeacherRole } from '@/lib/absences'

const REASON_ENUM = z.enum(ABSENCE_REASON_OPTIONS.map((option) => option.value) as [AbsenceReasonType, ...AbsenceReasonType[]])

const OPTIONAL_TEXT_MAX = 2000

const createSchema = z.object({
  classId: z.string().uuid('선택한 반 정보가 잘못되었습니다.'),
  studentId: z.string().uuid('선택한 학생 정보가 잘못되었습니다.'),
  absenceDate: z
    .string()
    .regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/u, '결석 날짜 형식을 확인해주세요.'),
  reasonType: REASON_ENUM,
  detailReason: z
    .string()
    .max(OPTIONAL_TEXT_MAX, '상세 사유는 2000자 이하로 입력해주세요.')
    .optional(),
  teacherAction: z
    .string()
    .max(OPTIONAL_TEXT_MAX, '교사 조치사항은 2000자 이하로 입력해주세요.')
    .optional(),
  managerAction: z
    .string()
    .max(OPTIONAL_TEXT_MAX, '실장 조치사항은 2000자 이하로 입력해주세요.')
    .optional(),
})

export type CreateAbsenceInput = z.infer<typeof createSchema>

const updateSchema = z
  .object({
    id: z.string().uuid('결석계 ID가 올바르지 않습니다.'),
    detailReason: z
      .string()
      .max(OPTIONAL_TEXT_MAX, '상세 사유는 2000자 이하로 입력해주세요.')
      .optional(),
    teacherAction: z
      .string()
      .max(OPTIONAL_TEXT_MAX, '교사 조치사항은 2000자 이하로 입력해주세요.')
      .optional(),
    managerAction: z
      .string()
      .max(OPTIONAL_TEXT_MAX, '실장 조치사항은 2000자 이하로 입력해주세요.')
      .optional(),
  })
  .refine((value) => value.detailReason !== undefined || value.teacherAction !== undefined || value.managerAction !== undefined, {
    message: '수정할 내용을 입력해주세요.',
    path: ['detailReason'],
  })

export type UpdateAbsenceInput = z.infer<typeof updateSchema>

const deleteSchema = z.object({
  id: z.string().uuid('결석계 ID가 올바르지 않습니다.'),
})

export type DeleteAbsenceInput = z.infer<typeof deleteSchema>

function normalizeOptionalText(value: string | null | undefined) {
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function revalidateAbsencePaths() {
  revalidatePath('/dashboard/teacher/absences')
  revalidatePath('/dashboard/manager/absences')
}

export async function createAbsenceReport(input: CreateAbsenceInput) {
  const { profile } = await getAuthContext()

  if (!profile) {
    return { error: '로그인이 필요합니다.' }
  }

  if (!['teacher', 'manager', 'principal'].includes(profile.role)) {
    return { error: '결석계를 작성할 권한이 없습니다.' }
  }

  const parsed = createSchema.safeParse(input)

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]
    return { error: firstIssue?.message ?? '입력한 정보를 확인해주세요.' }
  }

  const payload = parsed.data
  const supabase = createServerSupabase()

  try {
    if (isTeacherRole(profile)) {
      const { data: teacherClass, error: teacherClassError } = await supabase
        .from('class_teachers')
        .select('class_id')
        .eq('class_id', payload.classId)
        .eq('teacher_id', profile.id)
        .maybeSingle()

      if (teacherClassError) {
        console.error('[absences] create - teacher class check error', teacherClassError)
        return { error: '담당 반 정보를 확인하지 못했습니다.' }
      }

      if (!teacherClass) {
        return { error: '해당 반 결석계를 작성할 권한이 없습니다.' }
      }
    }

    const { data: studentClass, error: studentClassError } = await supabase
      .from('class_students')
      .select('student_id')
      .eq('class_id', payload.classId)
      .eq('student_id', payload.studentId)
      .maybeSingle()

    if (studentClassError) {
      console.error('[absences] create - student class check error', studentClassError)
      return { error: '학생 소속 반 정보를 확인하지 못했습니다.' }
    }

    if (!studentClass) {
      return { error: '선택한 학생은 해당 반에 소속되어 있지 않습니다.' }
    }

    const insertData = {
      class_id: payload.classId,
      student_id: payload.studentId,
      absence_date: payload.absenceDate,
      reason_type: payload.reasonType,
      detail_reason: normalizeOptionalText(payload.detailReason ?? null),
      teacher_action: isTeacherRole(profile) ? normalizeOptionalText(payload.teacherAction ?? null) : null,
      manager_action: isAdminRole(profile) ? normalizeOptionalText(payload.managerAction ?? null) : null,
      created_by: profile.id,
    }

    const { error: insertError } = await supabase.from('absence_reports').insert(insertData)

    if (insertError) {
      if (insertError.code === '23505') {
        return { error: '이미 동일한 날짜에 등록된 결석계가 있습니다.' }
      }
      console.error('[absences] create - insert error', insertError)
      return { error: '결석계 저장 중 오류가 발생했습니다.' }
    }

    revalidateAbsencePaths()
    return { success: true as const }
  } catch (error) {
    console.error('[absences] create - unexpected error', error)
    return { error: '결석계 작성 중 예상치 못한 문제가 발생했습니다.' }
  }
}

export async function updateAbsenceReport(input: UpdateAbsenceInput) {
  const { profile } = await getAuthContext()

  if (!profile) {
    return { error: '로그인이 필요합니다.' }
  }

  if (!['teacher', 'manager', 'principal'].includes(profile.role)) {
    return { error: '결석계를 수정할 권한이 없습니다.' }
  }

  const parsed = updateSchema.safeParse(input)

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]
    return { error: firstIssue?.message ?? '수정할 내용을 다시 확인해주세요.' }
  }

  const payload = parsed.data
  const supabase = createServerSupabase()

  try {
    const { data: report, error: fetchError } = await supabase
      .from('absence_reports')
      .select('id, class_id, created_by')
      .eq('id', payload.id)
      .maybeSingle()

    if (fetchError) {
      console.error('[absences] update - fetch error', fetchError)
      return { error: '결석계 정보를 불러오지 못했습니다.' }
    }

    if (!report) {
      return { error: '이미 삭제되었거나 존재하지 않는 결석계입니다.' }
    }

    if (isTeacherRole(profile) && report.created_by !== profile.id) {
      const { data: teacherClass, error: teacherClassError } = await supabase
        .from('class_teachers')
        .select('class_id')
        .eq('class_id', report.class_id)
        .eq('teacher_id', profile.id)
        .maybeSingle()

      if (teacherClassError) {
        console.error('[absences] update - teacher class check error', teacherClassError)
        return { error: '담당 반 정보를 확인하지 못했습니다.' }
      }

      if (!teacherClass) {
        return { error: '해당 결석계를 수정할 권한이 없습니다.' }
      }
    }

    const updateData: Record<string, unknown> = {}

    if (payload.detailReason !== undefined) {
      updateData.detail_reason = normalizeOptionalText(payload.detailReason)
    }

    if (payload.teacherAction !== undefined && isTeacherRole(profile)) {
      updateData.teacher_action = normalizeOptionalText(payload.teacherAction)
    }

    if (payload.managerAction !== undefined && isAdminRole(profile)) {
      updateData.manager_action = normalizeOptionalText(payload.managerAction)
    }

    if (Object.keys(updateData).length === 0) {
      return { error: '변경할 수 없는 항목입니다.' }
    }

    const { error: updateError } = await supabase
      .from('absence_reports')
      .update(updateData)
      .eq('id', payload.id)

    if (updateError) {
      console.error('[absences] update - update error', updateError)
      return { error: '결석계 수정 중 오류가 발생했습니다.' }
    }

    revalidateAbsencePaths()
    return { success: true as const }
  } catch (error) {
    console.error('[absences] update - unexpected error', error)
    return { error: '결석계 수정 중 예상치 못한 문제가 발생했습니다.' }
  }
}

export async function deleteAbsenceReport(input: DeleteAbsenceInput) {
  const { profile } = await getAuthContext()

  if (!profile) {
    return { error: '로그인이 필요합니다.' }
  }

  if (!['teacher', 'manager', 'principal'].includes(profile.role)) {
    return { error: '결석계를 삭제할 권한이 없습니다.' }
  }

  const parsed = deleteSchema.safeParse(input)

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]
    return { error: firstIssue?.message ?? '삭제할 결석 정보를 확인해주세요.' }
  }

  const payload = parsed.data
  const supabase = createServerSupabase()

  try {
    const { data: report, error: fetchError } = await supabase
      .from('absence_reports')
      .select('id, class_id, created_by')
      .eq('id', payload.id)
      .maybeSingle()

    if (fetchError) {
      console.error('[absences] delete - fetch error', fetchError)
      return { error: '결석계 정보를 불러오지 못했습니다.' }
    }

    if (!report) {
      return { success: true as const }
    }

    if (
      isTeacherRole(profile) &&
      report.created_by !== profile.id
    ) {
      const { data: teacherClass, error: teacherClassError } = await supabase
        .from('class_teachers')
        .select('class_id')
        .eq('class_id', report.class_id)
        .eq('teacher_id', profile.id)
        .maybeSingle()

      if (teacherClassError) {
        console.error('[absences] delete - teacher class check error', teacherClassError)
        return { error: '담당 반 정보를 확인하지 못했습니다.' }
      }

      if (!teacherClass) {
        return { error: '해당 결석계를 삭제할 권한이 없습니다.' }
      }
    }

    const { error: deleteError } = await supabase
      .from('absence_reports')
      .delete()
      .eq('id', payload.id)

    if (deleteError) {
      console.error('[absences] delete - delete error', deleteError)
      return { error: '결석계 삭제 중 오류가 발생했습니다.' }
    }

    revalidateAbsencePaths()
    return { success: true as const }
  } catch (error) {
    console.error('[absences] delete - unexpected error', error)
    return { error: '결석계 삭제 중 예상치 못한 문제가 발생했습니다.' }
  }
}
