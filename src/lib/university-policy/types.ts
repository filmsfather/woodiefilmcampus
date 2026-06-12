/**
 * 대학 입시 정책(반영 산식·컷)과 학생 평가 결과 도메인 타입.
 * 102_university_admission_policies.sql 의 테이블과 1:1 매핑되는 표현입니다.
 */

import type {
  Achievement,
  CourseType,
  SubjectArea,
} from '@/lib/university-report/types'

// 컷이 표현되는 단위. 학생 측 산출도 동일 단위로 맞춰서 비교한다.
export type CutoffMetric =
  | 'grade_mean_with_career'
  | 'grade_mean_without_career'
  | 'converted_score_1000'
  | 'practical_score'
  | 'total_score'

export const CUTOFF_METRICS: readonly CutoffMetric[] = [
  'grade_mean_with_career',
  'grade_mean_without_career',
  'converted_score_1000',
  'practical_score',
  'total_score',
] as const

// metric별 사용자 친화 라벨.
export const CUTOFF_METRIC_LABELS: Record<CutoffMetric, string> = {
  grade_mean_with_career: '등급평균(진로포함)',
  grade_mean_without_career: '등급평균(진로제외)',
  converted_score_1000: '환산점수(1000점)',
  practical_score: '실기 원점수',
  total_score: '총점',
}

// metric별 "작을수록 좋은가" 매핑. 등급은 작을수록, 점수는 클수록 좋다.
export const CUTOFF_METRIC_LOWER_IS_BETTER: Record<CutoffMetric, boolean> = {
  grade_mean_with_career: true,
  grade_mean_without_career: true,
  converted_score_1000: false,
  practical_score: false,
  total_score: false,
}

export type PointKind = 'best' | 'mean' | 'percentile' | 'worst' | 'stage' | 'custom'

export const POINT_KINDS: readonly PointKind[] = [
  'best',
  'mean',
  'percentile',
  'worst',
  'stage',
  'custom',
] as const

export type ConfidenceLevel = 'high' | 'medium' | 'low'

export const CONFIDENCE_LEVELS: readonly ConfidenceLevel[] = ['high', 'medium', 'low']

export type CutSourceType =
  | 'university_official'
  | 'estimated_by_staff'
  | 'community'
  | 'inferred_prev_year'

export const CUT_SOURCE_TYPES: readonly CutSourceType[] = [
  'university_official',
  'estimated_by_staff',
  'community',
  'inferred_prev_year',
]

export const CUT_SOURCE_LABELS: Record<CutSourceType, string> = {
  university_official: '대학 공식',
  estimated_by_staff: '원장 추정',
  community: '커뮤니티 자료',
  inferred_prev_year: '전년도 자료 차용',
}

// 산식 스펙. 대학마다 달라서 코드에 박지 않고 데이터로 표현한다.
export interface FormulaSpec {
  // 반영 교과 (예체능: ['국어','영어'])
  reflectedSubjects: SubjectArea[]
  // 반영 과목 구분 (보통 ['공통','일반선택','진로선택'])
  reflectedCourseTypes: CourseType[]
  // 학년별 반영비율. all_equal면 모든 학년 동일 가중치 1.
  yearWeight:
    | { kind: 'all_equal' }
    | { kind: 'per_grade'; y1: number; y2: number; y3: number }
  // P/F 과목 처리 방식
  passFailRule: 'exclude' | 'as_full' | 'as_zero'
  // 석차등급(1~9)별 환산점수. 보통 1000점 척도.
  rankConversion: Record<1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9, number>
  // 진로선택 성취도(A/B/C)별 환산점수
  achievementConversion: { A: number; B: number; C: number }
  // 등급평균 산출용 진로선택 → 등급 변환표 (예: A=1, B=3, C=5)
  achievementToRankFallback: { A: number; B: number; C: number }
  // 공통/일반선택 vs 진로선택 가중치 (합이 1)
  weights: { common: number; career: number }
  // 학생부교과 반영총점 (대학마다 다름: 600/900/1000 등)
  totalScore: number
  // 영역 그룹별 상위 N과목만 반영 (예: 경성대 — 국·수·영·탐구·기타 각 2과목, 총 10과목).
  // 정의 시, 그룹별로 등급이 좋은 상위 topK 과목만 남기고 나머지는 반영에서 제외한다.
  // 미정의 시 반영 교과 전체를 사용(기존 동작).
  subjectGroupTopK?: SubjectGroupTopK[]
  // subjectGroupTopK 그룹 선택 후, 남은 과목 전체에서 다시 등급이 좋은 상위 N과목만 남긴다.
  // (예: 동서대 — 영역별 최대 3 + 진로 최대 2 선별 후 전체 상위 10과목 / 성결대·대진대·평택대 — 영역 상한 후 전체 상한)
  overallTopK?: number
  // subjectGroupTopK 그룹들 중 평균 등급이 좋은 상위 M개 그룹만 반영한다.
  // (예: 수원대 — 국·수·영·탐구 각 상위 5과목 중 가장 좋은 2개 교과영역만)
  topGroups?: number
  // 학년별 등급이 좋은 상위 N과목만 반영한다(subjectGroupTopK와 배타적으로 사용).
  // (예: 용인대 — 학년별 상위 3과목 × 3학년 = 9과목)
  perYearTopK?: number
  // 이수단위 가중 방식. 'equal'이면 이수단위를 무시하고 과목 단위 단순평균(이수단위 미적용 대학).
  // 미지정(또는 'by_credit')이면 기존대로 이수단위 가중.
  creditWeighting?: 'by_credit' | 'equal'
  // 교과영역별 가중치(합이 1이 아니어도 됨, 내부에서 정규화).
  // 정의 시 등급평균을 "영역별 이수단위 가중평균 → 영역 가중치로 가중합"으로 산출한다.
  // (예: 숭실대 — 국 35 / 수 15 / 영 35 / 사(한국사 포함) 15)
  subjectAreaWeights?: Partial<Record<SubjectArea, number>>
  // 이 산식이 산출하는 지표 (UI에서 어느 컬럼을 보여줄지에도 사용)
  outputs: CutoffMetric[]
  // 임의 메모
  notes?: string | null
}

