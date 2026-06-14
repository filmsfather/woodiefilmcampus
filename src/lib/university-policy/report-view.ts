/**
 * 원장용 평가 데이터(EvaluationListRow[])를 학생·학부모가 한눈에 이해할 수 있는
 * 리포트 뷰모델로 변환한다. UI 컴포넌트는 이 뷰모델만 props로 받는다.
 *
 * 핵심 단순화:
 *  - 모집단위별 "대표 판정"(가장 좋은 tier) 1개로 요약
 *  - 안정/적정/도전은 "지원 추천", 위험/부적합은 "지원 비권장"으로 그룹핑
 *  - 예대(전문대)군은 일반대 6장과 별개로 추가 지원 대상이므로 분리 노출
 */

import {
  getCutPreset,
  getProgramPreset,
  getUniversityPreset,
  listProgramsForAnalysis,
  type ProgramAnalysisMode,
} from '@/lib/university-policy/presets'
import type {
  ProgramDetails,
  ProgramPreset,
  ProgramScheduleItem,
} from '@/lib/university-policy/presets/programs'
import {
  CUTOFF_METRIC_LABELS,
  CUTOFF_METRIC_LOWER_IS_BETTER,
  VERDICT_TIER_LABELS,
  type CutSourceType,
  type CutoffMetric,
  type MetricVerdict,
  type VerdictTier,
} from '@/lib/university-policy/types'
import type { EvaluationListRow } from '@/lib/university-policy/data'
import { isYedaeUniversity } from '@/lib/university-policy/yedae'
import type { ReportPublication } from '@/lib/university-report/publication'

// tier 우선순위(작을수록 좋음). 대표 판정 선택과 정렬에 사용.
export const TIER_RANK: Record<VerdictTier, number> = {
  safe: 0,
  fit: 1,
  reach: 2,
  risk: 3,
  unfit: 4,
  consult: 5,
  unknown: 6,
}

/**
 * 모집단위 1개의 verdict 묶음에서 "가장 좋은 tier"를 고른다.
 * (EvaluationsTable에서 쓰던 로직을 공용으로 추출)
 */
export function bestVerdictTier(verdicts: MetricVerdict[]): VerdictTier {
  if (verdicts.length === 0) return 'unknown'
  return verdicts.reduce<VerdictTier>(
    (acc, v) => (TIER_RANK[v.tier] < TIER_RANK[acc] ? v.tier : acc),
    'unknown'
  )
}

/**
 * 분석 모드를 고려한 모집단위 대표 tier.
 *  - always_open : 전 등급 지원 가능 → 안정(safe)으로 묶되, 표시 단계에서 별도 안내.
 *  - consult     : 산식 없음(학종 등) → 원장 문의.
 *  - grade_cut   : 컷 비교 결과의 가장 좋은 tier.
 */
export function resolveItemTier(
  mode: ProgramAnalysisMode,
  verdicts: MetricVerdict[]
): VerdictTier {
  if (mode === 'always_open') return 'safe'
  if (mode === 'consult') return 'consult'
  return bestVerdictTier(verdicts)
}

/** 게이지(내 점수 vs 컷)용 단일 컷 점. */
export interface ReportGaugePoint {
  label: string
  value: number
}

/** 모집단위 1개의 학생친화 뷰모델. */
export interface ReportUniversityItem {
  id: string
  universityId: string
  universityName: string
  shortName: string | null
  programName: string
  programTrack: string
  programYear: number
  tier: VerdictTier
  tierLabel: string
  analysisMode: ProgramAnalysisMode
  isYedae: boolean
  recruitCount: number | null
  competitionRate: number | null
  fillRate: number | null
  cutSourceYear: number | null
  cutSourceType: CutSourceType
  coreTrack: string | null
  isEstimated: boolean
  details: ProgramDetails | null
  schedule: ProgramScheduleItem[] | null
  practicalDate: string | null
  // 대표 판정의 게이지 정보(없으면 null = 컷 미공개)
  gauge: {
    metricLabel: string
    lowerIsBetter: boolean
    studentValue: number | null
    points: ReportGaugePoint[]
    betweenLabels: [string | null, string | null]
  } | null
}

