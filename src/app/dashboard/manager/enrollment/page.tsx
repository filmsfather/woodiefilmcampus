import { Metadata } from 'next'

import type { EnrollmentApplicationItem } from '@/components/enrollment/EnrollmentApplicationsTable'
import type { ClassSummary, UnassignedStudentSummary } from '@/components/dashboard/manager/UnassignedStudentsTable'
import { PendingApprovalList } from '@/components/dashboard/manager/PendingApprovalList'
import { EnrollmentApplicationsTable } from '@/components/enrollment/EnrollmentApplicationsTable'
import { EnrollmentStatusSyncButton } from '@/components/dashboard/manager/EnrollmentStatusSyncButton'
import { UnassignedStudentsTable } from '@/components/dashboard/manager/UnassignedStudentsTable'
import { requireAuthForDashboard } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = {
  title: '등록원서 접수 현황 | 실장 대시보드',
  description: '등록원서를 제출한 학생 목록을 한눈에 확인합니다.',
}

export default async function ManagerEnrollmentApplicationsPage() {
  await requireAuthForDashboard('manager')
  const supabase = createClient()

  const [pendingStudentsResult, applicationsResult, approvedStudentsResult, classesResult] = await Promise.all([
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
         created_at,
         status,
         status_updated_at,
         status_updated_by,
         matched_profile_id,
         assigned_class_id
        `
      )
      .order('created_at', { ascending: false }),
    supabase
      .from('profiles')
      .select('id, email, name, student_phone, parent_phone, academic_record, role, status, manager_memo')
      .eq('status', 'approved')
      .eq('role', 'student')
      .order('created_at', { ascending: true }),
    supabase
      .from('classes')
      .select('id, name')
      .order('name', { ascending: true }),
  ])

  if (pendingStudentsResult.error) {
    console.error('[enrollment] pending students error', pendingStudentsResult.error)
  }

  if (applicationsResult.error) {
    console.error('[enrollment] fetch applications error', applicationsResult.error)
  }

  if (approvedStudentsResult.error) {
    console.error('[enrollment] fetch approved students error', approvedStudentsResult.error)
  }

  if (classesResult.error) {
    console.error('[enrollment] fetch classes error', classesResult.error)
  }

  const pendingStudents = pendingStudentsResult.data ?? []
  const applicationsRaw = applicationsResult.data ?? []
  const approvedStudents = approvedStudentsResult.data ?? []
  const classes = (classesResult.data ?? []) as ClassSummary[]

  const studentIds = approvedStudents.map((student) => student.id)
  const unassignedStudents: UnassignedStudentSummary[] = []

  if (studentIds.length > 0) {
    const { data: assignmentRows, error: assignmentError } = await supabase
      .from('class_students')
      .select('student_id')
      .in('student_id', studentIds)

    if (assignmentError) {
      console.error('[enrollment] fetch class assignments error', assignmentError)
    }

    const assignedIds = new Set(assignmentRows?.map((row) => row.student_id) ?? [])

    for (const student of approvedStudents) {
      if (assignedIds.has(student.id)) {
        continue
      }

      unassignedStudents.push({
        id: student.id,
        name: student.name ?? null,
        email: student.email,
        studentPhone: student.student_phone ?? null,
        parentPhone: student.parent_phone ?? null,
        academicRecord: student.academic_record ?? null,
        managerMemo: student.manager_memo ?? null,
      })
    }
  }

  const classNameMap = new Map(classes.map((item) => [item.id, item.name ?? '']))

  const applications: EnrollmentApplicationItem[] = applicationsRaw.map((item) => ({
    ...item,
    assigned_class_name: item.assigned_class_id ? classNameMap.get(item.assigned_class_id) ?? null : null,
  }))
  const activeApplications = applications.filter((item) => item.status !== 'assigned')
  const assignedApplications = applications.filter((item) => item.status === 'assigned')

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-slate-900">등록원서 접수 현황</h1>
        <p className="text-sm text-slate-600">접수된 학생 등록 정보를 확인하고 상담 일정 안내를 진행하세요.</p>
      </div>
      <PendingApprovalList students={pendingStudents} />
      <UnassignedStudentsTable students={unassignedStudents} classes={classes} />
      <EnrollmentApplicationsTable
        title="미확인 · 가입완료"
        actions={(
          <EnrollmentStatusSyncButton hasPending={activeApplications.length > 0} />
        )}
        applications={activeApplications}
        emptyHint="미확인 또는 가입완료 상태의 등록원서가 없습니다."
      />
      <EnrollmentApplicationsTable title="반배정 완료" applications={assignedApplications} emptyHint="아직 반배정 완료된 학생이 없습니다." />
    </section>
  )
}
