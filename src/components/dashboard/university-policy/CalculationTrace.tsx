'use client'

import { useState } from 'react'

import EstimatedBadge from '@/components/dashboard/university-policy/EstimatedBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { CalculationTrace } from '@/lib/university-policy/calculator'
import { metricLabel } from '@/lib/university-policy/data'
import type { CutPoint } from '@/lib/university-policy/types'

interface CalculationTraceProps {
  trace: CalculationTrace
  cutPoints?: CutPoint[]
  warnings?: string[]
  defaultExpanded?: 'reflected' | 'excluded' | 'none'
}

/**
 * 학생 1명 × 모집단위 1개의 산식 계산 trace를 단계별로 보여준다.
 *  1) 산식 요약
 *  2) 반영 과목 표 (어떻게 가중되는지)
 *  3) 제외된 과목 + 사유
 *  4) metric별 식 + 값
 *  5) (선택) 컷 점들과 학생 값 비교
 */
export default function CalculationTrace({
  trace,
  cutPoints,
  warnings,
  defaultExpanded = 'reflected',
}: CalculationTraceProps) {
  const [expanded, setExpanded] = useState<'reflected' | 'excluded' | 'none'>(defaultExpanded)

  const spec = trace.spec
  const breakdown = Object.entries(trace.metricBreakdown)
  const hasCuts = cutPoints && cutPoints.length > 0

  return (
    <div className="space-y-4 rounded-md border border-slate-200 bg-slate-50 p-4">
      {/* 1. 산식 요약 */}
      <section className="space-y-1.5">
        <h3 className="text-sm font-semibold text-slate-900">① 산식 요약</h3>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline">반영교과 {spec.reflectedSubjects.join('·')}</Badge>
          <Badge variant="outline">과목구분 {spec.reflectedCourseTypes.join('·')}</Badge>
          <Badge variant="outline">
            학년가중{' '}
            {spec.yearWeight.kind === 'all_equal'
              ? '동일'
              : `${spec.yearWeight.y1}/${spec.yearWeight.y2}/${spec.yearWeight.y3}`}
          </Badge>
          <Badge variant="outline">
            P/F {spec.passFailRule === 'exclude' ? '제외' : spec.passFailRule === 'as_full' ? '만점' : '0점'}
          </Badge>
          <Badge variant="outline">
            가중 공통:{spec.weights.common}/진로:{spec.weights.career}
          </Badge>
          <Badge variant="outline">총점 {spec.totalScore}</Badge>
        </div>
      </section>

      {/* 2. 반영 과목 표 */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">
            ② 반영 과목 ({trace.reflectedCourses.length})
          </h3>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setExpanded(expanded === 'reflected' ? 'none' : 'reflected')}
          >
            {expanded === 'reflected' ? '접기' : '펼치기'}
          </Button>
        </div>
        {expanded === 'reflected' ? (
          <div className="overflow-x-auto rounded border border-slate-200 bg-white">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-100 text-left text-[11px] text-slate-500">
                <tr>
                  <th className="px-2 py-1.5">학년/학기</th>
                  <th className="px-2 py-1.5">과목</th>
                  <th className="px-2 py-1.5">교과·구분</th>
                  <th className="px-2 py-1.5 text-right">단위</th>
                  <th className="px-2 py-1.5 text-right">학년가중</th>
                  <th className="px-2 py-1.5 text-right">분모기여</th>
                  <th className="px-2 py-1.5 text-right">등급</th>
                  <th className="px-2 py-1.5 text-right">환산점</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {trace.reflectedCourses.map((c) => (
                  <tr key={c.courseId}>
                    <td className="px-2 py-1.5 text-slate-600">
                      {c.grade ?? '-'}-{c.semester ?? '-'}
                    </td>
                    <td className="px-2 py-1.5 text-slate-800">{c.rawSubjectName}</td>
                    <td className="px-2 py-1.5 text-slate-500">
                      {c.subjectArea} · {c.courseType}
                    </td>
                    <td className="px-2 py-1.5 text-right">{c.credits}</td>
                    <td className="px-2 py-1.5 text-right">{c.yearWeight}</td>
                    <td className="px-2 py-1.5 text-right">{c.weightFactor.toFixed(2)}</td>
                    <td className="px-2 py-1.5 text-right">
                      {c.gradeForMean != null
                        ? c.gradeForMean
                        : c.achievement
                          ? c.achievement
                          : '-'}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      {c.convertedScore != null ? c.convertedScore : '-'}
                    </td>
                  </tr>
                ))}
                {trace.reflectedCourses.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-2 py-3 text-center text-slate-400">
                      반영된 과목이 없습니다.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      {/* 3. 제외 과목 */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">
            ③ 제외된 과목 ({trace.excludedCourses.length})
          </h3>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setExpanded(expanded === 'excluded' ? 'none' : 'excluded')}
          >
            {expanded === 'excluded' ? '접기' : '펼치기'}
          </Button>
        </div>
        {expanded === 'excluded' ? (
          <div className="overflow-x-auto rounded border border-slate-200 bg-white">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-100 text-left text-[11px] text-slate-500">
                <tr>
                  <th className="px-2 py-1.5">학년/학기</th>
                  <th className="px-2 py-1.5">과목</th>
                  <th className="px-2 py-1.5">교과·구분</th>
                  <th className="px-2 py-1.5">제외 사유</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {trace.excludedCourses.map((c) => (
                  <tr key={c.courseId}>
                    <td className="px-2 py-1.5 text-slate-600">
                      {c.grade ?? '-'}-{c.semester ?? '-'}
                    </td>
                    <td className="px-2 py-1.5 text-slate-800">{c.rawSubjectName}</td>
                    <td className="px-2 py-1.5 text-slate-500">
                      {c.subjectArea} · {c.courseType}
                    </td>
                    <td className="px-2 py-1.5 text-amber-700">{c.reason}</td>
                  </tr>
                ))}
                {trace.excludedCourses.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-2 py-3 text-center text-slate-400">
                      제외된 과목이 없습니다.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      {/* 4. metric별 식 */}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-900">④ 산출 지표</h3>
        <ul className="space-y-1.5 text-xs">
          {breakdown.length === 0 ? (
            <li className="text-slate-400">산출된 지표가 없습니다.</li>
          ) : null}
          {breakdown.map(([metric, info]) =>
            info ? (
              <li key={metric} className="rounded border border-slate-200 bg-white px-3 py-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium text-slate-800">
                    {metricLabel(metric as Parameters<typeof metricLabel>[0])}
                  </span>
                  <span className="text-base font-semibold text-slate-900">
                    {info.value != null ? info.value.toFixed(2) : '계산 불가'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500">{info.formula}</p>
                <p className="text-[11px] text-slate-400">
                  Σ분자 = {info.numerator?.toFixed(2)} / Σ분모 = {info.denominator?.toFixed(2)}
                </p>
              </li>
            ) : null
          )}
        </ul>
      </section>

      {/* 5. 컷 비교 (선택) */}
      {hasCuts ? (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-slate-900">⑤ 컷 비교</h3>
          <ul className="space-y-1 text-xs">
            {cutPoints!.map((p, idx) => (
              <li
                key={`${p.metric}-${p.label}-${idx}`}
                className="flex flex-wrap items-center gap-2 rounded border border-slate-200 bg-white px-3 py-1.5"
              >
                <Badge variant="outline">{metricLabel(p.metric)}</Badge>
                <span className="text-slate-500">{p.label}</span>
                <span className="font-medium text-slate-800">{p.value}</span>
                {p.isEstimated ? <EstimatedBadge>추정</EstimatedBadge> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* warnings */}
      {warnings && warnings.length > 0 ? (
        <section className="space-y-1">
          <h3 className="text-sm font-semibold text-amber-800">⚠ 경고</h3>
          <ul className="list-inside list-disc text-xs text-amber-800">
            {warnings.map((w, idx) => (
              <li key={idx}>{w}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
