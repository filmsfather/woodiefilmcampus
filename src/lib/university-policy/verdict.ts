/**
 * 학생 점수와 대학 컷 점들로부터 verdict(안정/적정/도전/위험) 산출.
 * 컷 점의 개수에 무관하게 작동하도록 일반화되어 있다.
 */

import {
  CUTOFF_METRIC_LOWER_IS_BETTER,
  type CutPoint,
  type CutoffMetric,
  type MetricVerdict,
  type StudentMetrics,
  type VerdictTier,
} from '@/lib/university-policy/types'

/**
 * 4단계 tier(안정/적정/도전/위험)를 컷 점 개수에 맞춰 분배한다.
 * 점이 적으면 단계도 줄어든다.
 *  - 1점: [안정, 위험]
 *  - 2점: [안정, 도전, 위험]
 *  - 3점: [안정, 적정, 도전, 위험]
 *  - 4점 이상: [안정, 적정, 도전, 위험, 위험, ...] (마지막은 모두 위험)
 */
function tiersForCount(pointCount: number): VerdictTier[] {
  // pointCount 개의 컷이 있으면 구간은 pointCount + 1 개.
  if (pointCount <= 0) return []
  if (pointCount === 1) return ['safe', 'risk']
  if (pointCount === 2) return ['safe', 'reach', 'risk']
  if (pointCount === 3) return ['safe', 'fit', 'reach', 'risk']
  // 4개 이상: 안정/적정/도전/위험 + 마지막 추가 점들은 모두 unfit
  const tiers: VerdictTier[] = ['safe', 'fit', 'reach', 'risk']
  for (let i = 4; i <= pointCount; i += 1) tiers.push('unfit')
  return tiers
}

/**
 * 학생 점수와 같은 metric의 컷 점들을 받아 verdict tier와
 * 어느 두 컷 사이에 있는지(라벨 쌍)를 반환한다.
 */
export function verdictFromPoints(
  studentValue: number | null,
  points: CutPoint[],
  lowerIsBetter: boolean
): {
  tier: VerdictTier
  betweenLabels: [string | null, string | null]
  isEstimatedBased: boolean
} {
  if (studentValue === null || points.length === 0) {
    return {
      tier: 'unknown',
      betweenLabels: [null, null],
      isEstimatedBased: points.every((p) => p.isEstimated || p.confidence === 'low'),
    }
  }

  // 좋은 쪽 → 나쁜 쪽 정렬.
  const sorted = [...points].sort((a, b) =>
    lowerIsBetter ? a.value - b.value : b.value - a.value
  )

  const tiers = tiersForCount(sorted.length)

  // 학생값이 어느 컷 인덱스 이내에 들어가는지 찾는다.
  // sorted[i].value 가 lowerIsBetter 기준 i+1번째 좋은 컷.
  let idx = -1
  for (let i = 0; i < sorted.length; i += 1) {
    const cut = sorted[i].value
    const passes = lowerIsBetter ? studentValue <= cut : studentValue >= cut
    if (passes) {
      idx = i
      break
    }
  }

  let tier: VerdictTier
  let betweenLabels: [string | null, string | null]

  if (idx === 0) {
    tier = tiers[0] ?? 'safe'
    betweenLabels = [null, sorted[0].label]
  } else if (idx === -1) {
    tier = tiers[tiers.length - 1] ?? 'risk'
    betweenLabels = [sorted[sorted.length - 1].label, null]
  } else {
    tier = tiers[idx] ?? 'reach'
    betweenLabels = [sorted[idx - 1].label, sorted[idx].label]
  }

  const isEstimatedBased = sorted.every((p) => p.isEstimated || p.confidence === 'low')

  return { tier, betweenLabels, isEstimatedBased }
}

/**
 * 학생 metrics와 컷 점 전체를 받아 metric별 verdict를 산출한다.
 * 컷 점이 0개인 metric은 결과에 포함되지 않는다(UI에서 "비교 불가" 처리).
 */
export function buildVerdicts(
  metrics: StudentMetrics,
  points: CutPoint[]
): MetricVerdict[] {
  const byMetric = new Map<CutoffMetric, CutPoint[]>()
  for (const p of points) {
    const list = byMetric.get(p.metric) ?? []
    list.push(p)
    byMetric.set(p.metric, list)
  }

  const result: MetricVerdict[] = []

  for (const [metric, list] of byMetric.entries()) {
    const studentValue = metrics.values[metric] ?? null
    const lowerIsBetter = CUTOFF_METRIC_LOWER_IS_BETTER[metric]
    const { tier, betweenLabels, isEstimatedBased } = verdictFromPoints(
      studentValue,
      list,
      lowerIsBetter
    )
    result.push({
      metric,
      tier,
      studentValue,
      betweenLabels,
      cutPoints: list,
      isEstimatedBased,
    })
  }

  return result
}
