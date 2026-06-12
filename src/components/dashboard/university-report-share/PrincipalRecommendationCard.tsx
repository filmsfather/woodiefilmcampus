import { Loader2, Sparkles } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'

/**
 * 원장 추천 대학·코멘트 카드(플레이스홀더).
 * 추천/코멘트 데이터 흐름은 추후 연결하며, 현재는 "원장이 컨설팅 준비 중"임을 안내한다.
 */
export default function PrincipalRecommendationCard() {
  return (
    <Card className="border-[#dfe4d4] bg-[#f7f8f3] shadow-sm print:shadow-none">
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-[#8a9472]" />
          <h2 className="text-base font-semibold text-[#5a6450]">원장 추천 대학 및 코멘트</h2>
        </div>
        <div className="flex items-start gap-2 rounded-lg border border-[#e3e6db] bg-white p-3 text-sm text-slate-600">
          <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-[#8a9472]" />
          <p className="leading-relaxed">
            원장 선생님이 보내주신 희망 분류를 확인하고 추천 대학과 코멘트를 준비하고 있어요.
            <br className="hidden sm:block" />
            준비가 완료되면 이곳에서 확인하실 수 있습니다.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
