import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import UniversityReportCoursesTable from '@/components/dashboard/university-report/UniversityReportCoursesTable'
import UniversityReportEmptyState from '@/components/dashboard/university-report/UniversityReportEmptyState'
import UniversityReportResultSummary from '@/components/dashboard/university-report/UniversityReportResultSummary'
import { Card, CardContent } from '@/components/ui/card'
import { requireAuthForDashboard } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  fetchActiveSnapshot,
  fetchCoursesForSnapshot,
  fetchGradeSemesterCounts,
  fetchLatestSnapshot,
} from '@/lib/university-report/data'

export const metadata: Metadata = {
  title: '학생 성적증명서 | 지원가능대학 레포트',
  description: '학생의 성적증명서 업로드 및 분석 결과를 확인합니다.',
}

// 교사가 학생 대신 PDF를 업로드할 때도 Gemini 호출이 1분 이상 걸릴 수 있어 동일하게 확장.
export const maxDuration = 300

interface PrincipalStudentReportPageProps {
  params: Promise<{ studentId: string }>
}

export default async function PrincipalStudentReportPage({
  params,
}: PrincipalStudentReportPageProps) {
  const { studentId } = await params
  await requireAuthForDashboard('principal')

  const supabase = createAdminClient()
  const { data: student, error: studentError } = await supabase
    .from('profiles')
    .select('id, name, email, class_id')
    .eq('id', studentId)
    .eq('role', 'student')
    .maybeSingle()

  if (studentError) {
    console.error('[principal-university-report] student fetch error', studentError)
  }

  if (!student) {
    notFound()
  }

  let className: string | null = null
  if (student.class_id) {
    const { data: classRow } = await supabase
      .from('classes')
      .select('name')
      .eq('id', student.class_id)
      .maybeSingle()
    className = classRow?.name ?? null
  }

  const activeSnapshot = await fetchActiveSnapshot(student.id)
  const fallbackLatest = activeSnapshot ? null : await fetchLatestSnapshot(student.id)
  const snapshot = activeSnapshot ?? fallbackLatest
  const showResult =
    snapshot !== null &&
    (snapshot.status === 'parsed' || snapshot.status === 'parsing' || snapshot.status === 'failed')

  const gradeSemesterCounts = snapshot ? await fetchGradeSemesterCounts(snapshot.id) : []
  const courses =
    snapshot && snapshot.status === 'parsed'
      ? await fetchCoursesForSnapshot(snapshot.id)
      : []

  return (
    <section className="space-y-6">
      <DashboardBackLink
        fallbackHref="/dashboard/principal/university-reports"
        label="학생 목록으로 돌아가기"
      />

      <Card className="border-slate-200 shadow-sm">
        <CardContent className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">
              {student.name ?? student.email}
            </h1>
            <p className="text-xs text-slate-500">{student.email}</p>
          </div>
          <div className="text-sm text-slate-600">{className ?? '반 미지정'}</div>
        </CardContent>
      </Card>

      {showResult && snapshot ? (
        <>
          <UniversityReportResultSummary
            snapshot={snapshot}
            studentId={student.id}
            gradeSemesterCounts={gradeSemesterCounts}
          />
          {courses.length > 0 ? (
            <UniversityReportCoursesTable courses={courses} studentId={student.id} />
          ) : null}
        </>
      ) : (
        <UniversityReportEmptyState studentId={student.id} isViewingOther={true} />
      )}
    </section>
  )
}
