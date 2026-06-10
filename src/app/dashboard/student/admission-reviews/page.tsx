import Link from 'next/link'
import type { Metadata } from 'next'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import DateUtil from '@/lib/date-util'
import { requireAuthForDashboard } from '@/lib/auth'
import {
  resolveUniversityLabel,
  formatAdmissionYear,
  type AdmissionReviewRow,
} from '@/lib/admission-reviews'
import { createClient as createServerSupabase } from '@/lib/supabase/server'

export const metadata: Metadata = {
  title: '합격 복기 아카이브 | 입시 자료',
  description: '대학별·학년도별·학생별로 분류된 합격생 면접/실기/글쓰기 복기 모음입니다.',
}

const BASE = '/dashboard/student/admission-reviews'

const SELECT_CLASS =
  'border-input h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]'

export default async function StudentAdmissionReviewsListPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireAuthForDashboard('student')

  const sp = await searchParams
  const q = typeof sp?.q === 'string' ? sp.q.trim() : ''
  const universityParam = typeof sp?.university === 'string' ? sp.university.trim() : ''
  const yearParam = typeof sp?.year === 'string' ? sp.year.trim() : ''
  const studentParam = typeof sp?.student === 'string' ? sp.student.trim() : ''

  const supabase = await createServerSupabase()

  const { data: facetRows } = await supabase
    .from('admission_reviews')
    .select('university_id, university_label, admission_year')

  const universityFacet = new Map<string, { value: string; label: string; count: number }>()
  const yearSet = new Set<number>()
  for (const row of facetRows ?? []) {
    const value = (row.university_id as string | null) ?? `label:${row.university_label ?? ''}`
    const label = resolveUniversityLabel(row as AdmissionReviewRow)
    const entry = universityFacet.get(value) ?? { value, label, count: 0 }
    entry.count += 1
    universityFacet.set(value, entry)
    if (row.admission_year != null) yearSet.add(Number(row.admission_year))
  }
  const universityOptions = [...universityFacet.values()].sort((a, b) => b.count - a.count)
  const yearOptions = [...yearSet].sort((a, b) => b - a)
  const totalCount = facetRows?.length ?? 0

  let query = supabase
    .from('admission_reviews')
    .select(
      'id, university_id, university_label, admission_year, posted_at, admission_track, stage, student_name, title'
    )

  if (universityParam) {
    if (universityParam.startsWith('label:')) {
      query = query.eq('university_label', universityParam.slice('label:'.length))
    } else {
      query = query.eq('university_id', universityParam)
    }
  }
  if (yearParam) {
    const y = Number.parseInt(yearParam, 10)
    if (Number.isFinite(y)) query = query.eq('admission_year', y)
  }
  if (studentParam) {
    query = query.ilike('student_name', `%${studentParam}%`)
  }
  if (q) {
    query = query.or(`title.ilike.%${q}%,body.ilike.%${q}%,student_name.ilike.%${q}%`)
  }

  query = query
    .order('admission_year', { ascending: false, nullsFirst: false })
    .order('posted_at', { ascending: false, nullsFirst: false })

  const { data, error } = await query
  if (error) {
    console.error('[student-admission-reviews] list query failed', error)
    throw new Error('합격 복기 자료를 불러올 수 없습니다.')
  }

  const reviews = (data ?? []) as AdmissionReviewRow[]
  const hasFilter = Boolean(q || universityParam || yearParam || studentParam)

  const formatDate = (value: string | null) =>
    value
      ? DateUtil.formatForDisplay(value, {
          locale: 'ko-KR',
          timeZone: 'Asia/Seoul',
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        })
      : '—'

  return (
    <section className="space-y-6">
      <div className="space-y-3">
        <DashboardBackLink fallbackHref="/dashboard/student/admission-materials" label="입시 자료로 돌아가기" />
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-slate-900">합격 복기 아카이브</h1>
          <p className="text-sm text-slate-600">
            합격생 복기 {totalCount}건을 대학·학년도·학생 이름으로 분류해 모았습니다.
          </p>
        </div>
      </div>

      <form className="flex flex-col gap-4 rounded-md border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm text-slate-500">
            <span className="font-medium text-slate-700">검색</span>
            <Input name="q" placeholder="제목·본문·학생 이름으로 검색" defaultValue={q} />
          </label>
          <label className="flex flex-col gap-1 text-sm text-slate-500">
            <span className="font-medium text-slate-700">학생 이름</span>
            <Input name="student" placeholder="학생 이름" defaultValue={studentParam} />
          </label>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm text-slate-500">
            <span className="font-medium text-slate-700">대학교</span>
            <select name="university" defaultValue={universityParam} className={SELECT_CLASS}>
              <option value="">전체</option>
              {universityOptions.map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label} ({u.count})
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm text-slate-500">
            <span className="font-medium text-slate-700">학년도</span>
            <select name="year" defaultValue={yearParam} className={SELECT_CLASS}>
              <option value="">전체</option>
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}학년도
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="secondary">
            검색
          </Button>
          {hasFilter ? (
            <Button type="button" variant="ghost" asChild>
              <Link href={BASE}>필터 초기화</Link>
            </Button>
          ) : null}
        </div>
      </form>

      {reviews.length === 0 ? (
        <Card className="border-dashed border-slate-200 bg-slate-50">
          <CardContent className="py-12 text-center text-sm text-slate-500">
            {hasFilter ? '조건에 맞는 복기 자료가 없습니다.' : '아직 적재된 복기 자료가 없습니다.'}
          </CardContent>
        </Card>
      ) : (
        <Card className="border-slate-200">
          <CardContent className="overflow-x-auto p-0">
            <Table className="min-w-[820px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">학년도</TableHead>
                  <TableHead className="w-28">대학교</TableHead>
                  <TableHead className="w-32">전형·단계</TableHead>
                  <TableHead>제목 / 학생</TableHead>
                  <TableHead className="w-28">게시일</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reviews.map((r) => (
                  <TableRow key={r.id} className="align-top">
                    <TableCell className="text-sm text-slate-600">
                      {formatAdmissionYear(r.admission_year) ?? (
                        <span className="text-xs text-slate-400">미상</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm font-medium text-slate-700">
                      {resolveUniversityLabel(r)}
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">
                      <div className="flex flex-wrap gap-1">
                        {r.admission_track ? (
                          <Badge variant="outline" className="text-xs">
                            {r.admission_track}
                          </Badge>
                        ) : null}
                        {r.stage ? (
                          <Badge variant="secondary" className="text-xs">
                            {r.stage}
                          </Badge>
                        ) : null}
                        {!r.admission_track && !r.stage ? (
                          <span className="text-slate-400">—</span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`${BASE}/${r.id}`}
                        className="text-sm font-medium text-slate-900 hover:underline"
                      >
                        {r.title}
                      </Link>
                      <p className="mt-0.5 text-xs text-slate-500">
                        학생 {r.student_name ?? '미상'}
                      </p>
                    </TableCell>
                    <TableCell className="text-xs text-slate-500">{formatDate(r.posted_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </section>
  )
}
