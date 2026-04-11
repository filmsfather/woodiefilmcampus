import Link from "next/link"
import { Plus } from "lucide-react"

import DashboardBackLink from "@/components/dashboard/DashboardBackLink"
import { ValueAnalysisFilters } from "@/components/dashboard/value-analysis/ValueAnalysisFilters"
import { ValueAnalysisPostList } from "@/components/dashboard/value-analysis/ValueAnalysisPostList"
import { GenreManager } from "@/components/dashboard/value-analysis/GenreManager"
import { Button } from "@/components/ui/button"
import { requireAuthForDashboard } from "@/lib/auth"
import { fetchValueAnalysisPosts } from "@/lib/value-analysis"

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function parseString(value: string | string[] | undefined): string | null {
  if (typeof value !== "string" || value.length === 0) return null
  return value
}

function parseFeatured(value: string | string[] | undefined): boolean {
  if (Array.isArray(value)) return value.includes("1")
  return value === "1"
}

function parsePage(value: string | string[] | undefined): number {
  if (typeof value !== "string") return 1
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
}

export default async function ValueAnalysisPage(props: PageProps) {
  const searchParams = await props.searchParams
  const { profile } = await requireAuthForDashboard([
    "student",
    "teacher",
    "manager",
    "principal",
  ])

  const classId = parseString(searchParams.class)
  const genreId = parseString(searchParams.genre)
  const studentName = parseString(searchParams.student)
  const title = parseString(searchParams.title)
  const featuredOnly = parseFeatured(searchParams.featured)
  const page = parsePage(searchParams.page)

  const data = await fetchValueAnalysisPosts({
    page,
    classId,
    genreId,
    studentName,
    title,
    featuredOnly,
  })

  const isPrincipal = profile.role === "principal"
  const backHref = profile.role === "student" ? "/dashboard/student" : "/dashboard/teacher"

  return (
    <section className="space-y-6">
      <div className="space-y-3">
        <DashboardBackLink
          fallbackHref={backHref}
          label="대시보드로 돌아가기"
        />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold text-slate-900">
              가치분석 게시판
            </h1>
            <p className="text-sm text-slate-600">
              학생들의 가치분석 PDF 제출물을 열람하고 서로 배울 수 있습니다.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isPrincipal ? (
              <GenreManager genres={data.filters.genres} />
            ) : null}
            <Button asChild>
              <Link href="/dashboard/value-analysis/new">
                <Plus className="mr-1 h-4 w-4" />새 제출
              </Link>
            </Button>
          </div>
        </div>
      </div>

      <ValueAnalysisFilters
        basePath="/dashboard/value-analysis"
        filters={data.filters}
        currentClassId={classId}
        currentGenreId={genreId}
        currentStudentName={studentName}
        currentTitle={title}
        featuredOnly={featuredOnly}
      />

      <div className="flex items-center justify-between text-sm text-slate-600">
        <span>총 {data.totalCount}건</span>
        <span>
          {data.page} / {data.totalPages} 페이지
        </span>
      </div>

      <ValueAnalysisPostList
        items={data.items}
        viewerId={profile.id}
        viewerRole={profile.role}
      />

      {data.totalPages > 1 ? (
        <div className="flex items-center justify-center gap-2">
          {data.page > 1 ? (
            <Button asChild variant="outline" size="sm">
              <Link
                href={`/dashboard/value-analysis?${buildPageParams(searchParams, data.page - 1)}`}
              >
                이전
              </Link>
            </Button>
          ) : null}
          <span className="text-sm text-slate-600">
            {data.page} / {data.totalPages}
          </span>
          {data.page < data.totalPages ? (
            <Button asChild variant="outline" size="sm">
              <Link
                href={`/dashboard/value-analysis?${buildPageParams(searchParams, data.page + 1)}`}
              >
                다음
              </Link>
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

function buildPageParams(
  searchParams: Record<string, string | string[] | undefined>,
  page: number
): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(searchParams)) {
    if (key === "page") continue
    if (typeof value === "string" && value.length > 0) {
      params.set(key, value)
    }
  }
  params.set("page", String(page))
  return params.toString()
}
