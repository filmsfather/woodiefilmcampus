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

export function resolveDashboardPath(role: UserRole) {
  return `/dashboard/${role}`
}

export async function getAuthContext(): Promise<AuthContext> {
  const supabase = createServerSupabase()

  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    return { session: null, profile: null }
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, email, role, status, name, student_phone, parent_phone, academic_record, class_id, created_at, updated_at')
    .eq('id', session.user.id)
    .maybeSingle()

  if (!profile || error || !isUserRole(profile.role)) {
    return {
      session,
      profile: null,
    }
  }

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

  if (profile.status !== 'approved') {
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

  if (profile.status !== 'approved') {
    redirect('/pending-approval')
  }

  if (profile.role) {
    redirect(resolveDashboardPath(profile.role))
  }
}
