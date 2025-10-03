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

export function resolveDashboardPath(role: UserRole) {
  return `/dashboard/${role}`
}

export async function getAuthContext(): Promise<AuthContext> {
  const supabase = createServerSupabase()

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

export async function requireAuthForDashboard(targetRole?: UserRole) {
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

  if (targetRole && targetRole !== profile.role && profile.role !== 'principal') {
    redirect(resolveDashboardPath(profile.role))
  }

  return { session, profile }
}

export async function redirectAuthenticatedUser() {
  const { profile } = await getAuthContext()

  if (!profile) {
    return
  }

  if (!isApprovedStatus(profile.status)) {
    redirect('/pending-approval')
  }

  if (profile.role) {
    redirect(resolveDashboardPath(profile.role))
  }
}
