'use server'

import { redirect } from 'next/navigation'

import { resolveDashboardPath } from '@/lib/auth'
import { CCTV_CONSENT_TYPE, CURRENT_CCTV_CONSENT_VERSION } from '@/lib/consents'
import type { UserRole } from '@/lib/supabase'
import { createClient } from '@/lib/supabase/server'

const ALLOWED_ROLES: UserRole[] = ['principal', 'manager', 'teacher', 'student']

function isUserRole(value: string | null | undefined): value is UserRole {
  return typeof value === 'string' && (ALLOWED_ROLES as string[]).includes(value)
}

export interface CctvConsentState {
  error?: string
}

export async function agreeCctvConsent(
  _prev: CctvConsentState,
  formData: FormData
): Promise<CctvConsentState> {
  const agreed = formData.get('agreed')

  if (agreed !== 'on' && agreed !== 'true') {
    return { error: '동의 여부를 확인해주세요.' }
  }

  const supabase = await createClient()

  const { data: userData, error: userError } = await supabase.auth.getUser()

  if (userError || !userData.user) {
    redirect('/login')
  }

  const userId = userData.user.id

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, status')
    .eq('id', userId)
    .maybeSingle()

  if (profileError || !profile) {
    return { error: '프로필 정보를 확인할 수 없습니다.' }
  }

  if (profile.status !== 'approved') {
    redirect('/pending-approval')
  }

  const { error: insertError } = await supabase.from('user_consents').insert({
    user_id: userId,
    consent_type: CCTV_CONSENT_TYPE,
    version: CURRENT_CCTV_CONSENT_VERSION,
    agreed: true,
  })

  if (insertError) {
    const isDuplicate = insertError.code === '23505'

    if (!isDuplicate) {
      console.error('[cctv-consent] failed to insert consent', insertError)
      return { error: '동의 저장 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' }
    }
  }

  const dashboardPath = isUserRole(profile.role)
    ? resolveDashboardPath(profile.role)
    : '/dashboard'
  redirect(dashboardPath)
}