// 영역 그룹별 상위 N과목 반영 규칙.
export interface SubjectGroupTopK {
  // 표시·디버깅용 라벨 (예: '탐구(한국사 포함)')
  label?: string
  // 이 그룹에 묶이는 반영 교과들 (예: ['사회','과학','한국사'])
  subjects: SubjectArea[]
  // 이 그룹에 한정할 과목구분. 미지정 시 모든 반영 과목구분을 포함.
  // (예: 경성대 — 국·수·영·탐구 그룹은 ['공통','일반선택'], 진로선택 슬롯은 ['진로선택'])
  courseTypes?: CourseType[]
  // 등급이 좋은 순으로 남길 과목 수
  topK: number
}

// 컷 1개 점.
export interface CutPoint {
  metric: CutoffMetric
  label: string
  percentile: number | null
  pointKind: PointKind
  value: number
  confidence: ConfidenceLevel
  isEstimated: boolean
}

// 모집단위 1개의 컷 묶음 (메타 + 점들).
export interface CutBundle {
  id: string
  programId: string
  version: number
  sourceYear: number
  sourceType: CutSourceType
  sourceUrl: string | null
  applicants: number | null
  registered: number | null
  competitionRate: number | null
  lastAdmitNo: number | null
  fillRate: number | null
  notes: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
  points: CutPoint[]
}

export interface FormulaRecord {
  id: string
  programId: string
  version: number
  templateKey: string | null
  spec: FormulaSpec
  effectiveFrom: string | null
  notes: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface UniversityRecord {
  id: string
  name: string
  shortName: string | null
  region: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface UniversityProgramRecord {
  id: string
  universityId: string
  year: number
  admissionTrack: string
  name: string
  trackCode: string | null
  recruitCount: number | null
  totalScore: number | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

// 학생 metric 산출 결과 (캐시).
export interface StudentMetrics {
  // metric → 값. 산출 불가면 null.
  values: Partial<Record<CutoffMetric, number | null>>
  // 진단·경고 (반영교과 부족 등)
  warnings: string[]
  // 산출에 실제 사용된 과목 수 (디버깅·UI 보조)
  usedCourseCount: number
}

// verdict 단계.
export type VerdictTier =
  | 'safe' // 안정
  | 'fit' // 적정
  | 'reach' // 도전
  | 'risk' // 위험
  | 'unfit' // 부적합
  | 'consult' // 원장 문의 (정성평가 등 산식으로 판정 불가)
  | 'unknown' // 비교 불가

export const VERDICT_TIER_LABELS: Record<VerdictTier, string> = {
  safe: '안정',
  fit: '적정',
  reach: '도전',
  risk: '위험',
  unfit: '부적합',
  consult: '원장 문의',
  unknown: '판정 불가',
}

export interface MetricVerdict {
  metric: CutoffMetric
  tier: VerdictTier
  studentValue: number | null
  // 학생 점수가 어느 두 컷 라벨 사이에 있는지(있으면)
  betweenLabels: [string | null, string | null]
  // 비교에 쓰인 컷 점들(라벨/값) - UI 노출용
  cutPoints: CutPoint[]
  // 컷이 모두 추정/저신뢰면 true
  isEstimatedBased: boolean
}

// 평가 결과 전체 (snapshot × program × cut)
export interface EvaluationResult {
  programId: string
  formulaId: string
  cutId: string
  formulaVersion: number
  cutVersion: number
  metricsSnapshot: StudentMetrics
  verdicts: MetricVerdict[]
  warnings: string[]
  computedAt: string
}
