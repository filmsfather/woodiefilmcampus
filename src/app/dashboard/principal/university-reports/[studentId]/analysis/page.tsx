import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Eye } from 'lucide-react'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import AnalysisRunButton from '@/components/dashboard/university-policy/AnalysisRunButton'
import EvaluationsTable from '@/components/dashboard/university-policy/EvaluationsTable'
import ReportPublishControl from '@/components/dashboard/university-policy/ReportPublishControl'
import ShareLinkBox from '@/components/dashboard/university-report-share/ShareLinkBox'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { requireAuthForDashboard } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchEvaluationsForSnapshot } from '@/lib/university-policy/data'
import {
  fetchActiveSnapshot,
  fetchCoursesForSnapshot,
  fetchLatestSnapshot,
} from '@/lib/university-report/data'
import { fetchLatestPublicationForStudent } from '@/lib/university-report/publication'

export const metadata: Metadata = {
  title: '지원가능대학 분석 | 학생 레포트',
}

export const maxDuration = 300

interface AnalysisPageProps {
  params: Promise<{ studentId: string }>
}

function formatDateTime(isoString: string | null) {
  if (!isoString) return '-'
  const date = new Date(isoString)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default async function AnalysisPage({ params }: AnalysisPageProps) {
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
    console.error('[principal-analysis] student fetch error', studentError)
  }
  if (!student) notFound()

  const activeSnapshot = await fetchActiveSnapshot(student.id)
  const fallback = activeSnapshot ? null : await fetchLatestSnapshot(student.id)
  const snapshot = activeSnapshot ?? fallback

  const [evaluations, courses] = snapshot
    ? await Promise.all([
        fetchEvaluationsForSnapshot(snapshot.id),
        fetchCoursesForSnapshot(snapshot.id),
      ])
    : [[], []]
  const lastComputedAt = evaluations.length > 0 ? evaluations[0].computedAt : null
  const publication = await fetchLatestPublicationForStudent(student.id)

  return (
    <section className="space-y-6">
      <DashboardBackLink
        fallbackHref={`/dashboard/principal/university-reports/${student.id}`}
        label="학생 성적 페이지로 돌아가기"
      />

      <Card className="border-slate-200 shadow-sm">
        <CardContent className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <p className="text-xs text-slate-500">학생</p>
            <h1 className="text-2xl font-semibold text-slate-900">
              {student.name ?? student.email}
            </h1>
            <p className="text-xs text-slate-500">{student.email}</p>
          </div>
          <div className="text-right text-xs text-slate-500">
            <p>마지막 분석: {formatDateTime(lastComputedAt)}</p>
            <p>총 평가 모집단위: {evaluations.length}건</p>
          </div>
        </CardContent>
      </Card>

      {!snapshot || snapshot.status !== 'parsed' ? (
        <Card className="border-amber-200 bg-amber-50 shadow-sm">
          <CardContent className="text-sm text-amber-900">
            분석 가능한 성적증명서가 없습니다. 먼저 학생 페이지에서 성적증명서를 업로드하고 분석 완료 상태가 되도록 해주세요.
          </CardContent>
        </Card>
      ) : (
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-base font-semibold text-slate-900">지원가능대학 분석</CardTitle>
            <div className="flex items-center gap-2">
              {evaluations.length > 0 ? (
                <Button asChild size="sm" variant="outline" className="gap-2">
                  <Link href={`/dashboard/principal/university-reports/${student.id}/report`}>
                    <Eye className="size-4" />
                    학생 화면 미리보기
                  </Link>
                </Button>
              ) : null}
              <AnalysisRunButton studentId={student.id} />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {evaluations.length > 0 ? (
              <ReportPublishControl
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
            ) : null}
            {publication?.status === 'published' ? (
              <ShareLinkBox token={publication.shareToken} />
            ) : null}
            <EvaluationsTable rows={evaluations} courses={courses} />
          </CardContent>
        </Card>
      )}
    </section>
  )
}
