import type { UserProfile } from '@/lib/supabase'
import { getAuthContext } from '@/lib/auth'

const ADMIN_ROLES = new Set<UserProfile['role']>(['manager', 'principal'])

export async function ensureManagerProfile() {
  const { profile } = await getAuthContext()

  if (!profile || !ADMIN_ROLES.has(profile.role)) {
    return null
  }

  return profile
}

export async function requireManagerProfile() {
  const profile = await ensureManagerProfile()

  if (!profile) {
    throw new Error('관리자 권한이 필요합니다.')
  }

  return profile
}

