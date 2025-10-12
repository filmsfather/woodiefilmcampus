import { createAdminClient } from '@/lib/supabase/admin'

import type { TeacherPayrollProfile } from './types'

interface TeacherPayrollProfileRow {
  id: string
  teacher_id: string
  hourly_rate: string | number
  hourly_currency: string
  base_salary_amount: string | number | null
  base_salary_currency: string
  contract_type: 'employee' | 'freelancer' | 'none'
  insurance_enrolled: boolean
  effective_from: string
  effective_to: string | null
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

function parseNumeric(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null
  }
  if (typeof value === 'number') {
    return value
  }
  const parsed = Number.parseFloat(value)
  return Number.isNaN(parsed) ? null : parsed
}

function mapTeacherPayrollProfile(row: TeacherPayrollProfileRow): TeacherPayrollProfile {
  return {
    id: row.id,
    teacherId: row.teacher_id,
    hourlyRate: parseNumeric(row.hourly_rate) ?? 0,
    hourlyCurrency: row.hourly_currency,
    baseSalaryAmount: parseNumeric(row.base_salary_amount),
    baseSalaryCurrency: row.base_salary_currency,
    contractType: row.contract_type,
    insuranceEnrolled: row.insurance_enrolled,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    notes: row.notes,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function fetchTeacherPayrollProfiles(
  teacherIds?: string[]
): Promise<Record<string, TeacherPayrollProfile>> {
  const admin = createAdminClient()

  let query = admin
    .from('teacher_payroll_profiles')
    .select(
      `id, teacher_id, hourly_rate, hourly_currency, base_salary_amount, base_salary_currency,
       contract_type, insurance_enrolled, effective_from, effective_to, notes, created_by, created_at, updated_at`
    )

  if (teacherIds && teacherIds.length > 0) {
    query = query.in('teacher_id', teacherIds)
  }

  const { data, error } = await query

  if (error) {
    console.error('[payroll] failed to fetch payroll profiles', error)
    return {}
  }

  return (data ?? []).reduce<Record<string, TeacherPayrollProfile>>((acc, row) => {
    const profile = mapTeacherPayrollProfile(row as TeacherPayrollProfileRow)
    acc[profile.teacherId] = profile
    return acc
  }, {})
}

export function ensurePayrollProfile(profile: TeacherPayrollProfile | undefined | null) {
  if (!profile) {
    throw new Error('급여 프로필이 설정되지 않았습니다. 급여 설정을 먼저 완료해주세요.')
  }
}
