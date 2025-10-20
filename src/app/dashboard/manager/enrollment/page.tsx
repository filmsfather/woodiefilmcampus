import { Metadata } from 'next'

import { EnrollmentApplicationsTable } from '@/components/enrollment/EnrollmentApplicationsTable'
import { requireAuthForDashboard } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = {
  title: '등록원서 접수 현황 | 실장 대시보드',
  description: '등록원서를 제출한 학생 목록을 한눈에 확인합니다.',
}

export default async function ManagerEnrollmentApplicationsPage() {
  await requireAuthForDashboard('manager')
  const supabase = createClient()

  const { data, error } = await supabase
    .from('enrollment_applications')
    .select(
       `id,
        student_name,
        student_number,
        parent_phone,
        student_phone,
        desired_class,
       saturday_briefing_received,
       schedule_fee_confirmed,
       created_at
      `
    )
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[enrollment] fetch applications error', error)
  }

  const applications = data ?? []

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-slate-900">등록원서 접수 현황</h1>
        <p className="text-sm text-slate-600">접수된 학생 등록 정보를 확인하고 상담 일정 안내를 진행하세요.</p>
      </div>
      <EnrollmentApplicationsTable applications={applications} />
    </section>
  )
}
