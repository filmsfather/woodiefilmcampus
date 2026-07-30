import type { Metadata } from 'next'
import Link from 'next/link'

import { requireAuthForDashboard } from '@/lib/auth'
import { fetchWorksheetPosts } from '@/lib/worksheet-posts'
import { fetchWorksheetExcellentPostsByMonth } from '@/lib/worksheet-excellent'
import { WorksheetPostList } from '@/components/dashboard/worksheet/WorksheetPostList'
import { WorksheetFiltersForm, FILTER_VALUE } from '@/components/dashboard/worksheet/WorksheetFiltersForm'
import { WorksheetPagination } from '@/components/dashboard/worksheet/WorksheetPagination'
import { WorksheetExcellentShowcase } from '@/components/dashboard/worksheet/WorksheetExcellentShowcase'
import { Button } from '@/components/ui/button'

export const metadata: Metadata = {
  title: '학생 워크시트 보드',
}

interface StudentWorksheetPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function parsePage(value: string | string[] | undefined): number {
  if (typeof value !== 'string') {
    return 1
  }

  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
}

function parseFilterValue(value: string | string[] | undefined, noneToken: string): string | null {
  if (typeof value !== 'string' || value.length === 0) {
    return null
  }

  if (value === noneToken) {
    return ''
  }

  return value
}

function isFeatured(value: string | string[] | undefined): boolean {
  if (Array.isArray(value)) {
    return value.includes('1')
  }

  return value === '1'
}

function parseSearchText(value: string | string[] | undefined): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export default async function StudentWorksheetPage(props: StudentWorksheetPageProps) {
  const searchParams = await props.searchParams
  const { profile } = await requireAuthForDashboard('student')

  if (!profile) {
    return null
  }

  const page = parsePage(searchParams.page)
  const weekLabel = parseFilterValue(searchParams.week, FILTER_VALUE.WEEK_NONE)
  const classId = parseFilterValue(searchParams.class, FILTER_VALUE.CLASS_NONE)
  const featuredOnly = isFeatured(searchParams.featured)
  const studentName = parseSearchText(searchParams.student)

  const [data, excellentGroups] = await Promise.all([
    fetchWorksheetPosts({
      viewerId: profile.id,
      viewerRole: profile.role,
      page,
      perPage: 30,
      weekLabel,
      classId,
      featuredOnly,
      studentName,
    }),
    fetchWorksheetExcellentPostsByMonth(),
  ])

  return (
    <section className="flex flex-col gap-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-slate-900">워크시트 보드</h1>
        <p className="text-sm text-slate-600">
          친구들이 제출한 영화연구 워크시트를 함께 살펴보세요. 내 워크시트는 필요에 따라 숨길 수 있습니다.
        </p>
      </header>

      <WorksheetFiltersForm
        basePath="/dashboard/student/worksheet"
        filters={data.filters}
        currentWeekLabel={weekLabel}
        currentClassId={classId}
        featuredOnly={featuredOnly}
        currentStudentName={studentName}
      />

      <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
        추천 코멘트 버튼을 누르면 선생님이 남긴 코멘트를 볼 수 있습니다.
      </p>

      <WorksheetExcellentShowcase groups={excellentGroups} />

      <div className="flex justify-end">
        <Button asChild size="sm" variant="ghost">
          <Link href="/dashboard/student">대시보드로 돌아가기</Link>
        </Button>
      </div>

      <div className="flex items-center justify-between text-sm text-slate-600">
        <span>총 {data.totalCount}건</span>
        <span>페이지당 {data.perPage}건</span>
      </div>

      <WorksheetPostList items={data.items} viewerId={profile.id} viewerRole={profile.role} />

      <WorksheetPagination
        basePath="/dashboard/student/worksheet"
        page={data.page}
        totalPages={data.totalPages}
        searchParams={searchParams}
      />
    </section>
  )
}
