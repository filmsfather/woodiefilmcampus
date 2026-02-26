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

  const sanitizePhone = (value?: string | null) => {
    if (!value) return null
    const digits = value.replace(/\D/g, '')
    return digits.length > 0 ? digits : null
  }

  const normalizedStudentPhone = sanitizePhone(payload.studentPhone)
  const normalizedParentPhone = sanitizePhone(payload.parentPhone)
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

const inactiveStatusSchema = z.enum(['withdrawn', 'graduated'])

const transitionMemberStatusSchema = z.object({
  memberId: z.string().uuid('사용자 ID가 올바르지 않습니다.'),
  nextStatus: inactiveStatusSchema,
})

type TransitionMemberStatusInput = z.infer<typeof transitionMemberStatusSchema>

export async function transitionMemberToInactive(input: TransitionMemberStatusInput) {
  const parsed = transitionMemberStatusSchema.safeParse(input)

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]
    return { error: firstIssue?.message ?? '처리할 사용자를 확인해주세요.' }
  }

  const managerProfile = await ensureManagerProfile()

  if (!managerProfile) {
    return { error: '사용자를 처리할 권한이 없습니다.' }
  }

  try {
    const supabase = createAdminClient()
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, role, status')
      .eq('id', parsed.data.memberId)
      .maybeSingle()

    if (profileError) {
      console.error('[manager] transitionMemberToInactive profile error', profileError)
      return { error: '사용자 정보를 불러오지 못했습니다.' }
    }

    if (!profile || profile.status !== 'approved') {
      return { error: '이미 처리되었거나 승인 상태가 아닌 사용자입니다.' }
    }

    if (profile.role === 'principal') {
      return { error: '원장 계정은 처리할 수 없습니다.' }
    }

    const { error: deleteStudentsError } = await supabase
      .from('class_students')
      .delete()
      .eq('student_id', profile.id)

    if (deleteStudentsError) {
      console.error('[manager] transitionMemberToInactive class_students error', deleteStudentsError)
    }

    const { error: deleteTeachersError } = await supabase
      .from('class_teachers')
      .delete()
      .eq('teacher_id', profile.id)

    if (deleteTeachersError) {
      console.error('[manager] transitionMemberToInactive class_teachers error', deleteTeachersError)
    }

    const { error: updateStatusError } = await supabase
      .from('profiles')
      .update({ status: parsed.data.nextStatus, updated_at: new Date().toISOString() })
      .eq('id', profile.id)

    if (updateStatusError) {
      console.error('[manager] transitionMemberToInactive update error', updateStatusError)
      return { error: '사용자 상태를 변경하지 못했습니다.' }
    }

    revalidatePath('/dashboard/manager/members')
    revalidatePath('/dashboard/manager')
    revalidatePath('/dashboard/principal/withdrawn-students')
    return { success: true as const }
  } catch (error) {
    console.error('[manager] transitionMemberToInactive unexpected', error)
    return { error: '사용자 상태 변경 중 예상치 못한 문제가 발생했습니다.' }
  }
}

const updateMemberRoleSchema = z.object({
  memberId: z.string().uuid('사용자 ID가 올바르지 않습니다.'),
  newRole: z.enum(['student', 'teacher']),
})

type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>

export async function updateMemberRole(input: UpdateMemberRoleInput) {
  const parsed = updateMemberRoleSchema.safeParse(input)

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]
    return { error: firstIssue?.message ?? '입력값을 확인해주세요.' }
  }

  const managerProfile = await ensureManagerProfile()

  if (!managerProfile) {
    return { error: '역할을 변경할 권한이 없습니다.' }
  }

  try {
    const supabase = createAdminClient()

    // 대상 사용자 정보 조회
    const { data: targetProfile, error: profileError } = await supabase
      .from('profiles')
      .select('id, role, status')
      .eq('id', parsed.data.memberId)
      .maybeSingle()

    if (profileError) {
      console.error('[manager] updateMemberRole profile error', profileError)
      return { error: '사용자 정보를 불러오지 못했습니다.' }
    }

    if (!targetProfile || targetProfile.status !== 'approved') {
      return { error: '승인된 사용자만 역할을 변경할 수 있습니다.' }
    }

    // manager, principal은 역할 변경 불가
    if (targetProfile.role === 'manager' || targetProfile.role === 'principal') {
      return { error: '매니저나 원장의 역할은 변경할 수 없습니다.' }
    }

    // 동일 역할로 변경 시도
    if (targetProfile.role === parsed.data.newRole) {
      return { error: '이미 해당 역할입니다.' }
    }

    // 기존 역할에 따라 반 배정 삭제
    if (targetProfile.role === 'student') {
      const { error: deleteStudentsError } = await supabase
        .from('class_students')
        .delete()
        .eq('student_id', targetProfile.id)

      if (deleteStudentsError) {
        console.error('[manager] updateMemberRole delete class_students error', deleteStudentsError)
      }
    } else if (targetProfile.role === 'teacher') {
      const { error: deleteTeachersError } = await supabase
        .from('class_teachers')
        .delete()
        .eq('teacher_id', targetProfile.id)

      if (deleteTeachersError) {
        console.error('[manager] updateMemberRole delete class_teachers error', deleteTeachersError)
      }
    }

    // 역할 업데이트
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        role: parsed.data.newRole,
        class_id: null, // 역할 변경 시 대표 반 초기화
        updated_at: new Date().toISOString(),
      })
      .eq('id', targetProfile.id)

    if (updateError) {
      console.error('[manager] updateMemberRole update error', updateError)
      return { error: '역할 변경 중 오류가 발생했습니다.' }
    }

    revalidatePath('/dashboard/manager/members')
    revalidatePath('/dashboard/manager')
    return { success: true as const }
  } catch (error) {
    console.error('[manager] updateMemberRole unexpected', error)
    return { error: '역할 변경 중 예상치 못한 문제가 발생했습니다.' }
  }
}