/** tier별 그룹. */
export interface ReportTierGroup {
  tier: VerdictTier
  label: string
  items: ReportUniversityItem[]
}

/** 학생 리포트 전체 뷰모델. */
export interface StudentReportViewModel {
  studentName: string
  principalComment: string | null
  publishedAt: string | null
  computedAt: string | null
  gradeMeanApprox: number | null
  tierCounts: Record<VerdictTier, number>
  recommendedGroups: ReportTierGroup[]
  cautionGroups: ReportTierGroup[]
  unknownItems: ReportUniversityItem[]
  consultItems: ReportUniversityItem[]
  yedaeItems: ReportUniversityItem[]
  // 검정고시 학생에게 "지원 불가"로 안내하는 학생부종합전형 목록 (검정고시 리포트에서만 채워짐).
  gedExcludedItems: ReportUniversityItem[]
  hasEstimated: boolean
  recommendedCount: number
  totalCount: number
}

function buildGauge(
  verdict: MetricVerdict | null
): ReportUniversityItem['gauge'] {
  if (!verdict || verdict.cutPoints.length === 0) return null
  const lowerIsBetter = CUTOFF_METRIC_LOWER_IS_BETTER[verdict.metric]
  const points = [...verdict.cutPoints]
    .sort((a, b) => (lowerIsBetter ? a.value - b.value : b.value - a.value))
    .map((p) => ({ label: p.label, value: p.value }))
  return {
    metricLabel: CUTOFF_METRIC_LABELS[verdict.metric],
    lowerIsBetter,
    studentValue: verdict.studentValue,
    points,
    betweenLabels: verdict.betweenLabels,
  }
}

function toItem(row: EvaluationListRow): ReportUniversityItem {
  const tier = resolveItemTier(row.analysisMode, row.verdicts)
  const program = getProgramPreset(row.programKey)
  const cut = getCutPreset(row.cutKey)
  const university = getUniversityPreset(row.universityId)

  // 대표 판정: grade_cut일 때만 컷 비교 게이지를 표시한다.
  const representative =
    row.analysisMode === 'grade_cut'
      ? row.verdicts.find((v) => v.tier === tier) ?? row.verdicts[0] ?? null
      : null

  const schedule = program?.details?.schedule ?? null
  const practicalDate =
    schedule?.find((s) => s.label.includes('실기'))?.value ?? null

  return {
    id: row.id,
    universityId: row.universityId,
    universityName: row.universityName || row.programKey,
    shortName: university?.shortName ?? null,
    programName: row.programName,
    programTrack: row.programTrack,
    programYear: row.programYear,
    tier,
    tierLabel: VERDICT_TIER_LABELS[tier],
    analysisMode: row.analysisMode,
    isYedae: isYedaeUniversity(row.universityId),
    recruitCount: program?.recruitCount ?? null,
    competitionRate: cut?.competitionRate ?? null,
    fillRate: cut?.fillRate ?? null,
    cutSourceYear: cut?.sourceYear ?? null,
    cutSourceType: row.cutSourceType,
    coreTrack: program?.details?.coreTrack ?? null,
    isEstimated: row.verdicts.some((v) => v.isEstimatedBased),
    details: program?.details ?? null,
    schedule,
    practicalDate,
    gauge: buildGauge(representative),
  }
}

function sortItems(items: ReportUniversityItem[]): ReportUniversityItem[] {
  return [...items].sort((a, b) => {
    const diff = TIER_RANK[a.tier] - TIER_RANK[b.tier]
    if (diff !== 0) return diff
    return `${a.universityName} ${a.programName}`.localeCompare(
      `${b.universityName} ${b.programName}`,
      'ko'
    )
  })
}

function groupByTiers(
  items: ReportUniversityItem[],
  tiers: VerdictTier[]
): ReportTierGroup[] {
  return tiers
    .map((tier) => ({
      tier,
      label: VERDICT_TIER_LABELS[tier],
      items: sortItems(items.filter((i) => i.tier === tier)),
    }))
    .filter((g) => g.items.length > 0)
}

