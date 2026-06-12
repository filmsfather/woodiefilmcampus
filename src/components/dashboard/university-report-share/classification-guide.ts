/**
 * 학생·학부모가 대학을 희망/희망하지 않음으로 분류할 때 보여주는 티어별 안내.
 * ClassificationIntro(전체 안내)와 UniversityClassifier(카드별 안내)에서 공용으로 사용한다.
 */

import type { ReportUniversityItem } from '@/lib/university-policy/report-view'
import type { VerdictTier } from '@/lib/university-policy/types'

export type ClassificationCategory = 'recommend' | 'reach' | 'risk' | 'record' | 'yedae' | 'unknown'

export interface ClassificationGuide {
  category: ClassificationCategory
  title: string
  description: string
  // 안내 카드 배경/테두리/글자색 (Tailwind)
  box: string
  dot: string
}

export const CLASSIFICATION_GUIDES: Record<ClassificationCategory, ClassificationGuide> = {
  recommend: {
    category: 'recommend',
    title: '안정 · 적정',
    description:
      '실기를 잘 보면 충분히 노려볼 수 있어요. 다만 합격이 보장된다는 뜻은 아닙니다. 지원을 추천해요.',
    box: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    dot: 'bg-emerald-400',
  },
  reach: {
    category: 'reach',
    title: '도전',
    description:
      '실기를 잘 보더라도 내신 때문에 리스크를 감수해야 해요. 최대 한 곳 정도만 지원하는 것을 추천해요.',
    box: 'border-amber-200 bg-amber-50 text-amber-900',
    dot: 'bg-amber-400',
  },
  risk: {
    category: 'risk',
    title: '위험',
    description: '실기 여부와 상관없이 합격이 어려워요. 지원하지 않는 것을 추천해요.',
    box: 'border-rose-200 bg-rose-50 text-rose-900',
    dot: 'bg-rose-400',
  },
  record: {
    category: 'record',
    title: '생기부 대학',
    description:
      '내신 평균이 4.0 이상이고 생활기록부를 잘 채워둔 경우에만 희망으로 표시해 주세요.',
    box: 'border-violet-200 bg-violet-50 text-violet-900',
    dot: 'bg-violet-400',
  },
  yedae: {
    category: 'yedae',
    title: '예대 · 전문대학',
    description: '일반대 6장과 별개로 추가 지원할 수 있어요. 관심이 있다면 희망으로 표시해 주세요.',
    box: 'border-sky-200 bg-sky-50 text-sky-900',
    dot: 'bg-sky-400',
  },
  unknown: {
    category: 'unknown',
    title: '컷 미공개',
    description:
      '작년 합격선이 공개되지 않아 점수로 판정할 수 없어요. 지원 가능 여부는 원장 선생님과 상담이 필요해요.',
    box: 'border-slate-200 bg-slate-50 text-slate-700',
    dot: 'bg-slate-300',
  },
}

function categoryForTier(tier: VerdictTier): ClassificationCategory {
  switch (tier) {
    case 'safe':
    case 'fit':
      return 'recommend'
    case 'reach':
      return 'reach'
    case 'risk':
    case 'unfit':
      return 'risk'
    case 'consult':
      return 'record'
    default:
      return 'unknown'
  }
}

export function guideForItem(item: ReportUniversityItem): ClassificationGuide {
  if (item.isYedae) return CLASSIFICATION_GUIDES.yedae
  return CLASSIFICATION_GUIDES[categoryForTier(item.tier)]
}
