import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import UniversityReportCoursesTable from '@/components/dashboard/university-report/UniversityReportCoursesTable'
import UniversityReportEmptyState from '@/components/dashboard/university-report/UniversityReportEmptyState'
import UniversityReportResultSummary from '@/components/dashboard/university-report/UniversityReportResultSummary'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { requireAuthForDashboard } from '@/lib/auth'
import { fetchPublicationForStudent } from '@/lib/university-report/publication'
import {
  fetchActiveSnapshot,
  fetchCoursesForSnapshot,
  fetchGradeSemesterCounts,
  fetchLatestSnapshot,
} from '@/lib/university-report/data'

export const metadata: Metadata = {
  title: '내 성적 등록 | 학생 대시보드',
  description: '정부24에서 발급한 성적증명서를 업로드해 지원 가능 대학 분석을 위한 성적을 등록합니다.',
}

// Gemini 멀티모달 호출이 1분 이상 걸릴 수 있으므로 서버 액션 타임아웃을 확장.
// Vercel Hobby 플랜은 최대 60초까지만 적용되며, Pro 이상에서 더 길게 허용됩니다.
export const maxDuration = 300

export default async function StudentUniversityReportPage() {
  const { profile } = await requireAuthForDashboard('student')

  if (!profile) {
    return null
  }

  const activeSnapshot = await fetchActiveSnapshot(profile.id)
  const fallbackLatest = activeSnapshot ? null : await fetchLatestSnapshot(profile.id)
  const snapshot = activeSnapshot ?? fallbackLatest
  const showResult = snapshot !== null && (snapshot.status === 'parsed' || snapshot.status === 'parsing' || snapshot.status === 'failed')

  const gradeSemesterCounts = snapshot ? await fetchGradeSemesterCounts(snapshot.id) : []
  const courses =
    snapshot && snapshot.status === 'parsed'
      ? await fetchCoursesForSnapshot(snapshot.id)
      : []
  const publication = await fetchPublicationForStudent(profile.id)

  return (
    <section className="space-y-6">
      <DashboardBackLink fallbackHref="/dashboard/student" label="학생 대시보드로 돌아가기" />

      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-slate-900">내 성적 등록</h1>
        <p className="text-sm text-slate-600">
          정부24에서 발급받은 학교생활기록부(성적증명서) PDF를 업로드하면, AI가 학년·학기·과목 데이터를 자동으로 정리합니다.
          정리된 데이터를 기반으로 우디쌤이 지원 가능 대학 레포트를 발행합니다.
        </p>
      </div>

      {publication ? (
        <Card className="border-sky-200 bg-sky-50 shadow-sm">
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-sky-900">
                지원가능대학 분석 리포트가 발행되었습니다.
              </p>
              <p className="text-xs text-sky-800">
                우디쌤이 분석한 지원 가능 대학 결과를 한눈에 확인해 보세요.
              </p>
            </div>
            <Button asChild size="sm" className="gap-1">
              <Link href="/dashboard/student/university-report/analysis">
                리포트 보기 <ArrowRight className="size-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {showResult && snapshot ? (
        <>
          <UniversityReportResultSummary
            snapshot={snapshot}
            studentId={profile.id}
            gradeSemesterCounts={gradeSemesterCounts}
          />
          {courses.length > 0 ? (
            <UniversityReportCoursesTable courses={courses} studentId={profile.id} />
          ) : null}
        </>
      ) : (
        <UniversityReportEmptyState studentId={profile.id} isViewingOther={false} />
      )}
    </section>
  )
}
