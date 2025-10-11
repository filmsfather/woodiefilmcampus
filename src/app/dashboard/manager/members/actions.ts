'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { ensureManagerProfile } from '@/lib/authz'
import { createAdminClient } from '@/lib/supabase/admin'
const phoneRegex = /^[0-9+\-()\s]*$/

const userRoleSchema = z.enum(['student', 'teacher', 'manager', 'principal'])

const updateProfileSchema = z.object({
  memberId: z.string().uuid('유효한 사용자 ID를 확인해주세요.'),
  role: userRoleSchema,
  name: z.string().trim().min(1, '이름을 입력해주세요.'),
  studentPhone: z.string().optional(),
  parentPhone: z.string().optional(),
  academicRecord: z.string().optional(),
})

type UpdateProfileInput = z.infer<typeof updateProfileSchema>

export async function updateMemberProfile(input: UpdateProfileInput) {
  const parsed = updateProfileSchema.safeParse(input)

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]
    return { error: firstIssue?.message ?? '입력값을 확인해주세요.' }
  }

  const payload = parsed.data
  const managerProfile = await ensureManagerProfile()

  if (!managerProfile) {
    return { error: '프로필을 수정할 권한이 없습니다.' }
  }

  const normalize = (value?: string | null) => {
    if (value === undefined || value === null) {
      return null
    }
    const trimmed = value.trim()
    return trimmed.length === 0 ? null : trimmed
  }

  const normalizedStudentPhone = normalize(payload.studentPhone)
  const normalizedParentPhone = normalize(payload.parentPhone)
  const normalizedAcademicRecord = normalize(payload.academicRecord)

  if (payload.role === 'student' && !normalizedStudentPhone) {
    return { error: '학생 전화번호를 입력해주세요.' }
  }

  for (const [label, value] of [
    ['학생 전화번호', normalizedStudentPhone],
    ['부모님 전화번호', normalizedParentPhone],
  ] as const) {
    if (value && !phoneRegex.test(value)) {
      return { error: `${label} 형식이 올바르지 않습니다.` }
    }
  }

  try {
    const supabase = createAdminClient()

    const { error } = await supabase
      .from('profiles')
      .update({
        name: payload.name.trim(),
        student_phone: normalizedStudentPhone,
        parent_phone: normalizedParentPhone,
        academic_record: normalizedAcademicRecord,
        updated_at: new Date().toISOString(),
      })
      .eq('id', payload.memberId)
      .eq('status', 'approved')

    if (error) {
      console.error('[manager] updateMemberProfile failed', error)
      return { error: '프로필 업데이트 중 오류가 발생했습니다.' }
    }

    revalidatePath('/dashboard/manager/members')
    revalidatePath('/dashboard/manager')
    return { success: true as const }
  } catch (error) {
    console.error('[manager] updateMemberProfile unexpected', error)
    return { error: '예상치 못한 오류가 발생했습니다.' }
  }
}

const updateClassAssignmentsSchema = z.object({
  memberId: z.string().uuid('사용자 ID가 올바르지 않습니다.'),
  role: z.enum(['student', 'teacher']),
  classIds: z.array(z.string().uuid('배정할 반 ID가 올바르지 않습니다.')).max(50),
  homeroomClassId: z.string().uuid().optional().or(z.literal(null)),
})

type UpdateClassAssignmentsInput = z.infer<typeof updateClassAssignmentsSchema>

