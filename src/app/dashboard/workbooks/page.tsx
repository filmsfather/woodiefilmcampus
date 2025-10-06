import Link from 'next/link'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import DateUtil from '@/lib/date-util'
import { requireAuthForDashboard } from '@/lib/auth'
import { createClient as createServerSupabase } from '@/lib/supabase/server'
import { WORKBOOK_SUBJECTS, WORKBOOK_TITLES, WORKBOOK_TYPES } from '@/lib/validation/workbook'
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
}

export default async function WorkbookListPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const { profile } = await requireAuthForDashboard('teacher')
  const supabase = createServerSupabase()

  const subjectFilter = ensureArray(searchParams.subject)
  const typeFilter = ensureArray(searchParams.type)
  const query = typeof searchParams.q === 'string' ? searchParams.q.trim() : ''

  let queryBuilder = supabase
    .from('workbooks')
    .select('id, title, subject, type, week_label, tags, created_at, updated_at, workbook_items(count)')
    .eq('teacher_id', profile?.id ?? '')

  if (subjectFilter.length > 0) {
    queryBuilder = queryBuilder.in('subject', subjectFilter)
  }

  if (typeFilter.length > 0) {
    queryBuilder = queryBuilder.in('type', typeFilter)
  }

  if (query) {
    queryBuilder = queryBuilder.or(
      `title.ilike.%${query}%,week_label.ilike.%${query}%,tags.cs.{${query}}`
    )
  }

  const { data, error } = await queryBuilder.order('updated_at', { ascending: false })

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
            <h1 className="text-2xl font-semibold text-slate-900">내 문제집</h1>
            <p className="text-sm text-slate-600">
              생성한 문제집을 한눈에 확인하고, 문항 수와 마지막 수정일을 점검하세요.
            </p>
          </div>
          <Button asChild>
            <Link href="/dashboard/workbooks/new">문제집 만들기</Link>
          </Button>
        </div>
      </div>

      <WorkbookFilters
        subjects={WORKBOOK_SUBJECTS}
        types={WORKBOOK_TYPES}
        activeSubjects={subjectFilter}
        activeTypes={typeFilter}
        searchQuery={query}
      />

      {workbooks.length === 0 ? (
        <Card className="border-dashed border-slate-200 bg-slate-50">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center text-sm text-slate-500">
            <p>아직 생성된 문제집이 없습니다. 첫 번째 문제집을 만들어보세요.</p>
            <Button asChild>
              <Link href="/dashboard/workbooks/new">문제집 만들기</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-slate-200">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] table-fixed border-collapse text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr className="border-b border-slate-200">
                    <th className="px-4 py-3 text-left font-medium">제목</th>
                    <th className="px-4 py-3 text-left font-medium">유형</th>
                    <th className="px-4 py-3 text-left font-medium">과목</th>
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

                    return (
                      <tr key={workbook.id} className="border-b border-slate-100 last:border-none hover:bg-slate-50">
                        <td className="px-4 py-3 align-top">
                          <div className="flex flex-col gap-1">
                            <span className="font-medium text-slate-900">{workbook.title}</span>
                            {workbook.week_label && (
                              <span className="text-xs text-slate-500">주차: {workbook.week_label}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <Badge variant="secondary">{readableType}</Badge>
                        </td>
                        <td className="px-4 py-3 align-top text-slate-600">{workbook.subject}</td>
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
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/dashboard/workbooks/${workbook.id}`}>상세 보기</Link>
                          </Button>
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

function ensureArray(value: string | string[] | undefined): string[] {
  if (!value) {
    return []
  }

  return Array.isArray(value) ? value : [value]
}
