import { Lightbulb } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

/**
 * 지원 전략 원칙. 참고 리포트(우디쌤 분석 리포트)의 마지막 페이지 가이드를 반영.
 */
export default function StrategyGuideSection() {
  return (
    <Card className="border-amber-200 bg-amber-50/50 shadow-sm print:break-inside-avoid print:shadow-none">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base font-semibold text-amber-900">
          <Lightbulb className="size-4" /> 지원 전략 가이드
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm text-amber-900">
        <div className="space-y-1">
          <p className="font-semibold">1. 지원 원칙</p>
          <ul className="ml-4 list-disc space-y-1 text-amber-800">
            <li>무리한 상향 지원은 권장하지 않습니다.</li>
            <li>
              가급적 <span className="font-medium">&apos;안정·적정·도전&apos;</span> 으로 분류된 대학 안에서 선택하세요.
            </li>
          </ul>
        </div>
        <div className="space-y-1">
          <p className="font-semibold">2. 예대(전문대)군</p>
          <ul className="ml-4 list-disc space-y-1 text-amber-800">
            <li>수시 일반대학 6장 카드에 포함되지 않아 추가로 얼마든지 지원할 수 있습니다.</li>
            <li>서울예대, 동아방송예대, 서일대, 백석예대 등은 모두 지원하는 것을 추천합니다.</li>
          </ul>
        </div>
        <p className="text-xs text-amber-700">
          최종 지원 결정 전에 우디쌤과 한 번 더 상담해 주세요.
        </p>
      </CardContent>
    </Card>
  )
}
