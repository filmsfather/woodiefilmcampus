import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Eye, GraduationCap } from 'lucide-react'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import ManualReportControl from '@/components/dashboard/university-policy/ManualReportControl'
import ShareLinkBox from '@/components/dashboard/university-report-share/ShareLinkBox'
import EligibilitySummary from '@/components/dashboard/university-report/EligibilitySummary'
import UniversityReportCoursesTable from '@/components/dashboard/university-report/UniversityReportCoursesTable'
import UniversityReportEmptyState from '@/components/dashboard/university-report/UniversityReportEmptyState'
import UniversityReportResultSummary from '@/components/dashboard/university-report/UniversityReportResultSummary'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { requireAuthForDashboard } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  fetchActiveSnapshot,
  fetchCoursesForSnapshot,
  fetchGradeSemesterCounts,
  fetchLatestSnapshot,
  fetchReportEligibility,
} from '@/lib/university-report/data'
import { fetchLatestPublicationForStudent } from '@/lib/university-report/publication'

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
  const eligibility = await fetchReportEligibility(student.id)
  const publication = eligibility?.isGed
    ? await fetchLatestPublicationForStudent(student.id)
    : null

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

      <EligibilitySummary
        eligibility={eligibility}
        emptyMessage="학생이 아직 사전 조사에 응답하지 않았습니다."
      />

      {eligibility?.isGed ? (
        <>
          <Card className="border-emerald-200 bg-emerald-50 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-base font-semibold text-emerald-900">
                검정고시 응시자입니다.
              </CardTitle>
              <Button asChild size="sm" variant="outline" className="gap-2">
                <Link href={`/dashboard/principal/university-reports/${student.id}/report`}>
                  <Eye className="size-4" />
                  학생 화면 미리보기
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="text-sm text-emerald-800">
              검정고시로 지원하는 학생이라 성적증명서 업로드가 필요하지 않습니다. 학생부종합전형을
              제외한 모든 전형이 &lsquo;안정&rsquo;으로 안내되며, 아래에서 추가 코멘트를 작성해 리포트를
              공개할 수 있습니다.
            </CardContent>
          </Card>
          <ManualReportControl
            studentId={student.id}
            publication={
              publication
                ? {
                    id: publication.id,
                    status: publication.status,
                    publishedAt: publication.publishedAt,
                    principalComment: publication.principalComment,
                  }
                : null
            }
          />
          {publication?.status === 'published' ? (
            <ShareLinkBox token={publication.shareToken} />
          ) : null}
        </>
      ) : showResult && snapshot ? (
        <>
          <UniversityReportResultSummary
            snapshot={snapshot}
            studentId={student.id}
            gradeSemesterCounts={gradeSemesterCounts}
          />

          {snapshot.status === 'parsed' ? (
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-900">
                  <GraduationCap className="size-4" />
                  지원가능대학 분석
                </CardTitle>
                <Button asChild>
                  <Link href={`/dashboard/principal/university-reports/${student.id}/analysis`}>
                    분석 페이지로 이동
                  </Link>
                </Button>
              </CardHeader>
              <CardContent className="text-sm text-slate-600">
                <p>
                  등록된 대학 산식과 입시 컷을 학생의 성적과 비교해 모집단위별 지원 가능 단계(안정/적정/도전/위험)를 산출합니다.
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  대학·산식·컷이 부족하다면 먼저{' '}
                  <Link href="/dashboard/principal/universities" className="underline">
                    대학 카탈로그
                  </Link>
                  에서 등록을 완료해주세요.
                </p>
              </CardContent>
            </Card>
          ) : null}

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
