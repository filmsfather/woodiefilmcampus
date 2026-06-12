import { Sparkles } from 'lucide-react'

import DisclaimerNote from '@/components/dashboard/university-report-share/DisclaimerNote'
import PrincipalRecommendationCard from '@/components/dashboard/university-report-share/PrincipalRecommendationCard'
import ReportHero from '@/components/dashboard/university-report-share/ReportHero'
import StrategyGuideSection from '@/components/dashboard/university-report-share/StrategyGuideSection'
import UniversityVerdictCard from '@/components/dashboard/university-report-share/UniversityVerdictCard'
import { tierStyle } from '@/components/dashboard/university-report-share/tier-styles'
import type {
  ReportTierGroup,
  ReportUniversityItem,
  StudentReportViewModel,
} from '@/lib/university-policy/report-view'

interface StudentReportViewProps {
  model: StudentReportViewModel
}

function TierGroupBlock({ group }: { group: ReportTierGroup }) {
  const style = tierStyle(group.tier)
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <span className={`size-3 rounded-full ${style.fill}`} aria-hidden />
        <h3 className="text-base font-semibold text-slate-900">
          {group.label}
          <span className="ml-1.5 text-sm font-normal text-slate-400">
            {group.items.length}개
          </span>
        </h3>
        <span className="text-xs text-slate-400">{style.hint}</span>
      </div>
      <div className="grid gap-3">
        {group.items.map((item) => (
          <UniversityVerdictCard key={item.id} item={item} />
        ))}
      </div>
    </section>
  )
}

function PlainCardGroup({
  title,
  hint,
  items,
}: {
  title: string
  hint?: string
  items: ReportUniversityItem[]
}) {
  if (items.length === 0) return null
  return (
    <section className="space-y-3">
      <div className="flex items-baseline gap-2">
        <h3 className="text-base font-semibold text-slate-900">
          {title}
          <span className="ml-1.5 text-sm font-normal text-slate-400">{items.length}개</span>
        </h3>
        {hint ? <span className="text-xs text-slate-400">{hint}</span> : null}
      </div>
      <div className="grid gap-3">
        {items.map((item) => (
          <UniversityVerdictCard key={item.id} item={item} />
        ))}
      </div>
    </section>
  )
}

export default function StudentReportView({ model }: StudentReportViewProps) {
  return (
    <div className="space-y-8">
      <PrincipalRecommendationCard />
      <ReportHero model={model} />

      {model.recommendedGroups.length > 0 ? (
        <div className="space-y-6">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-sky-500" />
            <h2 className="text-lg font-semibold text-slate-900">지원 추천 대학</h2>
            <span className="text-xs text-slate-400">
              안정·적정·도전으로 분류된 일반대 {model.recommendedCount}곳
            </span>
          </div>
          {model.recommendedGroups.map((group) => (
            <TierGroupBlock key={group.tier} group={group} />
          ))}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
          현재 성적으로 안정·적정·도전 구간에 드는 일반대 모집단위가 없습니다. 아래 가이드와
          예대군을 함께 확인해 주세요.
        </p>
      )}

      <PlainCardGroup
        title="예대 · 전문대학 (추가 지원)"
        hint="일반대 6장과 별개로 추가 지원 가능"
        items={model.yedaeItems}
      />

      {model.cautionGroups.length > 0 ? (
        <div className="space-y-6">
          <h2 className="text-lg font-semibold text-slate-900">지원 비권장 대학</h2>
          {model.cautionGroups.map((group) => (
            <TierGroupBlock key={group.tier} group={group} />
          ))}
        </div>
      ) : null}

      <PlainCardGroup
        title="원장 선생님 상담 필요"
        hint="정성평가(학생부종합 등) 전형이라 원장 선생님께 문의가 필요해요"
        items={model.consultItems}
      />

      <PlainCardGroup
        title="컷 미공개 대학"
        hint="작년 합격선이 공개되지 않아 판정할 수 없어요"
        items={model.unknownItems}
      />

      <StrategyGuideSection />
      <DisclaimerNote hasEstimated={model.hasEstimated} />
    </div>
  )
}
