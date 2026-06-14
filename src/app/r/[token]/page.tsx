import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import SharedReportFlow from '@/components/dashboard/university-report-share/SharedReportFlow'
import StudentReportView from '@/components/dashboard/university-report-share/StudentReportView'
import { Card, CardContent } from '@/components/ui/card'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchEvaluationsForSnapshot } from '@/lib/university-policy/data'
import {
  buildGedReportViewModel,
  buildStudentReportViewModel,
  flattenClassificationItems,
} from '@/lib/university-policy/report-view'
import { fetchPublicationByToken } from '@/lib/university-report/publication'
import {
  buildReportRecommendation,
  fetchWishlistDetailForStudent,
  listWishlistCatalog,
} from '@/lib/university-wishlist/data'

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

  const { data: eligibility } = await supabase
    .from('university_report_eligibility')
    .select('is_ged')
    .eq('student_id', publication.studentId)
    .maybeSingle()
  const isGed = Boolean(eligibility?.is_ged)

  const evaluations =
    !isGed && publication.snapshotId
      ? await fetchEvaluationsForSnapshot(publication.snapshotId)
      : []

  // 검정고시는 DB 평가행 없이 프리셋 기반 합성 리포트(학종 제외 전 전형 안정)를 보여준다.
  const reportModel = isGed
    ? buildGedReportViewModel({ studentName, publication })
    : evaluations.length > 0
      ? buildStudentReportViewModel({ rows: evaluations, studentName, publication })
      : null
  const classificationItems = reportModel ? flattenClassificationItems(reportModel) : []

  // 원장이 추천 전송(proposed 이상)을 마쳤다면 추천 대학·코멘트를 함께 표시한다.
  // 질문·답변 흐름의 시작점으로 학생이 제출한 컨설팅 방향도 함께 넘긴다.
  const wishlistDetail = await fetchWishlistDetailForStudent(publication.studentId)
  const { data: consultRows } = await supabase
    .from('university_report_consult_requests')
    .select('direction, created_at')
    .eq('student_id', publication.studentId)
    .order('created_at', { ascending: false })
    .limit(1)
  const consultDirection = consultRows?.[0]?.direction ?? null
  const recommendation = buildReportRecommendation(wishlistDetail, consultDirection)

  // 학생이 공유 링크에서 직접 응답(지원 확정 / 질문·다른 대학 선택)할 수 있도록 컨텍스트를 넘긴다.
  const recommendationResponse = recommendation
    ? {
        token,
        catalog: listWishlistCatalog(),
        existingProgramKeys: (wishlistDetail?.items ?? [])
          .map((item) => item.programKey)
          .filter((key): key is string => Boolean(key)),
      }
    : null

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

      {reportModel ? (
        <StudentReportView
          model={reportModel}
          recommendation={recommendation}
          recommendationResponse={recommendationResponse}
        />
      ) : (
        <Card className="border-amber-200 bg-amber-50 shadow-sm">
          <CardContent className="space-y-2 py-6 text-sm text-amber-900">
            <p className="font-medium">아직 표시할 분석 결과가 없습니다.</p>
            <p className="text-amber-800">
              리포트가 준비되는 대로 이 페이지에서 확인하실 수 있습니다.
            </p>
          </CardContent>
        </Card>
      )}
    </SharedReportFlow>
  )
}
