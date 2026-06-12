import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Eye } from 'lucide-react'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import PrincipalWishlistPanel from '@/components/dashboard/university-wishlist/PrincipalWishlistPanel'
import PrintReportButton from '@/components/dashboard/university-report-share/PrintReportButton'
import StudentReportView from '@/components/dashboard/university-report-share/StudentReportView'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { requireAuthForDashboard } from '@/lib/auth'
import { PROFILE_PHOTOS_BUCKET } from '@/lib/storage/buckets'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchEvaluationsForSnapshot } from '@/lib/university-policy/data'
import {
  buildStudentReportViewModel,
  resolveItemTier,
} from '@/lib/university-policy/report-view'
import type { VerdictTier } from '@/lib/university-policy/types'
import {
  fetchActiveSnapshot,
  fetchLatestSnapshot,
} from '@/lib/university-report/data'
import {
  fetchLatestPublicationForStudent,
  fetchLatestUniversityWishMap,
} from '@/lib/university-report/publication'
import {
  buildReportRecommendation,
  fetchWishlistDetailForStudent,
  listWishlistCatalog,
} from '@/lib/university-wishlist/data'

export const metadata: Metadata = {
  title: '학생 화면 미리보기 | 지원가능대학 리포트',
}

export const maxDuration = 300

interface ReportPreviewPageProps {
  params: Promise<{ studentId: string }>
}

