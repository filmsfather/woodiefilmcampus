import type { Metadata } from 'next'
import Link from 'next/link'

import { requireAuthForDashboard } from '@/lib/auth'
import { fetchAtelierPosts } from '@/lib/atelier-posts'
import { AtelierPostList } from '@/components/dashboard/atelier/AtelierPostList'
import { AtelierFiltersForm, FILTER_VALUE } from '@/components/dashboard/atelier/AtelierFiltersForm'
import { AtelierPagination } from '@/components/dashboard/atelier/AtelierPagination'
import { Button } from '@/components/ui/button'

export const metadata: Metadata = {
  title: '학생 아틀리에',
}

interface StudentAtelierPageProps {
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

export default async function StudentAtelierPage({ searchParams = {} }: StudentAtelierPageProps) {
  const { profile } = await requireAuthForDashboard('student')

  if (!profile) {
    return null
  }

  const page = parsePage(searchParams.page)
  const weekLabel = parseFilterValue(searchParams.week, FILTER_VALUE.WEEK_NONE)
  const classId = parseFilterValue(searchParams.class, FILTER_VALUE.CLASS_NONE)
  const featuredOnly = isFeatured(searchParams.featured)

  const data = await fetchAtelierPosts({
    viewerId: profile.id,
    viewerRole: profile.role,
    page,
    perPage: 50,
    weekLabel,
    classId,
    featuredOnly,
  })

  return (
    <section className="flex flex-col gap-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-slate-900">학생 아틀리에</h1>
        <p className="text-sm text-slate-600">
          모든 학생이 올린 PDF 과제를 한곳에서 살펴보고 영감을 나눠보세요. 내 제출물은 필요에 따라 숨길 수 있습니다.
        </p>
      </header>

      <AtelierFiltersForm
        basePath="/dashboard/student/atelier"
        filters={data.filters}
        currentWeekLabel={weekLabel}
        currentClassId={classId}
        featuredOnly={featuredOnly}
      />

      <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
        추천 버튼을 누르면 교사의 추천 코멘트를 볼 수 있습니다.
      </p>

      <div className="flex justify-end">
        <Button asChild size="sm" variant="ghost">
          <Link href="/dashboard/student">대시보드로 돌아가기</Link>
        </Button>
      </div>

      <div className="flex items-center justify-between text-sm text-slate-600">
        <span>총 {data.totalCount}건</span>
        <span>페이지당 {data.perPage}건</span>
      </div>

      <AtelierPostList items={data.items} viewerId={profile.id} viewerRole={profile.role} />

      <AtelierPagination
        basePath="/dashboard/student/atelier"
        page={data.page}
        totalPages={data.totalPages}
        searchParams={searchParams}
      />
    </section>
  )
}
