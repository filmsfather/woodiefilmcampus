'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowUpDown, ChevronDown, ChevronUp } from 'lucide-react'

import CalculationTrace from '@/components/dashboard/university-policy/CalculationTrace'
import EstimatedBadge from '@/components/dashboard/university-policy/EstimatedBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { evaluateMetricsWithTrace } from '@/lib/university-policy/calculator'
import {
  VERDICT_TIER_BADGE,
  metricLabel,
  type EvaluationListRow,
} from '@/lib/university-policy/data'
import {
  CUT_PRESETS,
  FORMULA_PRESETS,
} from '@/lib/university-policy/presets'
import {
  CUT_SOURCE_LABELS,
  type CutoffMetric,
  type VerdictTier,
} from '@/lib/university-policy/types'
import type { CourseRow } from '@/lib/university-report/data'

interface EvaluationsTableProps {
  rows: EvaluationListRow[]
  /**
   * 학생의 정규화된 과목 데이터. 행 펼침 시 산식 trace를 클라이언트에서
   * 즉석 재계산하기 위해 전달한다(presets만으로 재현 가능 → 원장 검증용).
   */
  courses?: CourseRow[]
}

const TIER_FILTERS: Array<{ value: 'all' | VerdictTier; label: string }> = [
  { value: 'all', label: '전체' },
  { value: 'safe', label: '안정' },
  { value: 'fit', label: '적정' },
  { value: 'reach', label: '도전' },
  { value: 'risk', label: '위험' },
  { value: 'unfit', label: '부적합' },
  { value: 'unknown', label: '판정 불가' },
]

const TIER_RANK: Record<VerdictTier, number> = {
  safe: 0,
  fit: 1,
  reach: 2,
  risk: 3,
  unfit: 4,
  unknown: 5,
}

function bestVerdict(row: EvaluationListRow): VerdictTier {
  if (row.verdicts.length === 0) return 'unknown'
  return row.verdicts.reduce<VerdictTier>(
    (acc, v) => (TIER_RANK[v.tier] < TIER_RANK[acc] ? v.tier : acc),
    'unknown'
  )
}

