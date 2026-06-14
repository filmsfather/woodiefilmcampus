import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import PrintReportButton from '@/components/dashboard/university-report-share/PrintReportButton'
import StudentReportView from '@/components/dashboard/university-report-share/StudentReportView'
import { Card, CardContent } from '@/components/ui/card'
import { requireAuthForDashboard } from '@/lib/auth'
import { fetchAssignedClasses } from '@/lib/dashboard-data'
import { createClient as createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchEvaluationsForSnapshot } from '@/lib/university-policy/data'
import {
  buildGedReportViewModel,
  buildStudentReportViewModel,
} from '@/lib/university-policy/report-view'
import { fetchReportEligibility } from '@/lib/university-report/data'
import { fetchPublicationForStudent } from '@/lib/university-report/publication'

export const metadata: Metadata = {
  title: '학생 대학 리포트 | 교사 대시보드',
  description: '발행된 학생의 지원 가능 대학 분석 리포트를 확인합니다.',
}

export const maxDuration = 300

interface TeacherReportPageProps {
  params: Promise<{ studentId: string }>
}

export default async function TeacherStudentReportPage({ params }: TeacherReportPageProps) {
  const { studentId } = await params
  const { profile } = await requireAuthForDashboard(['teacher', 'manager'])

  if (!profile) {
    return null
  }

  // 일반 교사는 본인 담당 학생의 리포트만 열람할 수 있도록 제한한다(실장/원장은 전체 허용).
  if (profile.role === 'teacher') {
    const supabase = await createServerSupabase()
    const assignedClasses = await fetchAssignedClasses(supabase, profile.id)
    const isAssigned = assignedClasses.some((c) => c.students.some((s) => s.id === studentId))
    if (!isAssigned) {
      notFound()
    }
  }

  const admin = createAdminClient()
  const { data: student, error: studentError } = await admin
    .from('profiles')
    .select('id, name, email')
    .eq('id', studentId)
    .eq('role', 'student')
    .maybeSingle()

  if (studentError) {
    console.error('[teacher-report] student fetch error', studentError)
  }
  if (!student) notFound()

  const studentName = student.name ?? student.email ?? '학생'

  const publication = await fetchPublicationForStudent(student.id)
  const eligibility = await fetchReportEligibility(student.id)
  const isGed = Boolean(eligibility?.isGed)

  const evaluations =
    !isGed && publication?.snapshotId
      ? await fetchEvaluationsForSnapshot(publication.snapshotId)
      : []

  // 검정고시는 발행되면 프리셋 기반 합성 리포트(학종 제외 전 전형 안정)를 보여준다.
  const reportModel =
    publication && isGed
      ? buildGedReportViewModel({ studentName, publication })
      : publication && evaluations.length > 0
        ? buildStudentReportViewModel({ rows: evaluations, studentName, publication })
        : null

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <DashboardBackLink fallbackHref="/dashboard/teacher" label="교사 대시보드로 돌아가기" />
        {publication ? <PrintReportButton /> : null}
      </div>

      <div className="space-y-1 print:hidden">
        <h1 className="text-2xl font-semibold text-slate-900">
          {studentName} 학생 지원가능대학 리포트
        </h1>
        <p className="text-sm text-slate-600">
          우디쌤이 발행한 지원 가능 대학 분석 리포트입니다. 학생·학부모에게 공개된 내용과 동일합니다.
        </p>
      </div>

      {reportModel ? (
        <StudentReportView model={reportModel} />
      ) : (
        <Card className="border-amber-200 bg-amber-50 shadow-sm">
          <CardContent className="space-y-2 text-sm text-amber-900">
            <p className="font-medium">아직 발행된 리포트가 없습니다.</p>
            <p className="text-amber-800">
              우디쌤이 성적을 검수하고 지원 가능 대학 분석 리포트를 발행하면 이곳에서 확인할 수
              있습니다.
            </p>
          </CardContent>
        </Card>
      )}
    </section>
  )
}
