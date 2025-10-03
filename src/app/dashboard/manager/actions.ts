'use server'

import { revalidatePath } from 'next/cache'

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
