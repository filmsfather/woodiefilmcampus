import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

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

interface UniversityReportsPageProps {
  searchParams: Promise<{ filter?: string }>
}

export default async function UniversityReportsPage({ searchParams }: UniversityReportsPageProps) {
  await requireAuthForDashboard('principal')

  const { filter: filterParam } = await searchParams
  const activeFilter: FilterKey = FILTERS.some((f) => f.key === filterParam)
    ? (filterParam as FilterKey)
    : 'all'

  const allRows = await fetchStudentSnapshotStatuses()
  const rows = allRows.filter((row) => matchesFilter(row, activeFilter))

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
          const href = f.key === 'all' ? '?' : `?filter=${f.key}`
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
                <div>학생</div>
                <div className="hidden sm:block">반</div>
                <div className="hidden sm:block">상태</div>
                <div className="hidden md:block">마지막 업데이트</div>
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