/**
 * 모든 평가의 등급평균(진로포함 우선, 없으면 진로제외)을 평균내어 대략적인
 * 내신 등급평균을 만든다. 대학마다 반영교과가 달라 정확값은 아니므로 "대략"으로 표기.
 */
function computeGradeMeanApprox(rows: EvaluationListRow[]): number | null {
  const values: number[] = []
  for (const row of rows) {
    const snapshot = row.metricsSnapshot
    if (!snapshot) continue
    const value =
      snapshot.values.grade_mean_with_career ??
      snapshot.values.grade_mean_without_career ??
      null
    if (value != null) values.push(value)
  }
  if (values.length === 0) return null
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length
  return Math.round(mean * 100) / 100
}

export interface BuildReportViewModelInput {
  rows: EvaluationListRow[]
  studentName: string
  publication: ReportPublication | null
}

/**
 * 학생·학부모가 카드를 하나씩 보며 희망/비희망을 분류할 대상을 "순서 있는 평탄 리스트"로 만든다.
 * 추천(안정·적정·도전) → 생기부(원장문의) → 예대 → 비권장(위험·부적합) → 컷 미공개 순.
 */
export function flattenClassificationItems(
  model: StudentReportViewModel
): ReportUniversityItem[] {
  return [
    ...model.recommendedGroups.flatMap((g) => g.items),
    ...model.consultItems,
    ...model.yedaeItems,
    ...model.cautionGroups.flatMap((g) => g.items),
    ...model.unknownItems,
  ]
}

export function buildStudentReportViewModel({
  rows,
  studentName,
  publication,
}: BuildReportViewModelInput): StudentReportViewModel {
  const allItems = rows.map(toItem)

  const tierCounts: Record<VerdictTier, number> = {
    safe: 0,
    fit: 0,
    reach: 0,
    risk: 0,
    unfit: 0,
    consult: 0,
    unknown: 0,
  }
  for (const item of allItems) tierCounts[item.tier] += 1

  // 예대군은 일반대 그룹과 분리한다.
  const generalItems = allItems.filter((i) => !i.isYedae)
  const yedaeItems = sortItems(allItems.filter((i) => i.isYedae))

  const recommendedGroups = groupByTiers(generalItems, ['safe', 'fit', 'reach'])
  const cautionGroups = groupByTiers(generalItems, ['risk', 'unfit'])
  const unknownItems = sortItems(generalItems.filter((i) => i.tier === 'unknown'))
  const consultItems = sortItems(generalItems.filter((i) => i.tier === 'consult'))

  const recommendedCount = recommendedGroups.reduce(
    (sum, g) => sum + g.items.length,
    0
  )

  const computedAt =
    rows.length > 0
      ? rows.reduce<string | null>((latest, r) => {
          if (!latest) return r.computedAt
          return r.computedAt > latest ? r.computedAt : latest
        }, null)
      : null

  return {
    studentName,
    principalComment: publication?.principalComment ?? null,
    publishedAt: publication?.publishedAt ?? null,
    computedAt,
    gradeMeanApprox: computeGradeMeanApprox(rows),
    tierCounts,
    recommendedGroups,
    cautionGroups,
    unknownItems,
    consultItems,
    yedaeItems,
    gedExcludedItems: [],
    hasEstimated: allItems.some((i) => i.isEstimated),
    recommendedCount,
    totalCount: allItems.length,
  }
}

// ----- 검정고시 전용 리포트 -------------------------------------------------

/**
 * 검정고시는 학생부종합전형을 제외한 모든 전형이 사실상 "지원 가능(안정)"이다.
 * (석차 산출이 불가해 대부분의 대학이 실기 기반 비교내신/환산점수로 평가하므로
 *  내신 등급으로 컷을 비교하는 의미가 없다.)
 *
 * 따라서 DB 평가행(snapshot/evaluations) 없이 프리셋만으로
 *  - 학생부종합전형(admissionTrack에 '학생부종합' 포함) → 지원 불가 그룹
 *  - 그 외 일반대/예대 전형 → 모두 안정(safe)
 * 으로 표시하는 합성 뷰모델을 만든다. item.id는 programKey를 사용하므로
 * 공유링크 분류(university_report_university_wishes.evaluation_id)와도 호환된다.
 */
