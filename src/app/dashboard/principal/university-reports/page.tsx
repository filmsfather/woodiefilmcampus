import Link from 'next/link'
import { ChevronRight, ChevronDown, ChevronUp } from 'lucide-react'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { requireAuthForDashboard } from '@/lib/auth'
import { fetchStudentSnapshotStatuses, type StudentSnapshotStatusRow } from '@/lib/university-report/data'
import type { SnapshotStatus } from '@/lib/university-report/types'

function statusBadge(status: SnapshotStatus | null) {
  switch (status) {
    case 'parsed':
      return <Badge className="bg-emerald-100 text-emerald-700">분석 완료</Badge>
    case 'parsing':
      return <Badge className="bg-amber-100 text-amber-700">분석 중</Badge>
    case 'failed':
      return <Badge className="bg-red-100 text-red-700">분석 실패</Badge>
    case 'archived':
      return <Badge className="bg-slate-200 text-slate-600">보관됨</Badge>
    case 'pending':
      return <Badge className="bg-slate-200 text-slate-600">대기</Badge>
    case null:
    default:
      return <Badge variant="outline" className="text-slate-500">미업로드</Badge>
  }
}

function formatDateTime(iso: string | null) {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const FILTERS = [
  { key: 'all', label: '전체' },
  { key: 'ged', label: '검정고시' },
  { key: 'rural', label: '농어촌' },
  { key: 'lowincome', label: '차상위' },
] as const

type FilterKey = (typeof FILTERS)[number]['key']

function matchesFilter(row: StudentSnapshotStatusRow, filter: FilterKey) {
  switch (filter) {
    case 'ged':
      return row.isGed
    case 'rural':
      return row.ruralEligible
    case 'lowincome':
      return row.lowIncomeEligible
    case 'all':
    default:
      return true
  }
}

const SORTS = [
  { key: 'name', label: '학생' },
  { key: 'class', label: '반' },
  { key: 'status', label: '상태' },
  { key: 'updated', label: '마지막 업데이트' },
] as const

type SortKey = (typeof SORTS)[number]['key']
type SortDir = 'asc' | 'desc'

// 상태 정렬 우선순위(작을수록 위). 의미 있는 진행 단계 순서로 배치.
const STATUS_RANK: Record<string, number> = {
  parsed: 0,
  parsing: 1,
  pending: 2,
  failed: 3,
  archived: 4,
}

function statusRank(status: SnapshotStatus | null): number {
  if (status == null) return 5
  return STATUS_RANK[status] ?? 5
}

function compareRows(a: StudentSnapshotStatusRow, b: StudentSnapshotStatusRow, sortKey: SortKey): number {
  switch (sortKey) {
    case 'class':
      return (a.className ?? '').localeCompare(b.className ?? '', 'ko')
    case 'status':
      return statusRank(a.snapshotStatus) - statusRank(b.snapshotStatus)
    case 'updated': {
      const at = a.updatedAt ? new Date(a.updatedAt).getTime() : 0
      const bt = b.updatedAt ? new Date(b.updatedAt).getTime() : 0
      return at - bt
    }
    case 'name':
    default:
      return (a.name ?? a.email).localeCompare(b.name ?? b.email, 'ko')
  }
}

function buildQuery(filter: FilterKey, sort: SortKey, dir: SortDir): string {
  const params = new URLSearchParams()
  if (filter !== 'all') params.set('filter', filter)
  params.set('sort', sort)
  params.set('dir', dir)
  const qs = params.toString()
  return qs ? `?${qs}` : '?'
}

interface UniversityReportsPageProps {
  searchParams: Promise<{ filter?: string; sort?: string; dir?: string }>
}

export default async function UniversityReportsPage({ searchParams }: UniversityReportsPageProps) {
  await requireAuthForDashboard('principal')

  const { filter: filterParam, sort: sortParam, dir: dirParam } = await searchParams
  const activeFilter: FilterKey = FILTERS.some((f) => f.key === filterParam)
    ? (filterParam as FilterKey)
    : 'all'
  const activeSort: SortKey = SORTS.some((s) => s.key === sortParam)
    ? (sortParam as SortKey)
    : 'name'
  const activeDir: SortDir = dirParam === 'desc' ? 'desc' : 'asc'

  const allRows = await fetchStudentSnapshotStatuses()
  const rows = allRows
    .filter((row) => matchesFilter(row, activeFilter))
    .sort((a, b) => {
      const base = compareRows(a, b, activeSort)
      return activeDir === 'desc' ? -base : base
    })

  const summary = allRows.reduce(
    (acc, row) => {
      acc.total += 1
      if (row.isGed) acc.ged += 1
      if (row.ruralEligible) acc.rural += 1
      if (row.lowIncomeEligible) acc.lowIncome += 1
      return acc
    },
    { total: 0, ged: 0, rural: 0, lowIncome: 0 }
  )

  return (
    <section className="space-y-6">
      <DashboardBackLink fallbackHref="/dashboard/principal" label="원장 대시보드로 돌아가기" />

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-slate-900">지원가능대학 레포트 관리</h1>
          <p className="text-sm text-slate-600">
            학생별 성적증명서 업로드 현황을 확인하고, 학생 행을 클릭해 분석 결과를 확인하거나 대신 업로드할 수 있습니다.
          </p>
        </div>
        <Link
          href="/dashboard/principal/university-reports/wishlists"
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          확정 희망대학 현황
          <ChevronRight className="size-4" />
        </Link>
      </header>

      <div className="grid gap-3 sm:grid-cols-4">
        <SummaryStat label="총 학생" value={summary.total} />
        <SummaryStat label="검정고시" value={summary.ged} tone="emerald" />
        <SummaryStat label="농어촌 지원가능" value={summary.rural} tone="slate" />
        <SummaryStat label="차상위 지원가능" value={summary.lowIncome} tone="slate" />
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const isActive = f.key === activeFilter
          const href = buildQuery(f.key, activeSort, activeDir)
          return (
            <Link
              key={f.key}
              href={href}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                isActive
                  ? 'border-sky-500 bg-sky-50 text-sky-700'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {f.label}
            </Link>
          )
        })}
      </div>

      <Card className="border-slate-200 shadow-sm">
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              {activeFilter === 'all'
                ? '승인된 학생이 아직 없습니다.'
                : '해당 조건에 맞는 학생이 없습니다.'}
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              <div className="grid grid-cols-[2fr_1.2fr_1fr_1.4fr_0.5fr] gap-3 bg-slate-50 px-4 py-2 text-xs font-medium text-slate-500 sm:px-6">
                <SortHeader
                  sortKey="name"
                  label="학생"
                  filter={activeFilter}
                  activeSort={activeSort}
                  activeDir={activeDir}
                />
                <SortHeader
                  sortKey="class"
                  label="반"
                  filter={activeFilter}
                  activeSort={activeSort}
                  activeDir={activeDir}
                  className="hidden sm:flex"
                />
                <SortHeader
                  sortKey="status"
                  label="상태"
                  filter={activeFilter}
                  activeSort={activeSort}
                  activeDir={activeDir}
                  className="hidden sm:flex"
                />
                <SortHeader
                  sortKey="updated"
                  label="마지막 업데이트"
                  filter={activeFilter}
                  activeSort={activeSort}
                  activeDir={activeDir}
                  className="hidden md:flex"
                />
                <div className="text-right">상세</div>
              </div>
              {rows.map((row) => (
                <StudentRow key={row.studentId} row={row} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  )
}

function SummaryStat({
  label,
  value,
  tone = 'slate',
}: {
  label: string
  value: number
  tone?: 'slate' | 'emerald' | 'red'
}) {
  const toneClass =
    tone === 'emerald'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : tone === 'red'
        ? 'border-red-200 bg-red-50 text-red-700'
        : 'border-slate-200 bg-white text-slate-700'

  return (
    <div className={`rounded-lg border px-4 py-3 ${toneClass}`}>
      <p className="text-xs font-medium">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  )
}

function SortHeader({
  sortKey,
  label,
  filter,
  activeSort,
  activeDir,
  className = '',
}: {
  sortKey: SortKey
  label: string
  filter: FilterKey
  activeSort: SortKey
  activeDir: SortDir
  className?: string
}) {
  const isActive = activeSort === sortKey
  const nextDir: SortDir = isActive && activeDir === 'asc' ? 'desc' : 'asc'

  return (
    <Link
      href={buildQuery(filter, sortKey, nextDir)}
      className={`flex items-center gap-1 transition hover:text-slate-700 ${
        isActive ? 'text-slate-700' : ''
      } ${className}`}
    >
      {label}
      {isActive ? (
        activeDir === 'asc' ? (
          <ChevronUp className="size-3" />
        ) : (
          <ChevronDown className="size-3" />
        )
      ) : null}
    </Link>
  )
}

function StudentRow({ row }: { row: StudentSnapshotStatusRow }) {
  return (
    <Link
      href={`/dashboard/principal/university-reports/${row.studentId}`}
      className="grid grid-cols-[2fr_1.2fr_1fr_1.4fr_0.5fr] items-center gap-3 px-4 py-3 text-sm text-slate-700 transition hover:bg-slate-50 sm:px-6"
    >
      <div>
        <p className="font-medium text-slate-900">{row.name ?? row.email}</p>
        <p className="text-xs text-slate-500">{row.email}</p>
        {row.schoolName ? (
          <p className="mt-1 text-xs text-slate-500">{row.schoolName}</p>
        ) : null}
        {row.isGed || row.ruralEligible || row.lowIncomeEligible ? (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {row.isGed ? (
              <Badge className="bg-emerald-100 text-emerald-700">검정고시</Badge>
            ) : null}
            {row.ruralEligible ? (
              <Badge className="bg-sky-100 text-sky-700">농어촌</Badge>
            ) : null}
            {row.lowIncomeEligible ? (
              <Badge className="bg-violet-100 text-violet-700">차상위</Badge>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="hidden text-xs text-slate-600 sm:block">{row.className ?? '-'}</div>
      <div className="hidden items-center gap-2 sm:flex">
        {statusBadge(row.snapshotStatus)}
        {row.snapshotStatus === 'parsed' ? (
          <span className="text-xs text-slate-500">{row.courseCount}과목</span>
        ) : null}
      </div>
      <div className="hidden text-xs text-slate-500 md:block">{formatDateTime(row.updatedAt)}</div>
      <div className="flex justify-end text-slate-400">
        <ChevronRight className="size-4" />
      </div>
    </Link>
  )
}