export default async function ReportPreviewPage({ params }: ReportPreviewPageProps) {
  const { studentId } = await params
  await requireAuthForDashboard('principal')

  const supabase = createAdminClient()
  const { data: student, error: studentError } = await supabase
    .from('profiles')
    .select('id, name, email, photo_url')
    .eq('id', studentId)
    .eq('role', 'student')
    .maybeSingle()

  if (studentError) {
    console.error('[principal-report-preview] student fetch error', studentError)
  }
  if (!student) notFound()

  const activeSnapshot = await fetchActiveSnapshot(student.id)
  const fallback = activeSnapshot ? null : await fetchLatestSnapshot(student.id)
  const snapshot = activeSnapshot ?? fallback

  const evaluations =
    snapshot && snapshot.status === 'parsed'
      ? await fetchEvaluationsForSnapshot(snapshot.id)
      : []
  const publication = await fetchLatestPublicationForStudent(student.id)
  const isPublished = publication?.status === 'published'

  const wishlistDetail = await fetchWishlistDetailForStudent(student.id)
  const wishlistCatalog = listWishlistCatalog()
  const verdictByProgramKey = evaluations.reduce<Record<string, VerdictTier>>((acc, row) => {
    acc[row.programKey] = resolveItemTier(row.analysisMode, row.verdicts)
    return acc
  }, {})

  // 학생이 공유 링크에서 분류한 희망/비희망 결과를 모집단위(programKey) 기준으로 변환한다.
  const wishByEvaluationId = await fetchLatestUniversityWishMap(student.id)
  const wishByProgramKey = evaluations.reduce<Record<string, boolean>>((acc, row) => {
    if (row.id in wishByEvaluationId) {
      acc[row.programKey] = wishByEvaluationId[row.id]
    }
    return acc
  }, {})

  const studentName = student.name ?? student.email ?? '학생'

  // 사전조사(농어촌·차상위·검정고시)와 학생이 제출한 컨설팅 방향을 함께 보여준다.
  const { data: eligibility } = await supabase
    .from('university_report_eligibility')
    .select('is_ged, rural_eligible, low_income_eligible')
    .eq('student_id', student.id)
    .maybeSingle()

  const { data: consultRows } = await supabase
    .from('university_report_consult_requests')
    .select('direction, created_at')
    .eq('student_id', student.id)
    .order('created_at', { ascending: false })
    .limit(1)
  const consultDirection = consultRows?.[0]?.direction ?? null
  const recommendation = buildReportRecommendation(wishlistDetail, consultDirection)

  let photoUrl: string | null = null
  if (student.photo_url) {
    const { data } = supabase.storage.from(PROFILE_PHOTOS_BUCKET).getPublicUrl(student.photo_url)
    photoUrl = data.publicUrl
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <DashboardBackLink
          fallbackHref={`/dashboard/principal/university-reports/${student.id}/analysis`}
          label="분석/공개 관리로 돌아가기"
        />
        {evaluations.length > 0 ? <PrintReportButton /> : null}
      </div>

      <Card className="border-sky-200 bg-sky-50 shadow-sm print:hidden">
        <CardContent className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-sm text-sky-900">
            <Eye className="size-4" />
            학생·학부모에게 보여질 화면 미리보기입니다.
          </p>
          {isPublished ? (
            <Badge className="bg-emerald-100 text-emerald-700">현재 공개됨</Badge>
          ) : (
            <Badge className="bg-slate-200 text-slate-600">아직 비공개</Badge>
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-200 shadow-sm print:hidden">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-slate-900">
            희망대학 선정 협의
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <StudentInfoBlock
            studentName={studentName}
            photoUrl={photoUrl}
            consultDirection={consultDirection}
            isGed={eligibility?.is_ged ?? false}
            ruralEligible={eligibility?.rural_eligible ?? false}
            lowIncomeEligible={eligibility?.low_income_eligible ?? false}
          />
          <PrincipalWishlistPanel
            studentId={student.id}
            detail={wishlistDetail}
            catalog={wishlistCatalog}
            verdictByProgramKey={verdictByProgramKey}
            wishByProgramKey={wishByProgramKey}
          />
        </CardContent>
      </Card>

      {evaluations.length === 0 ? (
        <Card className="border-amber-200 bg-amber-50 shadow-sm">
          <CardContent className="text-sm text-amber-900">
            아직 분석 결과가 없습니다. 분석/공개 관리 페이지에서 먼저 분석을 실행해 주세요.
          </CardContent>
        </Card>
      ) : (
        <StudentReportView
          model={buildStudentReportViewModel({
            rows: evaluations,
            studentName,
            publication,
          })}
          recommendation={recommendation}
        />
      )}
    </section>
  )
}

function StudentInfoBlock({
  studentName,
  photoUrl,
  consultDirection,
  isGed,
  ruralEligible,
  lowIncomeEligible,
}: {
  studentName: string
  photoUrl: string | null
  consultDirection: string | null
  isGed: boolean
  ruralEligible: boolean
  lowIncomeEligible: boolean
}) {
  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-start gap-4">
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoUrl}
            alt={`${studentName} 학생 사진`}
            className="size-20 shrink-0 rounded-lg border border-slate-200 object-cover"
          />
        ) : (
          <div className="flex size-20 shrink-0 items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 text-xs text-slate-400">
            사진 없음
          </div>
        )}
        <div className="min-w-0 space-y-1.5">
          <p className="text-lg font-semibold text-slate-900">{studentName}</p>
          <div className="flex flex-wrap gap-1.5">
            {isGed ? <Badge className="bg-emerald-100 text-emerald-700">검정고시</Badge> : null}
            {ruralEligible ? (
              <Badge className="bg-lime-100 text-lime-700">농어촌 지원 가능</Badge>
            ) : (
              <Badge className="bg-slate-100 text-slate-500">농어촌 불가</Badge>
            )}
            {lowIncomeEligible ? (
              <Badge className="bg-amber-100 text-amber-700">차상위 지원 가능</Badge>
            ) : (
              <Badge className="bg-slate-100 text-slate-500">차상위 불가</Badge>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-1">
        <p className="text-xs font-medium text-slate-500">학생이 입력한 컨설팅 방향</p>
        {consultDirection ? (
          <p className="whitespace-pre-wrap rounded-md border border-slate-100 bg-slate-50 p-3 text-sm leading-relaxed text-slate-700">
            {consultDirection}
          </p>
        ) : (
          <p className="rounded-md border border-dashed border-slate-200 p-3 text-xs text-slate-400">
            아직 학생이 컨설팅 방향을 제출하지 않았습니다.
          </p>
        )}
      </div>
    </div>
  )
}
