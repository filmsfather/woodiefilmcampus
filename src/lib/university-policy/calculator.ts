/**
 * 학생의 정규화된 과목 데이터(university_report_courses)와 대학 산식(FormulaSpec)을
 * 받아, 비교용 metric 값들을 산출한다.
 *
 * 두 가지 진입점:
 *  - evaluateMetricsForSnapshot: metric 값만 (분석 엔진/캐시용)
 *  - evaluateMetricsWithTrace: metric + 어떻게 계산됐는지 trace (검증 UI용)
 *
 * 둘 다 같은 핵심 로직을 공유한다.
 */

import type { CourseRow } from '@/lib/university-report/data'
import type {
  CutoffMetric,
  FormulaSpec,
  StudentMetrics,
} from '@/lib/university-policy/types'

interface ReflectedCourse {
  row: CourseRow
  weight: number
  // 등급평균 산출용 환산 등급(1~9). 진로선택은 achievementToRankFallback 사용.
  gradeForMean: number | null
  // 환산점수 산출용 점수 (공통/일반선택은 rankConversion[rank], 진로선택은 achievementConversion[A/B/C])
  convertedScore: number | null
  // 가중 분모(이수단위 × 학년가중)
  denomFactor: number
}

interface ExcludedCourse {
  row: CourseRow
  reason: string
}

function getYearWeight(spec: FormulaSpec, grade: number | null): number {
  if (spec.yearWeight.kind === 'all_equal') return 1
  if (grade === 1) return spec.yearWeight.y1
  if (grade === 2) return spec.yearWeight.y2
  if (grade === 3) return spec.yearWeight.y3
  return 0
}

function isValidAchievementForRank(value: string | null | undefined): value is 'A' | 'B' | 'C' {
  return value === 'A' || value === 'B' || value === 'C'
}

interface BuildResult {
  reflected: ReflectedCourse[]
  excluded: ExcludedCourse[]
}

function buildReflected(courses: CourseRow[], spec: FormulaSpec): BuildResult {
  const subjectAreaSet = new Set<string>(spec.reflectedSubjects)
  const courseTypeSet = new Set<string>(spec.reflectedCourseTypes)

  const reflected: ReflectedCourse[] = []
  const excluded: ExcludedCourse[] = []

  for (const row of courses) {
    if (!subjectAreaSet.has(row.subjectArea)) {
      excluded.push({ row, reason: `반영교과(${spec.reflectedSubjects.join('·')}) 아님 (실제: ${row.subjectArea})` })
      continue
    }
    if (!courseTypeSet.has(row.courseType)) {
      excluded.push({ row, reason: `반영 과목구분 아님 (실제: ${row.courseType})` })
      continue
    }
    if (row.isPassFail && spec.passFailRule === 'exclude') {
      excluded.push({ row, reason: 'P/F 과목 (산식: 반영 제외)' })
      continue
    }
    const credits = row.credits ?? 0
    if (credits <= 0) {
      excluded.push({ row, reason: '이수단위 0 또는 미상' })
      continue
    }
    const yWeight = getYearWeight(spec, row.grade)
    if (yWeight <= 0) {
      excluded.push({ row, reason: `학년 가중치 0 (학년: ${row.grade ?? '미상'})` })
      continue
    }

    const denomFactor = credits * yWeight
    let gradeForMean: number | null = null
    let convertedScore: number | null = null
    const isCareerType = row.courseType === '진로선택'

    if (isCareerType) {
      if (isValidAchievementForRank(row.achievement)) {
        gradeForMean = spec.achievementToRankFallback[row.achievement]
        convertedScore = spec.achievementConversion[row.achievement]
      } else if (row.isPassFail && spec.passFailRule === 'as_full') {
        gradeForMean = 1
        convertedScore = spec.achievementConversion.A
      } else if (row.isPassFail && spec.passFailRule === 'as_zero') {
        gradeForMean = 9
        convertedScore = 0
      }
    } else {
      const rank = row.rank
      if (rank !== null && rank >= 1 && rank <= 9) {
        gradeForMean = rank
        const key = rank as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9
        convertedScore = spec.rankConversion[key]
      } else if (row.isPassFail && spec.passFailRule === 'as_full') {
        gradeForMean = 1
        convertedScore = spec.rankConversion[1]
      } else if (row.isPassFail && spec.passFailRule === 'as_zero') {
        gradeForMean = 9
        convertedScore = spec.rankConversion[9]
      }
    }

    if (gradeForMean === null && convertedScore === null) {
      excluded.push({ row, reason: '등급/성취도 정보가 없어 환산 불가' })
      continue
    }

    reflected.push({ row, weight: denomFactor, gradeForMean, convertedScore, denomFactor })
  }

  return { reflected, excluded }
}

function weightedSum(
  rows: ReflectedCourse[],
  pick: (r: ReflectedCourse) => number | null
): { numerator: number; denominator: number; value: number | null } {
  let num = 0
  let den = 0
  for (const r of rows) {
    const v = pick(r)
    if (v === null) continue
    num += v * r.denomFactor
    den += r.denomFactor
  }
  if (den <= 0) return { numerator: 0, denominator: 0, value: null }
  return { numerator: num, denominator: den, value: num / den }
}

function round(value: number | null, decimals: number): number | null {
  if (value === null) return null
  const factor = Math.pow(10, decimals)
  return Math.round(value * factor) / factor
}

// ---------- 결과 타입 ----------

