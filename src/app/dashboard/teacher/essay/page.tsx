import type { Metadata } from 'next'

import { requireAuthForDashboard } from '@/lib/auth'
import { fetchEssayPosts } from '@/lib/essay-posts'
import {
  fetchEssayExcellentMonths,
  fetchEssayExcellentPostsByMonth,
  getEssayPostExcellenceMap,
} from '@/lib/essay-excellent'
import { EssayPostList } from '@/components/dashboard/essay/EssayPostList'
import { EssayFiltersForm, FILTER_VALUE } from '@/components/dashboard/essay/EssayFiltersForm'
import { EssayPagination } from '@/components/dashboard/essay/EssayPagination'
import { EssayExcellentShowcase } from '@/components/dashboard/essay/EssayExcellentShowcase'

export const metadata: Metadata = {
  title: '선생님 에세이 보드',
}

interface TeacherEssayPageProps {
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

export default async function TeacherEssayPage(props: TeacherEssayPageProps) {
  const searchParams = await props.searchParams
  const { profile } = await requireAuthForDashboard(['teacher', 'manager', 'principal'])

  if (!profile) {
    return null
  }

  const page = parsePage(searchParams.page)
  const weekLabel = parseFilterValue(searchParams.week, FILTER_VALUE.WEEK_NONE)
  const classId = parseFilterValue(searchParams.class, FILTER_VALUE.CLASS_NONE)
  const subject = parseFilterValue(searchParams.subject, FILTER_VALUE.SUBJECT_NONE)
  const featuredOnly = isFeatured(searchParams.featured)
  const studentName = parseSearchText(searchParams.student)

  const [data, months, excellentGroups] = await Promise.all([
    fetchEssayPosts({
      viewerId: profile.id,
      viewerRole: profile.role,
      page,
      perPage: 50,
      weekLabel,
      classId,
      subject,
      featuredOnly,
      studentName,
    }),
    fetchEssayExcellentMonths(),
    fetchEssayExcellentPostsByMonth(),
  ])

  const postIds = data.items.map((item) => item.id)
  const excellenceMapRaw = await getEssayPostExcellenceMap(postIds)
  const excellenceMap = Object.fromEntries(excellenceMapRaw)

  return (
    <section className="flex flex-col gap-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-slate-900">선생님 에세이 보드</h1>
        <p className="text-sm text-slate-600">
          학생들이 제출한 에세이 PDF를 확인하고 추천하거나 정리할 수 있습니다. 추천한 에세이는 명예의 전당으로 노출됩니다.
        </p>
      </header>

      <EssayFiltersForm
        basePath="/dashboard/teacher/essay"
        filters={data.filters}
        currentWeekLabel={weekLabel}
        currentClassId={classId}
        currentSubject={subject}
        featuredOnly={featuredOnly}
        currentStudentName={studentName}
      />

      <EssayExcellentShowcase groups={excellentGroups} viewerId={profile.id} />

      <div className="flex items-center justify-between text-sm text-slate-600">
        <span>총 {data.totalCount}건</span>
        <span>페이지당 {data.perPage}건</span>
      </div>

      <EssayPostList
        items={data.items}
        viewerId={profile.id}
        viewerRole={profile.role}
        excellentMonths={months}
        postExcellenceMap={excellenceMap}
      />

      <EssayPagination
        basePath="/dashboard/teacher/essay"
        page={data.page}
        totalPages={data.totalPages}
        searchParams={searchParams}
      />
    </section>
  )
}
