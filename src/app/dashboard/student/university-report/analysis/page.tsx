import type { Metadata } from 'next'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import PrintReportButton from '@/components/dashboard/university-report-share/PrintReportButton'
import StudentReportView from '@/components/dashboard/university-report-share/StudentReportView'
import { Card, CardContent } from '@/components/ui/card'
import { requireAuthForDashboard } from '@/lib/auth'
import { fetchEvaluationsForSnapshot } from '@/lib/university-policy/data'
import {
  buildGedReportViewModel,
  buildStudentReportViewModel,
} from '@/lib/university-policy/report-view'
import { fetchReportEligibility } from '@/lib/university-report/data'
import { fetchPublicationForStudent } from '@/lib/university-report/publication'

export const metadata: Metadata = {
  title: '지원가능대학 리포트 | 학생 대시보드',
  description: '우디쌤이 발행한 지원 가능 대학 분석 리포트를 확인합니다.',
}

export default async function StudentAnalysisReportPage() {
  const { profile } = await requireAuthForDashboard('student')

  if (!profile) {
    return null
  }

  const publication = await fetchPublicationForStudent(profile.id)
  const eligibility = await fetchReportEligibility(profile.id)
  const isGed = Boolean(eligibility?.isGed)

  const evaluations =
    !isGed && publication?.snapshotId
      ? await fetchEvaluationsForSnapshot(publication.snapshotId)
      : []

  const studentName = profile.name ?? profile.email ?? '학생'

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
        <DashboardBackLink
          fallbackHref="/dashboard/student/university-report"
          label="내 성적 등록으로 돌아가기"
        />
        {publication ? <PrintReportButton /> : null}
      </div>

      {reportModel ? (
        <StudentReportView model={reportModel} />
      ) : (
        <Card className="border-amber-200 bg-amber-50 shadow-sm">
          <CardContent className="space-y-2 text-sm text-amber-900">
            <p className="font-medium">아직 발행된 리포트가 없습니다.</p>
            <p className="text-amber-800">
              우디쌤이 성적을 검수하고 지원 가능 대학 분석 리포트를 발행하면 이곳에서 확인할 수
              있습니다. 먼저 성적증명서가 등록되어 있는지 확인해 주세요.
            </p>
          </CardContent>
        </Card>
      )}
    </section>
  )
}