export default function EvaluationsTable({ rows, courses }: EvaluationsTableProps) {
  const [search, setSearch] = useState('')
  const [tierFilter, setTierFilter] = useState<'all' | VerdictTier>('all')
  const [yearFilter, setYearFilter] = useState<'all' | string>('all')
  const [sortKey, setSortKey] = useState<'verdict' | 'university'>('verdict')
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null)

  const years = useMemo(() => {
    const set = new Set(rows.map((r) => r.programYear))
    return Array.from(set)
      .filter((y) => y > 0)
      .sort((a, b) => b - a)
  }, [rows])

  const filtered = useMemo(() => {
    const lcSearch = search.trim().toLowerCase()
    return rows
      .map((r) => ({ row: r, best: bestVerdict(r) }))
      .filter(({ row, best }) => {
        if (yearFilter !== 'all' && row.programYear.toString() !== yearFilter) return false
        if (tierFilter !== 'all' && best !== tierFilter) return false
        if (lcSearch.length > 0) {
          const hay = `${row.universityName} ${row.programName} ${row.programTrack}`.toLowerCase()
          if (!hay.includes(lcSearch)) return false
        }
        return true
      })
      .sort((a, b) => {
        if (sortKey === 'verdict') {
          const diff = TIER_RANK[a.best] - TIER_RANK[b.best]
          if (diff !== 0) return diff
        }
        const an = `${a.row.universityName} ${a.row.programName}`
        const bn = `${b.row.universityName} ${b.row.programName}`
        return an.localeCompare(bn, 'ko')
      })
  }, [rows, search, tierFilter, yearFilter, sortKey])

  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
        아직 분석 결과가 없습니다. 위의 &quot;분석 실행&quot; 버튼을 눌러 평가를 산출해주세요.
        <p className="mt-2 text-xs text-slate-400">
          분석을 실행하려면 최소 1개 이상의 모집단위에 활성 산식과 활성 컷이 등록되어 있어야 합니다.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1">
          <Input
            placeholder="대학 또는 모집단위 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div>
          <Select value={tierFilter} onValueChange={(v) => setTierFilter(v as typeof tierFilter)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIER_FILTERS.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Select value={yearFilter} onValueChange={(v) => setYearFilter(v)}>
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">모든 학년도</SelectItem>
              {years.map((y) => (
                <SelectItem key={y} value={y.toString()}>
                  {y}학년도
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setSortKey((k) => (k === 'verdict' ? 'university' : 'verdict'))}
          className="gap-1"
        >
          <ArrowUpDown className="size-3" />
          {sortKey === 'verdict' ? '판정 순' : '대학명 순'}
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500">
            <tr>
              <th className="px-3 py-2 w-8" />
              <th className="px-3 py-2">대학 / 모집단위</th>
              <th className="px-3 py-2">학년도/전형</th>
              <th className="px-3 py-2">출처</th>
              <th className="px-3 py-2">학생 점수</th>
              <th className="px-3 py-2">판정</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map(({ row }) => (
              <EvaluationRow
                key={row.id}
                row={row}
                expanded={expandedRowId === row.id}
                onToggle={() =>
                  setExpandedRowId(expandedRowId === row.id ? null : row.id)
                }
                courses={courses}
              />
            ))}
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-sm text-slate-500">
                  필터 조건에 맞는 모집단위가 없습니다.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function EvaluationRow({
  row,
  expanded,
  onToggle,
  courses,
}: {
  row: EvaluationListRow
  expanded: boolean
  onToggle: () => void
  courses?: CourseRow[]
}) {
  return (
    <>
      <tr className="align-top">
        <td className="px-3 py-3">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-6"
            onClick={onToggle}
            aria-label={expanded ? '계산 trace 접기' : '계산 trace 펼치기'}
          >
            {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          </Button>
        </td>
        <td className="px-3 py-3">
          <Link
            href={`/dashboard/principal/universities/${row.universityId}/programs/${row.programKey}`}
            className="font-medium text-slate-900 hover:underline"
          >
            {row.universityName || row.programKey}
          </Link>
          <p className="text-xs text-slate-600">{row.programName}</p>
        </td>
        <td className="px-3 py-3 text-xs text-slate-600">
          <p>{row.programYear}학년도</p>
          <p>{row.programTrack}</p>
        </td>
        <td className="px-3 py-3 text-xs text-slate-600">
          {CUT_SOURCE_LABELS[row.cutSourceType]}
        </td>
        <td className="px-3 py-3">
          <StudentValuesCell row={row} />
        </td>
        <td className="px-3 py-3">
          <VerdictsCell row={row} />
        </td>
      </tr>
      {expanded ? (
        <tr>
          <td colSpan={6} className="bg-slate-50 px-3 py-3">
            <RowTrace row={row} courses={courses} />
          </td>
        </tr>
      ) : null}
    </>
  )
}

function RowTrace({
  row,
  courses,
}: {
  row: EvaluationListRow
  courses?: CourseRow[]
}) {
  const formula = FORMULA_PRESETS[row.formulaKey]
  const cut = CUT_PRESETS[row.cutKey]

  if (!formula) {
    return (
      <p className="text-xs text-slate-500">
        산식 프리셋({row.formulaKey})을 찾지 못했습니다. presets/formulas.ts에서 확인해주세요.
      </p>
    )
  }
  if (!courses) {
    return (
      <p className="text-xs text-slate-500">
        학생 과목 데이터가 전달되지 않아 trace를 표시할 수 없습니다.
      </p>
    )
  }
  const { trace } = evaluateMetricsWithTrace(courses, formula.spec)
  return (
    <CalculationTrace
      trace={trace}
      cutPoints={cut?.points}
      warnings={row.warnings ?? undefined}
    />
  )
}

function StudentValuesCell({ row }: { row: EvaluationListRow }) {
  if (!row.metricsSnapshot) return <span className="text-xs text-slate-400">-</span>
  const items = Object.entries(row.metricsSnapshot.values) as Array<
    [CutoffMetric, number | null | undefined]
  >
  return (
    <ul className="space-y-0.5 text-xs">
      {items.map(([metric, value]) => (
        <li key={metric}>
          <span className="text-slate-500">{metricLabel(metric)}: </span>
          <span className="font-medium text-slate-800">
            {value == null ? '-' : value.toFixed(2)}
          </span>
        </li>
      ))}
    </ul>
  )
}

function VerdictsCell({ row }: { row: EvaluationListRow }) {
  if (row.verdicts.length === 0) {
    return (
      <Badge variant="outline" className="text-xs text-slate-500">
        컷 미공개
      </Badge>
    )
  }
  return (
    <ul className="space-y-1">
      {row.verdicts.map((v) => {
        const badge = VERDICT_TIER_BADGE[v.tier]
        const between = v.betweenLabels.filter(Boolean).join(' ~ ')
        return (
          <li key={v.metric} className="flex flex-wrap items-center gap-1 text-xs">
            <Badge className={badge.className}>{badge.label}</Badge>
            <span className="text-slate-500">{metricLabel(v.metric)}</span>
            {v.studentValue != null ? (
              <span className="font-medium text-slate-700">{v.studentValue.toFixed(2)}</span>
            ) : null}
            {between ? <span className="text-slate-400">({between})</span> : null}
            {v.isEstimatedBased ? <EstimatedBadge /> : null}
          </li>
        )
      })}
    </ul>
  )
}
