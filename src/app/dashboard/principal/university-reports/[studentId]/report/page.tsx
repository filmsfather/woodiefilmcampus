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
    .select('id, name, email')
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
        <CardContent>
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
        />
      )}
    </section>
  )
}
