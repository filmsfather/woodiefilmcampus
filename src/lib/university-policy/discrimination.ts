/**
 * "내신 변별력" 산출.
 *
 * 대학 환산표(rankConversion)는 등급 간 점수 차가 비선형이라, 공개된 "등급 컷"이
 * 실제 환산점수로는 얼마나 빡센지가 학교마다 크게 다르다. 예를 들어 서경대는
 * 1~6등급 차이가 만점의 5%에 불과해, 4~6등급 합격선도 사실상 만점 근처다(실기가 결정).
 * 반대로 성결대·호서대는 표가 가팔라 같은 등급 차이가 점수에서 크게 벌어진다.
 *
 * 본 모듈은 "그 모집단위의 합격선(가장 낮은 합격 등급)을 학교 환산표로 돌렸을 때,
 * 1등급 만점 대비 몇 %p가 깎이는가"로 내신 변별력을 약/중/강으로 분류한다.
 *  - weak(약)   : 합격선 환산이 만점의 90% 이상 → 등급 차이가 점수에 거의 반영되지 않음(실기·면접 결정력 큼)
 *  - medium(중) : 75~90% → 등급이 어느 정도 영향
 *  - strong(강) : 75% 미만 → 등급이 점수에서 크게 벌어짐(내신 결정력 큼)
 *
 * ⚠️ 이 지표는 "환산표의 모양"만 본다. 학생부 반영비중(실기 80% 등)은 별도이며,
 *    교과 100% 전형은 변별력이 약으로 나와도 등급이 합격을 좌우할 수 있다.
 */

import type { CutPoint, CutoffMetric, FormulaSpec } from '@/lib/university-policy/types'

export type DiscriminationLevel = 'weak' | 'medium' | 'strong'

export const DISCRIMINATION_LABELS: Record<DiscriminationLevel, string> = {
  weak: '약',
  medium: '중',
  strong: '강',
}

const GRADE_METRICS: readonly CutoffMetric[] = [
  'grade_mean_with_career',
  'grade_mean_without_career',
]

type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9

/** 환산표를 정수 등급 사이에서 선형보간한다. */
function interpRankConversion(spec: FormulaSpec, grade: number): number {
  const conv = spec.rankConversion
  if (grade <= 1) return conv[1]
  if (grade >= 9) return conv[9]
  const lo = Math.floor(grade) as Rank
  const hi = (lo + 1) as Rank
  return conv[lo] + (conv[hi] - conv[lo]) * (grade - lo)
}

export interface GradeDiscrimination {
  level: DiscriminationLevel
  /** 합격선 등급(환산 기준이 된 가장 낮은 등급 컷). */
  referenceGrade: number
  /** 합격선 등급의 환산점수가 1등급 만점의 몇 %인지. */
  worstAdmitPercent: number
  /** 1등급 대비 깎인 폭(%p). */
  gapFromTopPercent: number
}

/**
 * 산식(환산표)과 등급 컷 점들로 내신 변별력을 산출한다.
 * 등급 metric 컷이 없으면 환산표 모양만으로(1→6등급 구간) 추정한다.
 */
export function computeGradeDiscrimination(
  spec: FormulaSpec,
  cutPoints: CutPoint[] = []
): GradeDiscrimination {
  const gradeValues = cutPoints
    .filter((p) => GRADE_METRICS.includes(p.metric))
    .map((p) => p.value)

  // 합격선 = 가장 낮은(=값이 큰) 등급 컷. 없으면 표 모양 기준으로 6등급 사용.
  const referenceGrade = gradeValues.length > 0 ? Math.max(...gradeValues) : 6

  const top = spec.rankConversion[1]
  const worst = interpRankConversion(spec, referenceGrade)
  const worstAdmitPercent = top > 0 ? (worst / top) * 100 : 0
  const gapFromTopPercent = 100 - worstAdmitPercent

  let level: DiscriminationLevel
  if (gapFromTopPercent < 10) level = 'weak'
  else if (gapFromTopPercent <= 25) level = 'medium'
  else level = 'strong'

  return {
    level,
    referenceGrade: Math.round(referenceGrade * 100) / 100,
    worstAdmitPercent: Math.round(worstAdmitPercent * 10) / 10,
    gapFromTopPercent: Math.round(gapFromTopPercent * 10) / 10,
  }
}
