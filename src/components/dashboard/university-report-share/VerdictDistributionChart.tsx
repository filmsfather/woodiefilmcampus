import { tierStyle } from '@/components/dashboard/university-report-share/tier-styles'
import type { VerdictTier } from '@/lib/university-policy/types'

interface VerdictDistributionChartProps {
  tierCounts: Record<VerdictTier, number>
}

// 노출 순서(유리 → 불리). unknown은 별도 처리하므로 제외.
const ORDER: VerdictTier[] = ['safe', 'fit', 'reach', 'risk', 'unfit']

export default function VerdictDistributionChart({
  tierCounts,
}: VerdictDistributionChartProps) {
  const total = ORDER.reduce((sum, t) => sum + tierCounts[t], 0)
  if (total === 0) return null

  return (
    <div className="space-y-3">
      <div className="flex h-4 w-full overflow-hidden rounded-full bg-slate-100">
        {ORDER.map((tier) => {
          const count = tierCounts[tier]
          if (count === 0) return null
          const pct = (count / total) * 100
          return (
            <div
              key={tier}
              className={tierStyle(tier).fill}
              style={{ width: `${pct}%` }}
              title={`${tierStyle(tier).label} ${count}개`}
            />
          )
        })}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
        {ORDER.map((tier) => {
          const count = tierCounts[tier]
          if (count === 0) return null
          return (
            <span key={tier} className="flex items-center gap-1.5">
              <span className={`size-2.5 rounded-full ${tierStyle(tier).fill}`} aria-hidden />
              {tierStyle(tier).label} {count}개
            </span>
          )
        })}
      </div>
    </div>
  )
}