function buildPresetItem(
  program: ProgramPreset,
  tier: VerdictTier,
  opts?: { analysisMode?: ProgramAnalysisMode; tierLabel?: string }
): ReportUniversityItem {
  const university = getUniversityPreset(program.universityId)
  const cut = getCutPreset(program.key)
  const schedule = program.details?.schedule ?? null
  const practicalDate = schedule?.find((s) => s.label.includes('실기'))?.value ?? null

  return {
    id: program.key,
    universityId: program.universityId,
    universityName: university?.name ?? program.key,
    shortName: university?.shortName ?? null,
    programName: program.name,
    programTrack: program.admissionTrack,
    programYear: program.year,
    tier,
    tierLabel: opts?.tierLabel ?? VERDICT_TIER_LABELS[tier],
    analysisMode: opts?.analysisMode ?? 'always_open',
    isYedae: isYedaeUniversity(program.universityId),
    recruitCount: program.recruitCount ?? null,
    competitionRate: cut?.competitionRate ?? null,
    fillRate: cut?.fillRate ?? null,
    cutSourceYear: cut?.sourceYear ?? null,
    cutSourceType: cut?.sourceType ?? 'university_official',
    coreTrack: program.details?.coreTrack ?? null,
    isEstimated: false,
    details: program.details ?? null,
    schedule,
    practicalDate,
    gauge: null,
  }
}

/** admissionTrack에 '학생부종합'이 포함되면 학종으로 본다(검정고시 지원 불가). */
export function isHaktongProgram(admissionTrack: string): boolean {
  return admissionTrack.includes('학생부종합')
}

export interface BuildGedReportViewModelInput {
  studentName: string
  publication: ReportPublication | null
}

export function buildGedReportViewModel({
  studentName,
  publication,
}: BuildGedReportViewModelInput): StudentReportViewModel {
  const safeGeneral: ReportUniversityItem[] = []
  const safeYedae: ReportUniversityItem[] = []
  const excluded: ReportUniversityItem[] = []

  for (const { program } of listProgramsForAnalysis()) {
    if (isHaktongProgram(program.admissionTrack)) {
      excluded.push(
        buildPresetItem(program, 'unfit', { analysisMode: 'consult', tierLabel: '지원 불가' })
      )
      continue
    }
    const item = buildPresetItem(program, 'safe', { analysisMode: 'always_open' })
    if (item.isYedae) safeYedae.push(item)
    else safeGeneral.push(item)
  }

  const tierCounts: Record<VerdictTier, number> = {
    safe: 0,
    fit: 0,
    reach: 0,
    risk: 0,
    unfit: 0,
    consult: 0,
    unknown: 0,
  }
  for (const item of [...safeGeneral, ...safeYedae]) tierCounts[item.tier] += 1
  tierCounts.unfit += excluded.length

  const recommendedGroups = groupByTiers(safeGeneral, ['safe', 'fit', 'reach'])
  const recommendedCount = recommendedGroups.reduce((sum, g) => sum + g.items.length, 0)

  return {
    studentName,
    principalComment: publication?.principalComment ?? null,
    publishedAt: publication?.publishedAt ?? null,
    computedAt: null,
    gradeMeanApprox: null,
    tierCounts,
    recommendedGroups,
    cautionGroups: [],
    unknownItems: [],
    consultItems: [],
    yedaeItems: sortItems(safeYedae),
    gedExcludedItems: sortItems(excluded),
    hasEstimated: false,
    recommendedCount,
    totalCount: safeGeneral.length + safeYedae.length,
  }
}

/**
 * 검정고시 학생용 모집단위별 대표 tier 맵. (원장 미리보기의 희망대학 패널 등에서 사용)
 *  - 학생부종합전형 → 'unfit'(지원 불가)
 *  - 그 외 → 'safe'(안정)
 */
export function buildGedVerdictByProgramKey(): Record<string, VerdictTier> {
  const map: Record<string, VerdictTier> = {}
  for (const { program } of listProgramsForAnalysis()) {
    map[program.key] = isHaktongProgram(program.admissionTrack) ? 'unfit' : 'safe'
  }
  return map
}
