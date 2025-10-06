'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { ensureManagerProfile } from '@/lib/authz'
import { createAdminClient } from '@/lib/supabase/admin'

export async function approveStudent(profileId: string) {
  if (!profileId) {
    return { error: '잘못된 요청입니다.' }
  }

  const canManage = await ensureManagerProfile()

  if (!canManage) {
    return { error: '승인 권한이 없습니다.' }
  }

  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('profiles')
      .update({ status: 'approved' })
      .eq('id', profileId)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle()

    if (error) {
      console.error('approveStudent error', error)
      return { error: '승인 처리 중 오류가 발생했습니다.' }
    }

    if (!data) {
      return { error: '이미 처리된 가입 요청입니다.' }
    }

    revalidatePath('/dashboard/manager')
    return { success: true as const }
  } catch (error) {
    console.error('approveStudent unexpected error', error)
    return { error: '예상치 못한 오류가 발생했습니다.' }
  }
}

export async function removePendingUser(profileId: string) {
  if (!profileId) {
    return { error: '잘못된 요청입니다.' }
  }

  const canManage = await ensureManagerProfile()

  if (!canManage) {
    return { error: '삭제 권한이 없습니다.' }
  }

  try {
    const supabase = createAdminClient()
    const { data: profile, error: fetchError } = await supabase
      .from('profiles')
      .select('id, status')
      .eq('id', profileId)
      .maybeSingle()

    if (fetchError) {
      console.error('removePendingUser fetch error', fetchError)
      return { error: '가입 정보를 불러오지 못했습니다.' }
    }

    if (!profile) {
      return { error: '이미 삭제되었거나 존재하지 않는 사용자입니다.' }
    }

    if (profile.status !== 'pending') {
      return { error: '이미 처리된 사용자입니다.' }
    }

    const { error: deleteError } = await supabase.auth.admin.deleteUser(profileId)

    if (deleteError) {
      console.error('removePendingUser delete error', deleteError)
      return { error: '사용자 삭제 중 오류가 발생했습니다.' }
    }

    revalidatePath('/dashboard/manager')
    return { success: true as const }
  } catch (error) {
    console.error('removePendingUser unexpected error', error)
    return { error: '예상치 못한 오류가 발생했습니다.' }
  }
}

const updatePrintRequestSchema = z.object({
  requestId: z.string().uuid('유효한 요청 ID가 아닙니다.'),
  status: z.enum(['done', 'canceled']),
})

type UpdatePrintRequestInput = z.infer<typeof updatePrintRequestSchema>

export async function updatePrintRequestStatus(input: UpdatePrintRequestInput) {
  const managerProfile = await ensureManagerProfile()

  if (!managerProfile) {
    return { error: '인쇄 요청을 처리할 권한이 없습니다.' }
  }

  const parsed = updatePrintRequestSchema.safeParse(input)

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]
    return { error: firstIssue?.message ?? '요청 정보를 확인해주세요.' }
  }

  const payload = parsed.data

  try {
    const supabase = createAdminClient()
    const { data: request, error: fetchError } = await supabase
      .from('print_requests')
      .select('id, status')
      .eq('id', payload.requestId)
      .maybeSingle()

    if (fetchError) {
      console.error('[manager] updatePrintRequestStatus fetch error', fetchError)
      return { error: '인쇄 요청을 불러오지 못했습니다.' }
    }

    if (!request) {
      return { error: '이미 처리되었거나 존재하지 않는 요청입니다.' }
    }

    if (request.status === payload.status) {
      return { success: true as const }
    }

    const { error: updateError } = await supabase
      .from('print_requests')
      .update({ status: payload.status, updated_at: new Date().toISOString() })
      .eq('id', payload.requestId)

    if (updateError) {
      console.error('[manager] updatePrintRequestStatus update error', updateError)
      return { error: '인쇄 요청 상태 변경 중 오류가 발생했습니다.' }
    }

    revalidatePath('/dashboard/manager')
    revalidatePath('/dashboard/teacher')
    return { success: true as const }
  } catch (error) {
    console.error('[manager] updatePrintRequestStatus unexpected error', error)
    return { error: '인쇄 요청 처리 중 예상치 못한 문제가 발생했습니다.' }
  }
}

const updateClassMaterialPrintRequestSchema = z.object({
  requestId: z.string().uuid('유효한 요청 ID가 아닙니다.'),
  status: z.enum(['done', 'canceled']),
})

type UpdateClassMaterialPrintRequestInput = z.infer<typeof updateClassMaterialPrintRequestSchema>

export async function updateClassMaterialPrintRequestStatus(input: UpdateClassMaterialPrintRequestInput) {
  const managerProfile = await ensureManagerProfile()

  if (!managerProfile) {
    return { error: '인쇄 요청을 처리할 권한이 없습니다.' }
  }

  const parsed = updateClassMaterialPrintRequestSchema.safeParse(input)

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]
    return { error: firstIssue?.message ?? '요청 정보를 확인해주세요.' }
  }

  const payload = parsed.data

  try {
    const supabase = createAdminClient()
    const { data: request, error: fetchError } = await supabase
      .from('class_material_print_requests')
      .select('id, status')
      .eq('id', payload.requestId)
      .maybeSingle()

    if (fetchError) {
      console.error('[manager] updateClassMaterialPrintRequestStatus fetch error', fetchError)
      return { error: '인쇄 요청을 불러오지 못했습니다.' }
    }

    if (!request) {
      return { error: '이미 처리되었거나 존재하지 않는 요청입니다.' }
    }

    if (request.status === payload.status) {
      return { success: true as const }
    }

    const { error: updateError } = await supabase
      .from('class_material_print_requests')
      .update({ status: payload.status, updated_at: new Date().toISOString() })
      .eq('id', payload.requestId)

    if (updateError) {
      console.error('[manager] updateClassMaterialPrintRequestStatus update error', updateError)
      return { error: '인쇄 요청 상태 변경 중 오류가 발생했습니다.' }
    }

    revalidatePath('/dashboard/manager')
    revalidatePath('/dashboard/teacher/class-materials')
    return { success: true as const }
  } catch (error) {
    console.error('[manager] updateClassMaterialPrintRequestStatus unexpected error', error)
    return { error: '인쇄 요청 처리 중 예상치 못한 문제가 발생했습니다.' }
  }
}
