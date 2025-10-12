import { createAdminClient } from '@/lib/supabase/admin'
import { createClient as createServerSupabase } from '@/lib/supabase/server'
import { summarizeTeacherProfile, type TeacherProfileSummary } from '@/lib/work-logs'

import {
  mapTeacherPayrollProfile,
  type TeacherPayrollProfileRow,
} from './config'
import type { TeacherPayrollProfile, TeacherContractType } from './types'

interface PayrollProfileRowWithTeacher extends TeacherPayrollProfileRow {
  profiles?: {
    id: string | null
    name: string | null
    email: string | null
  } | null
}

const PROFILE_SELECT = `
  id,
  teacher_id,
  hourly_rate,
  hourly_currency,
  base_salary_amount,
  base_salary_currency,
  contract_type,
  insurance_enrolled,
  effective_from,
  effective_to,
  notes,
  created_by,
  created_at,
  updated_at,
  profiles:profiles!teacher_payroll_profiles_teacher_id_fkey(id, name, email)
`

function mapRow(row: PayrollProfileRowWithTeacher): {
  profile: TeacherPayrollProfile
  teacher: TeacherProfileSummary | null
} {
  const profile = mapTeacherPayrollProfile(row)
  const teacher = row.profiles && row.profiles.id
    ? summarizeTeacherProfile({
        id: row.profiles.id,
        name: row.profiles.name ?? null,
        email: row.profiles.email ?? null,
      })
    : null
  return { profile, teacher }
}

export async function fetchPayrollProfilesWithTeachers(
  teacherIds?: string[]
): Promise<Array<{ profile: TeacherPayrollProfile; teacher: TeacherProfileSummary | null }>> {
  const admin = createAdminClient()

  let query = admin
    .from('teacher_payroll_profiles')
    .select(PROFILE_SELECT)
    .order('effective_from', { ascending: false })

  if (teacherIds && teacherIds.length > 0) {
    query = query.in('teacher_id', teacherIds)
  }

  const { data, error } = await query.returns<PayrollProfileRowWithTeacher[]>()

  if (error) {
    console.error('[payroll] failed to fetch payroll profiles with teachers', error)
    return []
  }

  return (data ?? []).map((row) => mapRow(row))
}

export async function fetchPayrollProfileWithTeacher(
  profileId: string
): Promise<{ profile: TeacherPayrollProfile; teacher: TeacherProfileSummary | null } | null> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('teacher_payroll_profiles')
    .select(PROFILE_SELECT)
    .eq('id', profileId)
    .maybeSingle<PayrollProfileRowWithTeacher>()

  if (error) {
    console.error('[payroll] failed to fetch payroll profile by id', error)
    return null
  }

  if (!data) {
    return null
  }

  return mapRow(data)
}

export interface SavePayrollProfileInput {
  profileId?: string | null
  teacherId: string
  hourlyRate: number
  baseSalaryAmount: number | null
  contractType: TeacherContractType
  insuranceEnrolled: boolean
  effectiveFrom: string
  effectiveTo: string | null
  notes: string | null
}

export async function savePayrollProfile(
  input: SavePayrollProfileInput,
  actorId: string
): Promise<{ profile: TeacherPayrollProfile; teacher: TeacherProfileSummary | null }> {
  const supabase = createServerSupabase()

  let targetProfileId = input.profileId ?? null

  if (!targetProfileId) {
    const { data: existing, error: existingError } = await supabase
      .from('teacher_payroll_profiles')
      .select('id')
      .eq('teacher_id', input.teacherId)
      .maybeSingle<{ id: string }>()

    if (existingError) {
      console.error('[payroll] failed to find existing payroll profile', existingError)
      throw new Error('기존 급여 프로필을 확인하지 못했습니다.')
    }

    if (existing) {
      targetProfileId = existing.id
    }
  }

  const payload = {
    teacher_id: input.teacherId,
    hourly_rate: input.hourlyRate,
    base_salary_amount: input.baseSalaryAmount,
    contract_type: input.contractType,
    insurance_enrolled: input.insuranceEnrolled,
    effective_from: input.effectiveFrom,
    effective_to: input.effectiveTo,
    notes: input.notes,
  }

  let response: PayrollProfileRowWithTeacher | null = null

  if (targetProfileId) {
    const { data, error } = await supabase
      .from('teacher_payroll_profiles')
      .update(payload)
      .eq('id', targetProfileId)
      .select(PROFILE_SELECT)
      .maybeSingle<PayrollProfileRowWithTeacher>()

    if (error || !data) {
      console.error('[payroll] failed to update payroll profile', error)
      throw new Error('급여 프로필을 저장하지 못했습니다.')
    }

    response = data
  } else {
    const { data, error } = await supabase
      .from('teacher_payroll_profiles')
      .insert({
        ...payload,
        created_by: actorId,
      })
      .select(PROFILE_SELECT)
      .maybeSingle<PayrollProfileRowWithTeacher>()

    if (error || !data) {
      console.error('[payroll] failed to insert payroll profile', error)
      throw new Error('급여 프로필을 저장하지 못했습니다.')
    }

    response = data
  }

  return mapRow(response)
}

export async function setPayrollProfileEffectiveTo(
  profileId: string,
  effectiveTo: string | null
): Promise<TeacherPayrollProfile | null> {
  const supabase = createServerSupabase()

  const { data, error } = await supabase
    .from('teacher_payroll_profiles')
    .update({ effective_to: effectiveTo })
    .eq('id', profileId)
    .select(
      `id, teacher_id, hourly_rate, hourly_currency, base_salary_amount, base_salary_currency,
       contract_type, insurance_enrolled, effective_from, effective_to, notes, created_by, created_at, updated_at`
    )
    .maybeSingle<TeacherPayrollProfileRow>()

  if (error) {
    console.error('[payroll] failed to update effective_to', error)
    return null
  }

  if (!data) {
    return null
  }

  return mapTeacherPayrollProfile(data)
}
