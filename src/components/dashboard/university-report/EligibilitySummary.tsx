import { ClipboardCheck } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { ReportEligibility } from '@/lib/university-report/types'

interface EligibilitySummaryProps {
  eligibility: ReportEligibility | null
  title?: string
  emptyMessage?: string
  footer?: React.ReactNode
}

const ROWS: { key: 'isGed' | 'ruralEligible' | 'lowIncomeEligible'; label: string }[] = [
  { key: 'isGed', label: '검정고시 지원' },
  { key: 'ruralEligible', label: '농어촌 전형 지원가능' },
  { key: 'lowIncomeEligible', label: '차상위 전형 지원가능' },
]

export default function EligibilitySummary({
  eligibility,
  title = '사전 조사 결과',
  emptyMessage = '아직 사전 조사에 응답하지 않았습니다.',
  footer,
}: EligibilitySummaryProps) {
  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-900">
          <ClipboardCheck className="size-4" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {eligibility ? (
          <ul className="space-y-2">
            {ROWS.map(({ key, label }) => {
              const value = eligibility[key]
              return (
                <li key={key} className="flex items-center justify-between gap-3">
                  <span className="text-sm text-slate-700">{label}</span>
                  <Badge
                    variant={value ? 'default' : 'outline'}
                    className={cn(value ? 'bg-sky-600' : 'text-slate-500')}
                  >
                    {value ? '예' : '아니오'}
                  </Badge>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">{emptyMessage}</p>
        )}
        {footer}
      </CardContent>
    </Card>
  )
}