export interface CalculationTrace {
  spec: FormulaSpec
  reflectedCourses: Array<{
    courseId: string
    grade: number | null
    semester: number | null
    rawSubjectName: string
    subjectArea: string
    courseType: string
    credits: number
    yearWeight: number
    weightFactor: number
    rank: number | null
    achievement: string | null
    gradeForMean: number | null
    convertedScore: number | null
  }>
  excludedCourses: Array<{
    courseId: string
    rawSubjectName: string
    grade: number | null
    semester: number | null
    subjectArea: string
    courseType: string
    reason: string
  }>
  metricBreakdown: Partial<
    Record<
      CutoffMetric,
      {
        numerator: number
        denominator: number
        value: number | null
        formula: string
      }
    >
  >
}

export interface CalculationResult {
  metrics: StudentMetrics
  trace: CalculationTrace
}

/**
 * trace까지 함께 반환. 검증 UI/디버깅에 사용.
 */
export function evaluateMetricsWithTrace(
  courses: CourseRow[],
  spec: FormulaSpec
): CalculationResult {
  const { reflected, excluded } = buildReflected(courses, spec)
  const warnings: string[] = []

  if (reflected.length === 0) {
    warnings.push(
      '반영교과 기준에 부합하는 과목을 찾지 못했습니다. 성적이 부족하거나 반영 영역이 다를 수 있습니다.'
    )
  }

  const commonRows = reflected.filter((r) => r.row.courseType !== '진로선택')
  const careerRows = reflected.filter((r) => r.row.courseType === '진로선택')

  const wantedOutputs = new Set<CutoffMetric>(spec.outputs)
  const values: Partial<Record<CutoffMetric, number | null>> = {}
  const breakdown: CalculationTrace['metricBreakdown'] = {}

  if (wantedOutputs.has('grade_mean_with_career')) {
    const r = weightedSum(reflected, (x) => x.gradeForMean)
    values.grade_mean_with_career = round(r.value, 2)
    breakdown.grade_mean_with_career = {
      numerator: round(r.numerator, 2)!,
      denominator: round(r.denominator, 2)!,
      value: round(r.value, 2),
      formula: `Σ(등급 × 이수단위 × 학년가중) / Σ(이수단위 × 학년가중) (진로선택 포함)`,
    }
  }

  if (wantedOutputs.has('grade_mean_without_career')) {
    const r = weightedSum(commonRows, (x) => x.gradeForMean)
    values.grade_mean_without_career = round(r.value, 2)
    breakdown.grade_mean_without_career = {
      numerator: round(r.numerator, 2)!,
      denominator: round(r.denominator, 2)!,
      value: round(r.value, 2),
      formula: `Σ(등급 × 이수단위 × 학년가중) / Σ(이수단위 × 학년가중) (공통/일반선택만)`,
    }
  }

  if (wantedOutputs.has('converted_score_1000')) {
    const cm = weightedSum(commonRows, (x) => x.convertedScore)
    const cr = weightedSum(careerRows, (x) => x.convertedScore)
    let converted: number | null = null
    let formulaText = ''

    if (cm.value !== null && cr.value !== null) {
      converted =
        cm.value * (spec.totalScore / 1000) * spec.weights.common +
        cr.value * (spec.totalScore / 1000) * spec.weights.career
      formulaText = `(공통/일반평균 × ${spec.weights.common} + 진로평균 × ${spec.weights.career}) × (${spec.totalScore}/1000)`
    } else if (cm.value !== null) {
      converted = cm.value * (spec.totalScore / 1000)
      formulaText = `공통/일반평균 × (${spec.totalScore}/1000) (진로선택 없어 단독 환산)`
      warnings.push('진로선택 과목이 없어 공통/일반선택만으로 환산점수를 산출했습니다.')
    } else if (cr.value !== null) {
      converted = cr.value * (spec.totalScore / 1000)
      formulaText = `진로평균 × (${spec.totalScore}/1000) (공통/일반선택 없어 단독 환산)`
      warnings.push('공통/일반선택 과목이 없어 진로선택만으로 환산점수를 산출했습니다.')
    }

    values.converted_score_1000 = round(converted, 2)
    breakdown.converted_score_1000 = {
      numerator: round(cm.numerator + cr.numerator, 2) ?? 0,
      denominator: round(cm.denominator + cr.denominator, 2) ?? 0,
      value: round(converted, 2),
      formula: formulaText || '환산 불가',
    }
  }

  const metrics: StudentMetrics = {
    values,
    warnings,
    usedCourseCount: reflected.length,
  }

  const trace: CalculationTrace = {
    spec,
    reflectedCourses: reflected.map((r) => ({
      courseId: r.row.id,
      grade: r.row.grade,
      semester: r.row.semester,
      rawSubjectName: r.row.rawSubjectName,
      subjectArea: r.row.subjectArea,
      courseType: r.row.courseType,
      credits: r.row.credits ?? 0,
      yearWeight: getYearWeight(spec, r.row.grade),
      weightFactor: r.weight,
      rank: r.row.rank,
      achievement: r.row.achievement,
      gradeForMean: r.gradeForMean,
      convertedScore: r.convertedScore,
    })),
    excludedCourses: excluded.map((e) => ({
      courseId: e.row.id,
      rawSubjectName: e.row.rawSubjectName,
      grade: e.row.grade,
      semester: e.row.semester,
      subjectArea: e.row.subjectArea,
      courseType: e.row.courseType,
      reason: e.reason,
    })),
    metricBreakdown: breakdown,
  }

  return { metrics, trace }
}

/**
 * 분석 엔진/캐시용. metric만 필요할 때.
 */
export function evaluateMetricsForSnapshot(
  courses: CourseRow[],
  spec: FormulaSpec
): StudentMetrics {
  return evaluateMetricsWithTrace(courses, spec).metrics
}
