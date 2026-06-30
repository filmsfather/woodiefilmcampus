'use client'

import type { ReactNode } from 'react'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowDownUp, Search, Users } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import type { ConfirmedWishlistSummary, WishlistCategory } from '@/lib/university-wishlist/data'

type ViewMode = 'university' | 'student'
type SortKey = 'nameAsc' | 'nameDesc' | 'countDesc' | 'countAsc'
type CategoryFilter = 'all' | WishlistCategory

const CATEGORY_LABELS: Record<WishlistCategory, string> = {
  general: '일반대',
  specialized: '전문대·예대',
  karts: '한예종',
}

const CATEGORY_TONE: Record<WishlistCategory, string> = {
  general: 'bg-sky-100 text-sky-700',
  specialized: 'bg-amber-100 text-amber-800',
  karts: 'bg-violet-100 text-violet-700',
}

interface FlatRow {
  studentId: string
  studentName: string
  email: string
  className: string | null
  confirmedAt: string | null
  category: WishlistCategory
  universityId: string | null
  universityName: string
  shortName: string | null
  programName: string
  region: string | null
}

function flatten(summaries: ConfirmedWishlistSummary[]): FlatRow[] {
  const rows: FlatRow[] = []
  for (const s of summaries) {
    const all = [...s.generalItems, ...s.specializedItems, ...s.kartsItems]
    for (const item of all) {
      rows.push({
        studentId: s.studentId,
        studentName: s.studentName,
        email: s.email,
        className: s.className,
        confirmedAt: s.confirmedAt,
        category: item.category,
        universityId: item.universityId,
        universityName: item.universityName,
        shortName: item.shortName,
        programName: item.programName,
        region: item.region,
      })
    }
  }
  return rows
}

export default function ConfirmedWishlistView({
  summaries,
}: {
  summaries: ConfirmedWishlistSummary[]
}) {
  const [viewMode, setViewMode] = useState<ViewMode>('university')
  const [sortKey, setSortKey] = useState<SortKey>('countDesc')
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all')
  const [classFilter, setClassFilter] = useState<string>('all')
  const [search, setSearch] = useState('')

  const allRows = useMemo(() => flatten(summaries), [summaries])

  const classOptions = useMemo(() => {
    const set = new Set<string>()
    for (const r of allRows) {
      if (r.className) set.add(r.className)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ko'))
  }, [allRows])

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase()
    return allRows.filter((row) => {
      if (categoryFilter !== 'all' && row.category !== categoryFilter) return false
      if (classFilter !== 'all' && row.className !== classFilter) return false
      if (term) {
        const haystack = [
          row.studentName,
          row.universityName,
          row.shortName ?? '',
          row.programName,
        ]
          .join(' ')
          .toLowerCase()
        if (!haystack.includes(term)) return false
      }
      return true
    })
  }, [allRows, categoryFilter, classFilter, search])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
        <div className="inline-flex rounded-md border border-slate-200 p-0.5">
          <ViewToggleButton
            active={viewMode === 'university'}
            onClick={() => setViewMode('university')}
            icon={<Users className="size-3.5" />}
          >
            대학별
          </ViewToggleButton>
          <ViewToggleButton
            active={viewMode === 'student'}
            onClick={() => setViewMode('student')}
            icon={<Users className="size-3.5" />}
          >
            학생별
          </ViewToggleButton>
        </div>

        <label className="relative flex items-center">
          <Search className="absolute left-2.5 size-4 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="학생·대학·모집단위 검색"
            className="w-56 rounded-md border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none"
          />
        </label>

        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value as CategoryFilter)}
          className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-700 focus:border-sky-400 focus:outline-none"
        >
          <option value="all">전체 계열</option>
          <option value="general">일반대</option>
          <option value="specialized">전문대·예대</option>
          <option value="karts">한예종</option>
        </select>

        <select
          value={classFilter}
          onChange={(e) => setClassFilter(e.target.value)}
          className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-700 focus:border-sky-400 focus:outline-none"
        >
          <option value="all">전체 반</option>
          {classOptions.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <label className="ml-auto inline-flex items-center gap-1.5 text-sm text-slate-600">
          <ArrowDownUp className="size-4 text-slate-400" />
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-700 focus:border-sky-400 focus:outline-none"
          >
            {viewMode === 'university' ? (
              <>
                <option value="countDesc">지원자 많은 순</option>
                <option value="countAsc">지원자 적은 순</option>
                <option value="nameAsc">대학명 오름차순</option>
                <option value="nameDesc">대학명 내림차순</option>
              </>
            ) : (
              <>
                <option value="nameAsc">이름 오름차순</option>
                <option value="nameDesc">이름 내림차순</option>
                <option value="countDesc">지원 대학 많은 순</option>
                <option value="countAsc">지원 대학 적은 순</option>
              </>
            )}
          </select>
        </label>
      </div>

      {filteredRows.length === 0 ? (
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="p-8 text-center text-sm text-slate-500">
            조건에 맞는 결과가 없습니다.
          </CardContent>
        </Card>
      ) : viewMode === 'university' ? (
        <UniversityView rows={filteredRows} sortKey={sortKey} />
      ) : (
        <StudentView rows={filteredRows} sortKey={sortKey} />
      )}
    </div>
  )
}

function ViewToggleButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean
  onClick: () => void
  icon: ReactNode
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition ${
        active ? 'bg-sky-500 text-white' : 'text-slate-600 hover:bg-slate-100'
      }`}
    >
      {icon}
      {children}
    </button>
  )
}

interface UniversityGroup {
  universityKey: string
  universityName: string
  shortName: string | null
  category: WishlistCategory
  region: string | null
  students: FlatRow[]
}

function UniversityView({ rows, sortKey }: { rows: FlatRow[]; sortKey: SortKey }) {
  const groups = useMemo(() => {
    const map = new Map<string, UniversityGroup>()
    for (const row of rows) {
      const key = row.universityId ?? row.universityName
      const existing = map.get(key)
      if (existing) {
        existing.students.push(row)
      } else {
        map.set(key, {
          universityKey: key,
          universityName: row.universityName,
          shortName: row.shortName,
          category: row.category,
          region: row.region,
          students: [row],
        })
      }
    }
    const list = Array.from(map.values())
    list.forEach((g) =>
      g.students.sort((a, b) => a.studentName.localeCompare(b.studentName, 'ko'))
    )
    list.sort((a, b) => {
      switch (sortKey) {
        case 'nameAsc':
          return a.universityName.localeCompare(b.universityName, 'ko')
        case 'nameDesc':
          return b.universityName.localeCompare(a.universityName, 'ko')
        case 'countAsc':
          return a.students.length - b.students.length
        case 'countDesc':
        default:
          return (
            b.students.length - a.students.length ||
            a.universityName.localeCompare(b.universityName, 'ko')
          )
      }
    })
    return list
  }, [rows, sortKey])

  return (
    <div className="grid gap-3">
      {groups.map((group) => (
        <Card key={group.universityKey} className="border-slate-200 shadow-sm">
          <CardContent className="space-y-3 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-base font-semibold text-slate-900">
                {group.shortName ?? group.universityName}
              </span>
              {group.shortName ? (
                <span className="text-xs text-slate-400">{group.universityName}</span>
              ) : null}
              <Badge className={CATEGORY_TONE[group.category]}>
                {CATEGORY_LABELS[group.category]}
              </Badge>
              {group.region ? (
                <span className="text-xs text-slate-400">{group.region}</span>
              ) : null}
              <Badge variant="outline" className="ml-auto text-slate-600">
                지원 {group.students.length}명
              </Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              {group.students.map((s, idx) => (
                <Link
                  key={`${s.studentId}-${idx}`}
                  href={`/dashboard/principal/university-reports/${s.studentId}/report`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  {s.studentName}
                  {s.className ? (
                    <span className="text-[10px] text-slate-400">{s.className}</span>
                  ) : null}
                  <span className="text-[10px] text-slate-400">· {s.programName}</span>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

interface StudentGroup {
  studentId: string
  studentName: string
  email: string
  className: string | null
  items: FlatRow[]
}

function StudentView({ rows, sortKey }: { rows: FlatRow[]; sortKey: SortKey }) {
  const groups = useMemo(() => {
    const map = new Map<string, StudentGroup>()
    for (const row of rows) {
      const existing = map.get(row.studentId)
      if (existing) {
        existing.items.push(row)
      } else {
        map.set(row.studentId, {
          studentId: row.studentId,
          studentName: row.studentName,
          email: row.email,
          className: row.className,
          items: [row],
        })
      }
    }
    const list = Array.from(map.values())
    list.sort((a, b) => {
      switch (sortKey) {
        case 'nameDesc':
          return b.studentName.localeCompare(a.studentName, 'ko')
        case 'countAsc':
          return a.items.length - b.items.length
        case 'countDesc':
          return (
            b.items.length - a.items.length ||
            a.studentName.localeCompare(b.studentName, 'ko')
          )
        case 'nameAsc':
        default:
          return a.studentName.localeCompare(b.studentName, 'ko')
      }
    })
    return list
  }, [rows, sortKey])

  return (
    <div className="grid gap-3">
      {groups.map((group) => (
        <Card key={group.studentId} className="border-slate-200 shadow-sm">
          <CardContent className="space-y-3 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/dashboard/principal/university-reports/${group.studentId}/report`}
                className="text-base font-semibold text-slate-900 hover:underline"
              >
                {group.studentName}
              </Link>
              {group.className ? (
                <Badge variant="outline" className="text-slate-600">
                  {group.className}
                </Badge>
              ) : null}
              <Badge variant="outline" className="ml-auto text-slate-600">
                {group.items.length}개 대학
              </Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              {group.items.map((item, idx) => (
                <Badge
                  key={`${item.universityId ?? item.universityName}-${idx}`}
                  className={CATEGORY_TONE[item.category]}
                >
                  {item.shortName ?? item.universityName}
                  <span className="ml-1 font-normal opacity-70">· {item.programName}</span>
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
