import type { Metadata } from 'next'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { PrincipalInactiveMembersClient } from '@/components/dashboard/principal/PrincipalInactiveMembersClient'
import type { InactiveMemberSummary } from '@/components/dashboard/principal/PrincipalInactiveMembersClient'
import { requireAuthForDashboard } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import type { UserRole } from '@/lib/supabase'

export const metadata: Metadata = {
  title: '퇴원생 관리 | 원장 대시보드',
  description: '퇴원생과 졸업생 계정을 한 곳에서 확인하고 복구합니다.',
}

type RawProfileRow = {
  id: string
  name: string | null
  email: string
  role: UserRole
  status: string | null
  student_phone: string | null
  parent_phone: string | null
  academic_record: string | null
  created_at: string
  updated_at: string
}

function mapInactiveMember(row: RawProfileRow): InactiveMemberSummary {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    status: (row.status as 'withdrawn' | 'graduated') ?? 'withdrawn',
    studentPhone: row.student_phone,
    parentPhone: row.parent_phone,
    academicRecord: row.academic_record,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export default async function PrincipalWithdrawnStudentsPage() {
  await requireAuthForDashboard('principal')
  const supabase = createClient()

  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, email, role, status, student_phone, parent_phone, academic_record, created_at, updated_at')
    .in('status', ['withdrawn', 'graduated'])
    .order('updated_at', { ascending: false })

  if (error) {
    console.error('[principal] withdrawn students fetch error', error)
  }

  const inactiveMembers = (data ?? []).map(mapInactiveMember)

  return (
    <section className="space-y-6">
      <DashboardBackLink fallbackHref="/dashboard/principal" label="원장 대시보드로 돌아가기" />
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-slate-900">퇴원생 관리</h1>
        <p className="text-sm text-slate-600">퇴원 및 졸업 처리된 학원생을 확인하고 필요 시 다시 승인하세요.</p>
      </div>
      <PrincipalInactiveMembersClient initialMembers={inactiveMembers} />
    </section>
  )
}
