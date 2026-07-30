import type { Metadata } from 'next'

import { requireAuthForDashboard } from '@/lib/auth'
import { fetchWorksheetPosts } from '@/lib/worksheet-posts'
import {
  fetchWorksheetExcellentMonths,
  fetchWorksheetExcellentPostsByMonth,
  getWorksheetPostExcellenceMap,
} from '@/lib/worksheet-excellent'
import { WorksheetPostList } from '@/components/dashboard/worksheet/WorksheetPostList'
import { WorksheetFiltersForm, FILTER_VALUE } from '@/components/dashboard/worksheet/WorksheetFiltersForm'
import { WorksheetPagination } from '@/components/dashboard/worksheet/WorksheetPagination'
import { WorksheetExcellentShowcase } from '@/components/dashboard/worksheet/WorksheetExcellentShowcase'

export const metadata: Metadata = {
  title: '선생님 워크시트 보드',
}

interface TeacherWorksheetPageProps {
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

export default async function TeacherWorksheetPage(props: TeacherWorksheetPageProps) {
  const searchParams = await props.searchParams
  const { profile } = await requireAuthForDashboard(['teacher', 'manager', 'principal'])

  if (!profile) {
    return null
  }

  const page = parsePage(searchParams.page)
  const weekLabel = parseFilterValue(searchParams.week, FILTER_VALUE.WEEK_NONE)
  const classId = parseFilterValue(searchParams.class, FILTER_VALUE.CLASS_NONE)
  const featuredOnly = isFeatured(searchParams.featured)
  const studentName = parseSearchText(searchParams.student)

  const [data, months, excellentGroups] = await Promise.all([
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
    fetchWorksheetExcellentMonths(),
    fetchWorksheetExcellentPostsByMonth(),
  ])

  const excellenceMapRaw = await getWorksheetPostExcellenceMap(data.items.map((item) => item.id))
  const excellenceMap = Object.fromEntries(excellenceMapRaw)

  return (
    <section className="flex flex-col gap-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-slate-900">선생님 워크시트 보드</h1>
        <p className="text-sm text-slate-600">
          영화연구 워크시트 제출 사진을 반별·학생별로 확인하고 추천하거나 정리할 수 있습니다. 추천한 워크시트는 월별
          우수작으로 선정해 학생들에게 모아 보여줄 수 있습니다.
        </p>
      </header>

      <WorksheetFiltersForm
        basePath="/dashboard/teacher/worksheet"
        filters={data.filters}
        currentWeekLabel={weekLabel}
        currentClassId={classId}
        featuredOnly={featuredOnly}
        currentStudentName={studentName}
      />

      <WorksheetExcellentShowcase groups={excellentGroups} />

      <div className="flex items-center justify-between text-sm text-slate-600">
        <span>총 {data.totalCount}건</span>
        <span>페이지당 {data.perPage}건</span>
      </div>

      <WorksheetPostList
        items={data.items}
        viewerId={profile.id}
        viewerRole={profile.role}
        excellentMonths={months}
        postExcellenceMap={excellenceMap}
      />

      <WorksheetPagination
        basePath="/dashboard/teacher/worksheet"
        page={data.page}
        totalPages={data.totalPages}
        searchParams={searchParams}
      />
    </section>
  )
}
