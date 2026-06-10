'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, Users } from 'lucide-react'

import EstimatedBadge from '@/components/dashboard/university-policy/EstimatedBadge'
import ProgramStrategyDetail from '@/components/dashboard/university-report-share/ProgramStrategyDetail'
import ScoreGauge from '@/components/dashboard/university-report-share/ScoreGauge'
import { tierStyle } from '@/components/dashboard/university-report-share/tier-styles'
import { Badge } from '@/components/ui/badge'
import type { ReportUniversityItem } from '@/lib/university-policy/report-view'

interface UniversityVerdictCardProps {
  item: ReportUniversityItem
}

export default function UniversityVerdictCard({ item }: UniversityVerdictCardProps) {
  const [expanded, setExpanded] = useState(false)
  const style = tierStyle(item.tier)
  const hasDetail = Boolean(
    item.details &&
      (item.details.evaluationMethod ||
        item.details.practicalTest ||
        item.details.gradeCalculation ||
        item.details.recruitSummary ||
        item.details.other ||
        (item.schedule && item.schedule.length > 0))
  )

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm print:break-inside-avoid">
      <div className="flex">
        <div className={`w-1.5 shrink-0 ${style.bar}`} aria-hidden />
        <div className="flex-1 space-y-3 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="space-y-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-semibold text-slate-900">
                  {item.universityName}
                </h3>
                <Badge className={style.badge}>{item.tierLabel}</Badge>
                {item.isEstimated ? <EstimatedBadge>추정 컷</EstimatedBadge> : null}
              </div>
              <p className="text-sm text-slate-600">
                {item.programName}
                {item.programTrack ? ` · ${item.programTrack}` : ''}
              </p>
            </div>
            <div className="text-right text-xs text-slate-500">
              <p>{item.programYear}학년도</p>
              {item.recruitCount != null ? <p>모집 {item.recruitCount}명</p> : null}
            </div>
          </div>

          {item.coreTrack ? (
            <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
              {item.coreTrack}
            </p>
          ) : null}

          {item.gauge ? (
            <ScoreGauge
              metricLabel={item.gauge.metricLabel}
              lowerIsBetter={item.gauge.lowerIsBetter}
              studentValue={item.gauge.studentValue}
              points={item.gauge.points}
            />
          ) : item.analysisMode === 'always_open' ? (
            <p className="rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
              내신 성적과 무관하게 전 등급 지원 가능해요. (실기 위주 전형)
            </p>
          ) : item.analysisMode === 'consult' ? (
            <p className="rounded-md bg-violet-50 px-3 py-2 text-xs text-violet-700">
              정성평가(학생부종합 등) 전형이라 합격선을 점수로 판정할 수 없어요. 지원 가능 여부는 원장 선생님께 문의해 주세요.
            </p>
          ) : (
            <p className="text-xs text-slate-400">작년 합격 컷이 공개되지 않아 위치를 표시할 수 없어요.</p>
          )}

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
            {item.competitionRate != null ? (
              <span className="flex items-center gap-1">
                <Users className="size-3" />
                {item.cutSourceYear ? `${item.cutSourceYear}학년도 ` : '작년 '}경쟁률 {item.competitionRate}:1
              </span>
            ) : null}
            {item.fillRate != null ? <span>충원율 {item.fillRate}%</span> : null}
            {item.practicalDate ? <span>실기 {item.practicalDate}</span> : null}
          </div>

          {hasDetail ? (
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 print:hidden"
              >
                {expanded ? (
                  <>
                    <ChevronUp className="size-3.5" /> 전형 상세 접기
                  </>
                ) : (
                  <>
                    <ChevronDown className="size-3.5" /> 전형 방법·실기·일정 보기
                  </>
                )}
              </button>
              {/* 인쇄 시에는 항상 펼쳐서 출력 */}
              <div className={`mt-3 border-t border-slate-100 pt-3 ${expanded ? '' : 'hidden'} print:block`}>
                <ProgramStrategyDetail item={item} />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
