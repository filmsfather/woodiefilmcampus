import type { UserProfile } from '@/lib/supabase'
import { getAuthContext } from '@/lib/auth'

const ADMIN_ROLES = new Set<UserProfile['role']>(['manager', 'principal'])
const PRINCIPAL_ROLES = new Set<UserProfile['role']>(['principal'])

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

export async function ensurePrincipalProfile() {
  const { profile } = await getAuthContext()

  if (!profile || !PRINCIPAL_ROLES.has(profile.role)) {
    return null
  }

  return profile
}

export async function requirePrincipalProfile() {
  const profile = await ensurePrincipalProfile()

  if (!profile) {
    throw new Error('원장 권한이 필요합니다.')
  }

  return profile
}
