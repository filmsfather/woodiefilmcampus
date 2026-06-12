import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import SharedReportFlow from '@/components/dashboard/university-report-share/SharedReportFlow'
import StudentReportView from '@/components/dashboard/university-report-share/StudentReportView'
import { Card, CardContent } from '@/components/ui/card'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchEvaluationsForSnapshot } from '@/lib/university-policy/data'
import {
  buildStudentReportViewModel,
  flattenClassificationItems,
} from '@/lib/university-policy/report-view'
import { fetchPublicationByToken } from '@/lib/university-report/publication'

export const metadata: Metadata = {
  title: '지원가능대학 리포트',
  description: '우디필름캠퍼스가 발행한 지원 가능 대학 분석 리포트입니다.',
  robots: { index: false, follow: false },
}

export const maxDuration = 300

interface SharedReportPageProps {
  params: Promise<{ token: string }>
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

export default async function SharedReportPage({ params }: SharedReportPageProps) {
  const { token } = await params

  const publication = await fetchPublicationByToken(token)
  if (!publication) {
    notFound()
  }

  const supabase = createAdminClient()
  const { data: student } = await supabase
    .from('profiles')
    .select('name, email')
    .eq('id', publication.studentId)
    .maybeSingle()

  const studentName = student?.name ?? student?.email ?? '학생'

  const evaluations = publication.snapshotId
    ? await fetchEvaluationsForSnapshot(publication.snapshotId)
    : []
  const isManualReport = !publication.snapshotId

  const reportModel =
    !isManualReport && evaluations.length > 0
      ? buildStudentReportViewModel({ rows: evaluations, studentName, publication })
      : null
  const classificationItems = reportModel ? flattenClassificationItems(reportModel) : []

  // 이미 희망대학 분류를 제출한 적이 있는지 확인해, 재방문 시 표지에서 안내한다.
  const { count: wishCount } = await supabase
    .from('university_report_university_wishes')
    .select('id', { count: 'exact', head: true })
    .eq('publication_id', publication.id)
  const alreadySubmitted = (wishCount ?? 0) > 0

  return (
    <SharedReportFlow
      studentName={studentName}
      token={token}
      publicationId={publication.id}
      classificationItems={classificationItems}
      alreadySubmitted={alreadySubmitted}
    >
      <header className="space-y-1 text-center">
        <p className="text-xs font-medium uppercase tracking-wide text-sky-600">
          우디필름캠퍼스
        </p>
        <h1 className="text-2xl font-semibold text-slate-900">
          {studentName} 학생 지원가능대학 리포트
        </h1>
        <p className="text-xs text-slate-500">
          {formatDateTime(publication.publishedAt)} 발행
        </p>
      </header>

      {isManualReport ? (
        <Card className="border-sky-200 shadow-sm">
          <CardContent className="space-y-4 py-6">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
              {publication.principalComment}
            </p>
          </CardContent>
        </Card>
      ) : evaluations.length === 0 ? (
        <Card className="border-amber-200 bg-amber-50 shadow-sm">
          <CardContent className="space-y-2 py-6 text-sm text-amber-900">
            <p className="font-medium">아직 표시할 분석 결과가 없습니다.</p>
            <p className="text-amber-800">
              리포트가 준비되는 대로 이 페이지에서 확인하실 수 있습니다.
            </p>
          </CardContent>
        </Card>
      ) : reportModel ? (
        <StudentReportView model={reportModel} />
      ) : null}
    </SharedReportFlow>
  )
}
