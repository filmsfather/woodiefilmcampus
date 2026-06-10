/**
 * 학생·학부모 리포트 전용 tier 색상/문구 스타일.
 * data.ts(VERDICT_TIER_BADGE)는 서버 전용 코드를 포함하므로, 클라이언트 컴포넌트에서
 * 안전하게 쓰기 위해 여기서 순수 스타일만 별도로 정의한다.
 */

import type { VerdictTier } from '@/lib/university-policy/types'

export interface TierStyle {
  label: string
  // 배지(칩) 배경/글자색
  badge: string
  // 카드 좌측 색 띠
  bar: string
  // 분포 차트 막대 배경
  fill: string
  // 한 줄 설명
  hint: string
}

export const TIER_STYLES: Record<VerdictTier, TierStyle> = {
  safe: {
    label: '안정',
    badge: 'bg-emerald-100 text-emerald-700',
    bar: 'bg-emerald-400',
    fill: 'bg-emerald-400',
    hint: '합격 가능성이 높아 안정적으로 노려볼 수 있어요.',
  },
  fit: {
    label: '적정',
    badge: 'bg-sky-100 text-sky-700',
    bar: 'bg-sky-400',
    fill: 'bg-sky-400',
    hint: '내 성적과 잘 맞는 적정 지원선이에요.',
  },
  reach: {
    label: '도전',
    badge: 'bg-amber-100 text-amber-800',
    bar: 'bg-amber-400',
    fill: 'bg-amber-400',
    hint: '조금 도전적이지만 실기로 승부를 볼 수 있어요.',
  },
  risk: {
    label: '위험',
    badge: 'bg-rose-100 text-rose-700',
    bar: 'bg-rose-400',
    fill: 'bg-rose-400',
    hint: '성적상 위험 구간이라 신중한 판단이 필요해요.',
  },
  unfit: {
    label: '부적합',
    badge: 'bg-slate-200 text-slate-600',
    bar: 'bg-slate-300',
    fill: 'bg-slate-300',
    hint: '현재 성적으로는 지원을 권장하지 않아요.',
  },
  consult: {
    label: '원장 문의',
    badge: 'bg-violet-100 text-violet-700',
    bar: 'bg-violet-300',
    fill: 'bg-violet-300',
    hint: '정성평가 전형이라 원장 선생님 상담이 필요해요.',
  },
  unknown: {
    label: '판정 불가',
    badge: 'bg-slate-100 text-slate-500',
    bar: 'bg-slate-200',
    fill: 'bg-slate-200',
    hint: '컷이 공개되지 않아 판정할 수 없어요.',
  },
}

export function tierStyle(tier: VerdictTier): TierStyle {
  return TIER_STYLES[tier]
}
