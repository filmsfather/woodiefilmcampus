/**
 * 산식(FormulaSpec) 템플릿 사전.
 * 대학마다 산식이 비슷한 패턴(예체능/인문/자연)을 따르므로,
 * 원장이 새 산식을 만들 때 베이스로 선택해 차이만 수정할 수 있도록 한다.
 */

import type { FormulaSpec } from '@/lib/university-policy/types'

// 학생부교과 표준 변환표 (다수 대학 공통: 1~5등급은 작은 차이, 6등급 이하 큰 차이).
const STANDARD_RANK_CONVERSION = {
  1: 1000,
  2: 990,
  3: 980,
  4: 950,
  5: 900,
  6: 800,
  7: 700,
  8: 500,
  9: 0,
} as const

const STANDARD_ACHIEVEMENT_CONVERSION = { A: 1000, B: 980, C: 900 } as const

// 진로선택 성취도 → 등급평균 환산 (대학별로 다를 수 있으나 보편적 기본값)
const STANDARD_ACHIEVEMENT_TO_RANK = { A: 1, B: 3, C: 5 } as const

export interface FormulaTemplate {
  key: string
  label: string
  description: string
  base: FormulaSpec
}

export const FORMULA_TEMPLATES: FormulaTemplate[] = [
  {
    key: 'arts_korean_english_standard',
    label: '예체능 표준 (국어·영어, 1000점, 80/20)',
    description:
      '예체능 계열에서 가장 흔한 형태. 반영교과 국어·영어, 학년별 동일, 공통/일반선택 80% + 진로선택 20%, 1000점 환산.',
    base: {
      reflectedSubjects: ['국어', '영어'],
      reflectedCourseTypes: ['공통', '일반선택', '진로선택'],
      yearWeight: { kind: 'all_equal' },
      passFailRule: 'exclude',
      rankConversion: { ...STANDARD_RANK_CONVERSION },
      achievementConversion: { ...STANDARD_ACHIEVEMENT_CONVERSION },
      achievementToRankFallback: { ...STANDARD_ACHIEVEMENT_TO_RANK },
      weights: { common: 0.8, career: 0.2 },
      totalScore: 1000,
      outputs: [
        'grade_mean_with_career',
        'grade_mean_without_career',
        'converted_score_1000',
      ],
    },
  },
  {
    key: 'humanities_4subjects',
    label: '인문계열 4과목 표준 (국·수·영·사)',
    description:
      '인문/사회계열 표준. 반영교과 국어·수학·영어·사회, 학년별 동일, 공통/일반선택 80% + 진로선택 20%.',
    base: {
      reflectedSubjects: ['국어', '수학', '영어', '사회'],
      reflectedCourseTypes: ['공통', '일반선택', '진로선택'],
      yearWeight: { kind: 'all_equal' },
      passFailRule: 'exclude',
      rankConversion: { ...STANDARD_RANK_CONVERSION },
      achievementConversion: { ...STANDARD_ACHIEVEMENT_CONVERSION },
      achievementToRankFallback: { ...STANDARD_ACHIEVEMENT_TO_RANK },
      weights: { common: 0.8, career: 0.2 },
      totalScore: 1000,
      outputs: [
        'grade_mean_with_career',
        'grade_mean_without_career',
        'converted_score_1000',
      ],
    },
  },
  {
    key: 'natural_4subjects',
    label: '자연계열 4과목 표준 (국·수·영·과)',
    description:
      '자연/이공계열 표준. 반영교과 국어·수학·영어·과학, 학년별 동일, 공통/일반선택 80% + 진로선택 20%.',
    base: {
      reflectedSubjects: ['국어', '수학', '영어', '과학'],
      reflectedCourseTypes: ['공통', '일반선택', '진로선택'],
      yearWeight: { kind: 'all_equal' },
      passFailRule: 'exclude',
      rankConversion: { ...STANDARD_RANK_CONVERSION },
      achievementConversion: { ...STANDARD_ACHIEVEMENT_CONVERSION },
      achievementToRankFallback: { ...STANDARD_ACHIEVEMENT_TO_RANK },
      weights: { common: 0.8, career: 0.2 },
      totalScore: 1000,
      outputs: [
        'grade_mean_with_career',
        'grade_mean_without_career',
        'converted_score_1000',
      ],
    },
  },
  {
    key: 'free_major_3subjects',
    label: '자유전공 3과목 표준 (국·수·영)',
    description: '자유전공학부 표준. 반영교과 국어·수학·영어.',
    base: {
      reflectedSubjects: ['국어', '수학', '영어'],
      reflectedCourseTypes: ['공통', '일반선택', '진로선택'],
      yearWeight: { kind: 'all_equal' },
      passFailRule: 'exclude',
      rankConversion: { ...STANDARD_RANK_CONVERSION },
      achievementConversion: { ...STANDARD_ACHIEVEMENT_CONVERSION },
      achievementToRankFallback: { ...STANDARD_ACHIEVEMENT_TO_RANK },
      weights: { common: 0.8, career: 0.2 },
      totalScore: 1000,
      outputs: [
        'grade_mean_with_career',
        'grade_mean_without_career',
        'converted_score_1000',
      ],
    },
  },
  {
    key: 'arts_only_grade_mean',
    label: '예체능 등급평균만 (실기 위주, 학생부 600점)',
    description:
      '학생부 비중이 낮은 실기 위주 전형. 등급평균만 산출하고 1000점 환산은 보조 지표.',
    base: {
      reflectedSubjects: ['국어', '영어'],
      reflectedCourseTypes: ['공통', '일반선택', '진로선택'],
      yearWeight: { kind: 'all_equal' },
      passFailRule: 'exclude',
      rankConversion: { ...STANDARD_RANK_CONVERSION },
      achievementConversion: { ...STANDARD_ACHIEVEMENT_CONVERSION },
      achievementToRankFallback: { ...STANDARD_ACHIEVEMENT_TO_RANK },
      weights: { common: 0.8, career: 0.2 },
      totalScore: 600,
      outputs: ['grade_mean_with_career', 'grade_mean_without_career'],
    },
  },
]

export function getFormulaTemplate(key: string): FormulaTemplate | null {
  return FORMULA_TEMPLATES.find((t) => t.key === key) ?? null
}
