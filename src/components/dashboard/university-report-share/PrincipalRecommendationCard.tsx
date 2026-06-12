import { Loader2, MessageSquareText, Sparkles } from 'lucide-react'

import RecommendationResponse from '@/components/dashboard/university-report-share/RecommendationResponse'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import type {
  RecommendationItemView,
  ReportRecommendation,
  WishlistCatalogEntry,
} from '@/lib/university-wishlist/data'

export interface RecommendationResponseContext {
  token: string
  catalog: WishlistCatalogEntry[]
  existingProgramKeys: string[]
}

interface PrincipalRecommendationCardProps {
  recommendation?: ReportRecommendation | null
  responseContext?: RecommendationResponseContext | null
}

const GROUP_ORDER: { category: RecommendationItemView['category']; label: string; hint?: string }[] = [
  { category: 'general', label: '일반대 (4년제)', hint: '수시 6장' },
  { category: 'specialized', label: '전문대 · 예대', hint: '추가 지원' },
  { category: 'karts', label: '한예종', hint: '수시 6장과 별개' },
]

/**
 * 원장 추천 대학·코멘트 카드.
 * 추천이 전송되기 전에는 "준비 중" 안내를, 전송 후에는 추천 대학 목록과 코멘트를 보여준다.
 */
export default function PrincipalRecommendationCard({
  recommendation,
  responseContext,
}: PrincipalRecommendationCardProps) {
  return (
    <Card className="border-[#dfe4d4] bg-[#f7f8f3] shadow-sm print:shadow-none">
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-[#8a9472]" />
          <h2 className="text-base font-semibold text-[#5a6450]">원장 추천 대학 및 코멘트</h2>
        </div>

        {!recommendation ? (
          <div className="flex items-start gap-2 rounded-lg border border-[#e3e6db] bg-white p-3 text-sm text-slate-600">
            <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-[#8a9472]" />
            <p className="leading-relaxed">
              원장 선생님이 보내주신 희망 분류를 확인하고 추천 대학과 코멘트를 준비하고 있어요.
              <br className="hidden sm:block" />
              원장 선생님이 추천 대학을 입력하면 문자로 알려드릴게요. 준비가 완료되면 이곳에서 확인하실 수 있습니다.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {recommendation.comment ? (
              <div className="flex items-start gap-2 rounded-lg border border-[#e3e6db] bg-white p-3 text-sm text-slate-700">
                <MessageSquareText className="mt-0.5 size-4 shrink-0 text-[#8a9472]" />
                <p className="whitespace-pre-wrap leading-relaxed">{recommendation.comment}</p>
              </div>
            ) : null}

            <div className="space-y-3">
              {GROUP_ORDER.map((group) => {
                const items = recommendation.items.filter((i) => i.category === group.category)
                if (items.length === 0) return null
                return (
                  <div key={group.category} className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-[#5a6450]">{group.label}</h3>
                      <span className="text-xs text-slate-400">
                        {items.length}개{group.hint ? ` · ${group.hint}` : ''}
                      </span>
                    </div>
                    <div className="grid gap-2">
                      {items.map((item) => (
                        <div
                          key={item.id}
                          className="rounded-lg border border-[#e3e6db] bg-white p-3"
                        >
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-sm font-medium text-slate-900">
                              {item.universityName}
                            </span>
                            {item.region ? (
                              <Badge variant="outline" className="border-slate-200 text-slate-500">
                                {item.region}
                              </Badge>
                            ) : null}
                          </div>
                          <p className="mt-0.5 truncate text-xs text-slate-500">
                            {item.programName}
                            {item.admissionTrack ? ` · ${item.admissionTrack}` : ''}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>

            {responseContext ? (
              <RecommendationResponse
                token={responseContext.token}
                status={recommendation.status}
                catalog={responseContext.catalog}
                existingProgramKeys={responseContext.existingProgramKeys}
              />
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
