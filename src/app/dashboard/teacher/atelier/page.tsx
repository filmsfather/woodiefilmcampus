import type { Metadata } from 'next'

import { requireAuthForDashboard } from '@/lib/auth'
import { fetchAtelierPosts } from '@/lib/atelier-posts'
import { AtelierPostList } from '@/components/dashboard/atelier/AtelierPostList'
import { AtelierFiltersForm, FILTER_VALUE } from '@/components/dashboard/atelier/AtelierFiltersForm'
import { AtelierPagination } from '@/components/dashboard/atelier/AtelierPagination'

export const metadata: Metadata = {
  title: '선생님 아틀리에',
}

interface TeacherAtelierPageProps {
  searchParams?: Record<string, string | string[] | undefined>
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

export default async function TeacherAtelierPage({ searchParams = {} }: TeacherAtelierPageProps) {
  const { profile } = await requireAuthForDashboard(['teacher', 'manager', 'principal'])

  if (!profile) {
    return null
  }

  const page = parsePage(searchParams.page)
  const weekLabel = parseFilterValue(searchParams.week, FILTER_VALUE.WEEK_NONE)
  const classId = parseFilterValue(searchParams.class, FILTER_VALUE.CLASS_NONE)
  const featuredOnly = isFeatured(searchParams.featured)
  const studentName = parseSearchText(searchParams.student)

  const data = await fetchAtelierPosts({
    viewerId: profile.id,
    viewerRole: profile.role,
    page,
    perPage: 50,
    weekLabel,
    classId,
    featuredOnly,
    studentName,
  })

  return (
    <section className="flex flex-col gap-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-slate-900">선생님 아틀리에</h1>
        <p className="text-sm text-slate-600">
          학생들의 최신 PDF 제출물을 확인하고 추천하거나 목록에서 정리할 수 있습니다. 추천한 과제는 명예의 전당으로 노출됩니다.
        </p>
      </header>

      <AtelierFiltersForm
        basePath="/dashboard/teacher/atelier"
        filters={data.filters}
        currentWeekLabel={weekLabel}
        currentClassId={classId}
        featuredOnly={featuredOnly}
        currentStudentName={studentName}
      />

      <div className="flex items-center justify-between text-sm text-slate-600">
        <span>총 {data.totalCount}건</span>
        <span>페이지당 {data.perPage}건</span>
      </div>

      <AtelierPostList items={data.items} viewerId={profile.id} viewerRole={profile.role} />

      <AtelierPagination
        basePath="/dashboard/teacher/atelier"
        page={data.page}
        totalPages={data.totalPages}
        searchParams={searchParams}
      />
    </section>
  )
}
