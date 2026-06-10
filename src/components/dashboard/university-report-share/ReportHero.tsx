import { GraduationCap, MessageSquareQuote } from 'lucide-react'

import VerdictDistributionChart from '@/components/dashboard/university-report-share/VerdictDistributionChart'
import { tierStyle } from '@/components/dashboard/university-report-share/tier-styles'
import { Card, CardContent } from '@/components/ui/card'
import type { StudentReportViewModel } from '@/lib/university-policy/report-view'
import type { VerdictTier } from '@/lib/university-policy/types'

interface ReportHeroProps {
  model: StudentReportViewModel
}

function formatDate(iso: string | null) {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

const SUMMARY_TIERS: VerdictTier[] = ['safe', 'fit', 'reach']

export default function ReportHero({ model }: ReportHeroProps) {
  const publishedDate = formatDate(model.publishedAt)

  return (
    <Card className="border-slate-200 shadow-sm print:shadow-none">
      <CardContent className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-1">
            <p className="flex items-center gap-1.5 text-xs text-slate-500">
              <GraduationCap className="size-3.5" /> 지원가능대학 분석 리포트
            </p>
            <h1 className="text-2xl font-semibold text-slate-900">
              {model.studentName} 학생
            </h1>
          </div>
          <div className="text-right text-xs text-slate-500">
            {model.gradeMeanApprox != null ? (
              <p>
                내신 등급평균 약{' '}
                <span className="text-base font-semibold text-slate-800">
                  {model.gradeMeanApprox.toFixed(2)}
                </span>
              </p>
            ) : null}
            {publishedDate ? <p>발행일 {publishedDate}</p> : null}
          </div>
        </div>

        {/* 판정 분포 칩: 한눈에 안정/적정/도전 개수 파악 */}
        <div className="grid grid-cols-3 gap-2">
          {SUMMARY_TIERS.map((tier) => {
            const style = tierStyle(tier)
            return (
              <div
                key={tier}
                className="rounded-lg border border-slate-100 bg-slate-50/60 p-3 text-center"
              >
                <p className={`mx-auto mb-1 w-fit rounded-full px-2 py-0.5 text-xs font-medium ${style.badge}`}>
                  {style.label}
                </p>
                <p className="text-2xl font-bold text-slate-900">
                  {model.tierCounts[tier]}
                  <span className="ml-0.5 text-sm font-normal text-slate-400">개</span>
                </p>
              </div>
            )
          })}
        </div>

        <VerdictDistributionChart tierCounts={model.tierCounts} />

        {model.principalComment ? (
          <div className="flex gap-2 rounded-lg border border-sky-100 bg-sky-50 p-3 text-sm text-sky-900">
            <MessageSquareQuote className="mt-0.5 size-4 shrink-0 text-sky-500" />
            <p className="whitespace-pre-line leading-relaxed">{model.principalComment}</p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
