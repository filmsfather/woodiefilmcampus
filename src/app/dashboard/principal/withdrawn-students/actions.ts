'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { ensurePrincipalProfile } from '@/lib/authz'
import { createAdminClient } from '@/lib/supabase/admin'

const reactivateMemberSchema = z.object({
  memberId: z.string().uuid('사용자 ID가 올바르지 않습니다.'),
})

type ReactivateMemberInput = z.infer<typeof reactivateMemberSchema>

export async function reactivateInactiveMember(input: ReactivateMemberInput) {
  const parsed = reactivateMemberSchema.safeParse(input)

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]
    return { error: firstIssue?.message ?? '사용자 정보를 확인해주세요.' }
  }

  const principalProfile = await ensurePrincipalProfile()

  if (!principalProfile) {
    return { error: '원장 권한이 필요합니다.' }
  }

  try {
    const supabase = createAdminClient()
    const { data: member, error: fetchError } = await supabase
      .from('profiles')
      .select('id, status')
      .eq('id', parsed.data.memberId)
      .maybeSingle()

    if (fetchError) {
      console.error('[principal] reactivateInactiveMember fetch error', fetchError)
      return { error: '사용자 정보를 불러오지 못했습니다.' }
    }

    if (!member || (member.status !== 'withdrawn' && member.status !== 'graduated')) {
      return { error: '퇴원 또는 졸업 상태의 사용자만 복구할 수 있습니다.' }
    }

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ status: 'approved', updated_at: new Date().toISOString() })
      .eq('id', member.id)

    if (updateError) {
      console.error('[principal] reactivateInactiveMember update error', updateError)
      return { error: '사용자 상태를 복구하지 못했습니다.' }
    }

    revalidatePath('/dashboard/principal/withdrawn-students')
    revalidatePath('/dashboard/manager/members')
    revalidatePath('/dashboard/manager')
    return { success: true as const }
  } catch (error) {
    console.error('[principal] reactivateInactiveMember unexpected', error)
    return { error: '사용자를 복구하는 중 문제가 발생했습니다.' }
  }
}