const updateMemberPhotoSchema = z.object({
  memberId: z.string().uuid('유효한 사용자 ID가 아닙니다.'),
  photoPath: z.string().min(1, '사진 경로가 필요합니다.'),
})

export async function updateMemberPhoto(input: z.infer<typeof updateMemberPhotoSchema>) {
  const parsed = updateMemberPhotoSchema.safeParse(input)
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]
    return { error: firstIssue?.message ?? '요청 정보를 확인해주세요.' }
  }

  const managerProfile = await ensureManagerProfile()
  if (!managerProfile) {
    return { error: '사진을 변경할 권한이 없습니다.' }
  }

  try {
    const supabase = createAdminClient()

    const { data: member, error: fetchError } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', parsed.data.memberId)
      .eq('status', 'approved')
      .maybeSingle()

    if (fetchError) {
      console.error('[manager] updateMemberPhoto fetch error', fetchError)
      return { error: '구성원 정보를 불러오지 못했습니다.' }
    }

    if (!member) {
      return { error: '구성원을 찾을 수 없습니다.' }
    }

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ photo_url: parsed.data.photoPath, updated_at: new Date().toISOString() })
      .eq('id', parsed.data.memberId)

    if (updateError) {
      console.error('[manager] updateMemberPhoto update error', updateError)
      return { error: '사진 저장 중 오류가 발생했습니다.' }
    }

    revalidatePath('/dashboard/manager/members')
    revalidatePath('/dashboard/manager')
    revalidatePath('/dashboard/teacher')
    revalidatePath('/dashboard/principal')
    return { success: true as const }
  } catch (error) {
    console.error('[manager] updateMemberPhoto unexpected', error)
    return { error: '사진 업데이트 중 문제가 발생했습니다.' }
  }
}

const deleteMemberPhotoSchema = z.object({
  memberId: z.string().uuid('유효한 사용자 ID가 아닙니다.'),
})

export async function deleteMemberPhoto(input: z.infer<typeof deleteMemberPhotoSchema>) {
  const parsed = deleteMemberPhotoSchema.safeParse(input)
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]
    return { error: firstIssue?.message ?? '요청 정보를 확인해주세요.' }
  }

  const managerProfile = await ensureManagerProfile()
  if (!managerProfile) {
    return { error: '사진을 삭제할 권한이 없습니다.' }
  }

  try {
    const supabase = createAdminClient()

    const { data: member, error: fetchError } = await supabase
      .from('profiles')
      .select('id, photo_url')
      .eq('id', parsed.data.memberId)
      .eq('status', 'approved')
      .maybeSingle()

    if (fetchError) {
      console.error('[manager] deleteMemberPhoto fetch error', fetchError)
      return { error: '구성원 정보를 불러오지 못했습니다.' }
    }

    if (!member) {
      return { error: '구성원을 찾을 수 없습니다.' }
    }

    if (member.photo_url) {
      const { error: storageError } = await supabase.storage
        .from('profile-photos')
        .remove([member.photo_url])

      if (storageError) {
        console.error('[manager] deleteMemberPhoto storage error', storageError)
      }
    }

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ photo_url: null, updated_at: new Date().toISOString() })
      .eq('id', parsed.data.memberId)

    if (updateError) {
      console.error('[manager] deleteMemberPhoto update error', updateError)
      return { error: '사진 삭제 중 오류가 발생했습니다.' }
    }

    revalidatePath('/dashboard/manager/members')
    revalidatePath('/dashboard/manager')
    revalidatePath('/dashboard/teacher')
    revalidatePath('/dashboard/principal')
    return { success: true as const }
  } catch (error) {
    console.error('[manager] deleteMemberPhoto unexpected', error)
    return { error: '사진 삭제 중 문제가 발생했습니다.' }
  }
}

const updateManagerMemoSchema = z.object({
  memberId: z.string().uuid(),
  memo: z.string().nullable(),
})

export async function updateManagerMemo(input: z.infer<typeof updateManagerMemoSchema>) {
  const parsed = updateManagerMemoSchema.safeParse(input)

  if (!parsed.success) {
    return { error: '입력값을 확인해주세요.' }
  }

  const managerProfile = await ensureManagerProfile()

  if (!managerProfile) {
    return { error: '권한이 없습니다.' }
  }

  try {
    const supabase = createAdminClient()
    const { error } = await supabase
      .from('profiles')
      .update({
        manager_memo: parsed.data.memo,
        updated_at: new Date().toISOString(),
      })
      .eq('id', parsed.data.memberId)

    if (error) {
      console.error('[manager] updateManagerMemo failed', error)
      return { error: '메모 저장 중 오류가 발생했습니다.' }
    }

    revalidatePath('/dashboard/manager/enrollment')
    return { success: true }
  } catch (error) {
    console.error('[manager] updateManagerMemo unexpected', error)
    return { error: '예상치 못한 오류가 발생했습니다.' }
  }
}
