import Link from 'next/link'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import DateUtil from '@/lib/date-util'
import { requireAuthForDashboard } from '@/lib/auth'
import { createClient as createServerSupabase } from '@/lib/supabase/server'
import { WORKBOOK_SUBJECTS, WORKBOOK_TITLES } from '@/lib/validation/workbook'
import WorkbookFilters from '@/components/dashboard/workbooks/WorkbookFilters'

interface WorkbookListItem {
  id: string
  title: string
  subject: string
  type: string
  week_label: string | null
  tags: string[] | null
  created_at: string
  updated_at: string
  workbook_items?: Array<{ count: number }>
  teacher?:
  | {
    id: string
    name: string | null
    email: string | null
  }
  | Array<{
    id: string
    name: string | null
    email: string | null
  }>
  | null
}

export default async function WorkbookListPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  await requireAuthForDashboard(['teacher', 'manager'])
  const supabase = createServerSupabase()

  const subjectFilter = ensureArray(searchParams.subject)
  const query = typeof searchParams.q === 'string' ? searchParams.q.trim() : ''
  const weekSortParam =
    typeof searchParams.weekSort === 'string' && (searchParams.weekSort === 'asc' || searchParams.weekSort === 'desc')
      ? (searchParams.weekSort as 'asc' | 'desc')
      : null

  let queryBuilder = supabase
    .from('workbooks')
    .select(
      `id, title, subject, type, week_label, tags, created_at, updated_at,
       teacher:profiles!workbooks_teacher_id_fkey(id, name, email),
       workbook_items(count)`
    )

  if (subjectFilter.length > 0) {
    queryBuilder = queryBuilder.in('subject', subjectFilter)
  }

  if (query) {
    queryBuilder = queryBuilder.or(
      `title.ilike.%${query}%,week_label.ilike.%${query}%,tags.cs.{${query}}`
    )
  }

  if (weekSortParam) {
    queryBuilder = queryBuilder.order('week_label', {
      ascending: weekSortParam === 'asc',
      nullsFirst: false,
    })
    queryBuilder = queryBuilder.order('updated_at', { ascending: false })
  } else {
    queryBuilder = queryBuilder.order('updated_at', { ascending: false })
  }

  const { data, error } = await queryBuilder

  if (error) {
    console.error('[workbooks] failed to load list', error)
  }

  const workbooks: WorkbookListItem[] = data ?? []

  const formatDate = (value: string) =>
    DateUtil.formatForDisplay(value, {
      locale: 'ko-KR',
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })

  return (
    <section className="space-y-6">
      <div className="space-y-3">
        <DashboardBackLink fallbackHref="/dashboard/teacher" label="교사용 허브로 돌아가기" />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold text-slate-900">공유 문제집</h1>
            <p className="text-sm text-slate-600">모든 교사가 만든 문제집을 함께 확인하고 활용해 보세요.</p>
          </div>
          <Button asChild>
            <Link href="/dashboard/workbooks/new">문제집 만들기</Link>
          </Button>
        </div>
      </div>

      <WorkbookFilters subjects={WORKBOOK_SUBJECTS} activeSubjects={subjectFilter} searchQuery={query} />

      {workbooks.length === 0 ? (
        <Card className="border-dashed border-slate-200 bg-slate-50">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center text-sm text-slate-500">
            <p>아직 등록된 문제집이 없습니다. 첫 번째 문제집을 만들어보세요.</p>
            <Button asChild>
              <Link href="/dashboard/workbooks/new">문제집 만들기</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-slate-200">
          <CardContent className="p-0">
            <div className="flex flex-col border-b border-slate-200 bg-slate-50 px-4 py-3 gap-2 text-sm text-slate-700">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="font-medium">주차 정렬</span>
                <div className="flex flex-wrap gap-2">
                  <Button asChild size="sm" variant={weekSortParam === 'asc' ? 'default' : 'outline'}>
                    <Link href={buildWeekSortHref(searchParams, 'asc')}>오름차순</Link>
                  </Button>
                  <Button asChild size="sm" variant={weekSortParam === 'desc' ? 'default' : 'outline'}>
                    <Link href={buildWeekSortHref(searchParams, 'desc')}>내림차순</Link>
                  </Button>
                  <Button asChild size="sm" variant={!weekSortParam ? 'default' : 'outline'}>
                    <Link href={buildWeekSortHref(searchParams, null)}>기본 정렬</Link>
                  </Button>
                </div>
              </div>
              <p className="text-xs text-slate-500">주차 정보가 없는 문제집은 목록 하단에 표시됩니다.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] table-fixed border-collapse text-sm">
                <thead className="bg-white text-slate-600">
                  <tr className="border-b border-slate-200">
                    <th className="px-4 py-3 text-left font-medium">주차</th>
                    <th className="px-4 py-3 text-left font-medium">제목</th>
                    <th className="px-4 py-3 text-left font-medium">유형</th>
                    <th className="px-4 py-3 text-left font-medium">과목</th>
                    <th className="px-4 py-3 text-left font-medium">작성자</th>
                    <th className="px-4 py-3 text-left font-medium">문항 수</th>
                    <th className="px-4 py-3 text-left font-medium">태그</th>
                    <th className="px-4 py-3 text-left font-medium">수정일</th>
                    <th className="px-4 py-3 text-right font-medium">작업</th>
                  </tr>
                </thead>
                <tbody>
                  {workbooks.map((workbook) => {
                    const itemCount = workbook.workbook_items?.[0]?.count ?? 0
                    const readableType = WORKBOOK_TITLES[workbook.type as keyof typeof WORKBOOK_TITLES] ?? workbook.type
                    const weekLabel = (workbook.week_label ?? '').trim()
                    const teacherRecord = Array.isArray(workbook.teacher) ? workbook.teacher[0] : workbook.teacher
                    const author = teacherRecord?.name ?? teacherRecord?.email ?? '작성자 정보 없음'

                    return (
                      <tr key={workbook.id} className="border-b border-slate-100 last:border-none hover:bg-slate-50">
                        <td className="px-4 py-3 align-top text-slate-600">
                          {weekLabel ? (
                            <Badge variant="outline" className="text-xs font-medium">{weekLabel}</Badge>
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 align-top">
                          <span className="font-medium text-slate-900">{workbook.title}</span>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <Badge variant="secondary">{readableType}</Badge>
                        </td>
                        <td className="px-4 py-3 align-top text-slate-600">{workbook.subject}</td>
                        <td className="px-4 py-3 align-top text-slate-600">{author}</td>
                        <td className="px-4 py-3 align-top text-slate-600">{itemCount.toLocaleString()}개</td>
                        <td className="px-4 py-3 align-top">
                          <div className="flex flex-wrap gap-1 text-xs text-slate-500">
                            {(workbook.tags ?? []).length === 0 ? <span className="text-slate-400">-</span> : null}
                            {(workbook.tags ?? []).map((tag) => (
                              <span key={tag} className="rounded bg-slate-100 px-2 py-0.5">#{tag}</span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top text-xs text-slate-500 whitespace-nowrap">
                          {formatDate(workbook.updated_at)}
                        </td>
                        <td className="px-4 py-3 align-top text-right">
                          <div className="flex justify-end gap-2">
                            {['srs', 'writing'].includes(workbook.type) && (
                              <Button asChild size="sm" variant="secondary">
                                <Link href={`/dashboard/workbooks/${workbook.id}/preview`}>풀어보기</Link>
                              </Button>
                            )}
                            <Button asChild size="sm" variant="outline">
                              <Link href={`/dashboard/workbooks/${workbook.id}`}>상세 보기</Link>
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </section>
  )
}

function buildWeekSortHref(
  currentParams: Record<string, string | string[] | undefined>,
  direction: 'asc' | 'desc' | null
) {
  const params = new URLSearchParams()

  Object.entries(currentParams).forEach(([key, rawValue]) => {
    if (!rawValue) {
      return
    }

    if (Array.isArray(rawValue)) {
      rawValue.forEach((entry) => params.append(key, entry))
    } else {
      params.set(key, rawValue)
    }
  })

  params.delete('weekSort')

  if (direction) {
    params.set('weekSort', direction)
  }

  const query = params.toString()
  return query ? `/dashboard/workbooks?${query}` : '/dashboard/workbooks'
}

function ensureArray(value: string | string[] | undefined): string[] {
  if (!value) {
    return []
  }

  return Array.isArray(value) ? value : [value]
}
