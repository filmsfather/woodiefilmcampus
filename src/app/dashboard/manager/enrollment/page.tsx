import { Metadata } from 'next'

import { PendingApprovalList } from '@/components/dashboard/manager/PendingApprovalList'
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

  const [pendingStudentsResult, applicationsResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, email, name, student_phone, parent_phone, academic_record, created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: true }),
    supabase
      .from('enrollment_applications')
      .select(
        `id,
         student_name,
         parent_phone,
         student_phone,
         desired_class,
         saturday_briefing_received,
         schedule_fee_confirmed,
         created_at
        `
      )
      .order('created_at', { ascending: false }),
  ])

  if (pendingStudentsResult.error) {
    console.error('[enrollment] pending students error', pendingStudentsResult.error)
  }

  if (applicationsResult.error) {
    console.error('[enrollment] fetch applications error', applicationsResult.error)
  }

  const pendingStudents = pendingStudentsResult.data ?? []
  const applications = applicationsResult.data ?? []

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-slate-900">등록원서 접수 현황</h1>
        <p className="text-sm text-slate-600">접수된 학생 등록 정보를 확인하고 상담 일정 안내를 진행하세요.</p>
      </div>
      <PendingApprovalList students={pendingStudents} />
      <EnrollmentApplicationsTable applications={applications} />
    </section>
  )
}