export async function updateMemberClassAssignments(input: UpdateClassAssignmentsInput) {
  const parsed = updateClassAssignmentsSchema.safeParse(input)

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]
    return { error: firstIssue?.message ?? '배정 정보를 확인해주세요.' }
  }

  const payload = parsed.data
  const managerProfile = await ensureManagerProfile()

  if (!managerProfile) {
    return { error: '반 배정 권한이 없습니다.' }
  }

  if (payload.role === 'teacher' && payload.homeroomClassId && !payload.classIds.includes(payload.homeroomClassId)) {
    return { error: '담임으로 지정할 반을 체크해주세요.' }
  }

  try {
    const supabase = createAdminClient()

    if (payload.role === 'student') {
      const { data: existingRows, error: existingError } = await supabase
        .from('class_students')
        .select('class_id')
        .eq('student_id', payload.memberId)

      if (existingError) {
        console.error('[manager] load class_students failed', existingError)
        return { error: '현재 배정 정보를 불러오지 못했습니다.' }
      }

      const currentClassIds = new Set((existingRows ?? []).map((row) => row.class_id))
      const incomingClassIds = new Set(payload.classIds)

      const toDelete = Array.from(currentClassIds).filter((id) => !incomingClassIds.has(id))
      const toInsert = Array.from(incomingClassIds).filter((id) => !currentClassIds.has(id))

      if (toDelete.length > 0) {
        const { error: deleteError } = await supabase
          .from('class_students')
          .delete()
          .eq('student_id', payload.memberId)
          .in('class_id', toDelete)

        if (deleteError) {
          console.error('[manager] delete class_students failed', deleteError)
          return { error: '기존 반 정보를 삭제하는 중 오류가 발생했습니다.' }
        }
      }

      if (toInsert.length > 0) {
        const { error: insertError } = await supabase
          .from('class_students')
          .insert(
            toInsert.map((classId) => ({
              class_id: classId,
              student_id: payload.memberId,
            }))
          )

        if (insertError) {
          console.error('[manager] insert class_students failed', insertError)
          return { error: '새 반 정보를 저장하는 중 오류가 발생했습니다.' }
        }
      }

      const primaryClassId = payload.classIds[0] ?? null

      const { error: profileUpdateError } = await supabase
        .from('profiles')
        .update({ class_id: primaryClassId ?? null, updated_at: new Date().toISOString() })
        .eq('id', payload.memberId)

      if (profileUpdateError) {
        console.error('[manager] update profile class_id failed', profileUpdateError)
        return { error: '대표 반 정보를 업데이트하지 못했습니다.' }
      }
    } else {
      const { data: existingRows, error: existingError } = await supabase
        .from('class_teachers')
        .select('class_id, is_homeroom')
        .eq('teacher_id', payload.memberId)

      if (existingError) {
        console.error('[manager] load class_teachers failed', existingError)
        return { error: '현재 담당 반 정보를 불러오지 못했습니다.' }
      }

      const currentClassIds = new Set((existingRows ?? []).map((row) => row.class_id))
      const incomingClassIds = new Set(payload.classIds)

      const toDelete = Array.from(currentClassIds).filter((id) => !incomingClassIds.has(id))

      if (toDelete.length > 0) {
        const { error: deleteError } = await supabase
          .from('class_teachers')
          .delete()
          .eq('teacher_id', payload.memberId)
          .in('class_id', toDelete)

        if (deleteError) {
          console.error('[manager] delete class_teachers failed', deleteError)
          return { error: '기존 담당 반 정보를 삭제하는 중 오류가 발생했습니다.' }
        }
      }

      const upsertPayload = payload.classIds.map((classId) => ({
        class_id: classId,
        teacher_id: payload.memberId,
        is_homeroom: payload.homeroomClassId === classId,
      }))

      if (upsertPayload.length > 0) {
        const { error: upsertError } = await supabase
          .from('class_teachers')
          .upsert(upsertPayload, { onConflict: 'class_id,teacher_id' })

        if (upsertError) {
          console.error('[manager] upsert class_teachers failed', upsertError)
          return { error: '담임 정보를 업데이트하지 못했습니다.' }
        }
      } else {
        const { error: clearError } = await supabase
          .from('class_teachers')
          .delete()
          .eq('teacher_id', payload.memberId)

        if (clearError) {
          console.error('[manager] clear class_teachers failed', clearError)
          return { error: '담당 반 정보를 초기화하는 중 오류가 발생했습니다.' }
        }
      }
    }

    revalidatePath('/dashboard/manager/members')
    revalidatePath('/dashboard/manager')
    return { success: true as const }
  } catch (error) {
    console.error('[manager] updateMemberClassAssignments unexpected', error)
    return { error: '반 배정 처리 중 알 수 없는 오류가 발생했습니다.' }
  }
}

const deleteMemberSchema = z.object({
  memberId: z.string().uuid('사용자 ID가 올바르지 않습니다.'),
})

type DeleteMemberInput = z.infer<typeof deleteMemberSchema>

export async function deleteApprovedUser(input: DeleteMemberInput) {
  const parsed = deleteMemberSchema.safeParse(input)

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]
    return { error: firstIssue?.message ?? '삭제할 사용자를 확인해주세요.' }
  }

  const managerProfile = await ensureManagerProfile()

  if (!managerProfile) {
    return { error: '사용자를 삭제할 권한이 없습니다.' }
  }

  try {
    const supabase = createAdminClient()
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, role, status')
      .eq('id', parsed.data.memberId)
      .maybeSingle()

    if (profileError) {
      console.error('[manager] deleteApprovedUser profile error', profileError)
      return { error: '사용자 정보를 불러오지 못했습니다.' }
    }

    if (!profile || profile.status !== 'approved') {
      return { error: '이미 삭제되었거나 승인 상태가 아닌 사용자입니다.' }
    }

    if (profile.role === 'principal') {
      return { error: '원장 계정은 삭제할 수 없습니다.' }
    }

    const { error: deleteStudentsError } = await supabase
      .from('class_students')
      .delete()
      .eq('student_id', profile.id)

    if (deleteStudentsError) {
      console.error('[manager] delete class_students before account removal', deleteStudentsError)
    }

    const { error: deleteTeachersError } = await supabase
      .from('class_teachers')
      .delete()
      .eq('teacher_id', profile.id)

    if (deleteTeachersError) {
      console.error('[manager] delete class_teachers before account removal', deleteTeachersError)
    }

    const { error: deleteError } = await supabase.auth.admin.deleteUser(profile.id)

    if (deleteError) {
      console.error('[manager] deleteApprovedUser auth delete error', deleteError)
      return { error: '사용자 삭제 중 오류가 발생했습니다.' }
    }

    revalidatePath('/dashboard/manager/members')
    revalidatePath('/dashboard/manager')
    return { success: true as const }
  } catch (error) {
    console.error('[manager] deleteApprovedUser unexpected', error)
    return { error: '사용자를 삭제하는 중 예상치 못한 문제가 발생했습니다.' }
  }
}
