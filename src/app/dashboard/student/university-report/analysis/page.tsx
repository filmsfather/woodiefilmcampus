import type { Metadata } from 'next'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import PrintReportButton from '@/components/dashboard/university-report-share/PrintReportButton'
import StudentReportView from '@/components/dashboard/university-report-share/StudentReportView'
import { Card, CardContent } from '@/components/ui/card'
import { requireAuthForDashboard } from '@/lib/auth'
import { fetchEvaluationsForSnapshot } from '@/lib/university-policy/data'
import { buildStudentReportViewModel } from '@/lib/university-policy/report-view'
import { fetchPublicationForStudent } from '@/lib/university-report/publication'

export const metadata: Metadata = {
  title: '지원가능대학 리포트 | 학생 대시보드',
  description: '우디쌤이 발행한 지원 가능 대학 분석 리포트를 확인합니다.',
}

function formatDateTime(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default async function StudentAnalysisReportPage() {
  const { profile } = await requireAuthForDashboard('student')

  if (!profile) {
    return null
  }

  const publication = await fetchPublicationForStudent(profile.id)

  const evaluations = publication?.snapshotId
    ? await fetchEvaluationsForSnapshot(publication.snapshotId)
    : []

  const isManualReport = !!publication && !publication.snapshotId
  const studentName = profile.name ?? profile.email ?? '학생'

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <DashboardBackLink
          fallbackHref="/dashboard/student/university-report"
          label="내 성적 등록으로 돌아가기"
        />
        {publication ? <PrintReportButton /> : null}
      </div>

      {publication && isManualReport ? (
        <Card className="border-sky-200 shadow-sm">
          <CardContent className="space-y-4 py-6">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-slate-900">
                {studentName} 학생 지원가능대학 리포트
              </h2>
              {publication.publishedAt ? (
                <p className="text-xs text-slate-500">
                  {formatDateTime(publication.publishedAt)} 발행
                </p>
              ) : null}
            </div>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
              {publication.principalComment}
            </p>
          </CardContent>
        </Card>
      ) : !publication || evaluations.length === 0 ? (
        <Card className="border-amber-200 bg-amber-50 shadow-sm">
          <CardContent className="space-y-2 text-sm text-amber-900">
            <p className="font-medium">아직 발행된 리포트가 없습니다.</p>
            <p className="text-amber-800">
              우디쌤이 성적을 검수하고 지원 가능 대학 분석 리포트를 발행하면 이곳에서 확인할 수
              있습니다. 먼저 성적증명서가 등록되어 있는지 확인해 주세요.
            </p>
          </CardContent>
        </Card>
      ) : (
        <StudentReportView
          model={buildStudentReportViewModel({
            rows: evaluations,
            studentName,
            publication,
          })}
        />
      )}
    </section>
  )
}
