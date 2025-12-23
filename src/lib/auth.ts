import type { Session } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'

import type { UserProfile, UserRole } from '@/lib/supabase'
import { createClient as createServerSupabase } from '@/lib/supabase/server'

export interface AuthContext {
  session: Session | null
  profile: UserProfile | null
}

function isUserRole(value: string): value is UserRole {
  return ['principal', 'manager', 'teacher', 'student'].includes(value)
}

function isApprovedStatus(value: string | null | undefined) {
  return typeof value === 'string' && value.trim().toLowerCase() === 'approved'
}

export function isProfileComplete(profile: UserProfile | null): boolean {
  if (!profile) return false
  return !!(profile.name && profile.student_phone && profile.academic_record)
}

export function resolveDashboardPath(role: UserRole) {
  return `/dashboard/${role}`
}

export async function getAuthContext(): Promise<AuthContext> {
  const supabase = await createServerSupabase()

  const { data: userData, error: userError } = await supabase.auth.getUser()

  if (userError || !userData.user) {
    return { session: null, profile: null }
  }

  const { data: sessionData } = await supabase.auth.getSession()
  const session = sessionData?.session ?? null

  if (!session) {
    return { session: null, profile: null }
  }

  const userId = userData.user.id

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, email, role, status, name, student_phone, parent_phone, academic_record, class_id, created_at, updated_at')
    .eq('id', userId)
    .maybeSingle()

  if (!profile || error || !isUserRole(profile.role)) {
    return {
      session,
      profile: null,
    }
  }

  console.log('[auth] profile status debug', {
    email: profile.email,
    status: profile.status,
    role: profile.role,
  })

  return {
    session,
    profile: { ...profile, role: profile.role },
  }
}

export async function requireAuthForDashboard(targetRole?: UserRole | UserRole[]) {
  const { session, profile } = await getAuthContext()

  if (!session) {
    redirect('/login')
  }

  if (!profile?.role) {
    redirect('/login')
  }

  if (!isApprovedStatus(profile.status)) {
    redirect('/pending-approval')
  }

  const allowedRoles = Array.isArray(targetRole) ? targetRole : targetRole ? [targetRole] : null

  if (
    allowedRoles &&
    !allowedRoles.includes(profile.role) &&
    profile.role !== 'principal'
  ) {
    redirect(resolveDashboardPath(profile.role))
  }

  return { session, profile }
}

export async function redirectAuthenticatedUser() {
  const { session, profile } = await getAuthContext()

  // 로그인 안 된 상태
  if (!session) {
    return
  }

  // 프로필이 없거나 필수 정보 미완성 → 프로필 완성 페이지로
  if (!profile || !isProfileComplete(profile)) {
    redirect('/complete-profile')
  }

  // 승인 대기 상태
  if (!isApprovedStatus(profile.status)) {
    redirect('/pending-approval')
  }

  // 승인됨 → 대시보드로
  if (profile.role) {
    redirect(resolveDashboardPath(profile.role))
  }
}
