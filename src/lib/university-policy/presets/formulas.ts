/**
 * 모집단위별 산식 프리셋. programKey → FormulaPreset.
 *
 * 산식이 없는 모집단위는 프리셋에서 제외하면 됩니다(분석 시 자동 skip).
 * version은 산식 spec을 변경할 때마다 +1 하세요. 캐시가 자동 무효화됩니다.
 *
 * 작성 시 reference: src/lib/university-policy/templates.ts
 */

import { FORMULA_TEMPLATES } from '@/lib/university-policy/templates'
import type { FormulaSpec } from '@/lib/university-policy/types'

export interface FormulaPreset {
  key: string // = programKey (1 모집단위 = 1 활성 산식)
  version: number
  templateKey?: string
  spec: FormulaSpec
  sourceNote?: string // 어느 자료를 보고 입력했는지
  isDraft?: boolean // 미검증 상태(분석 결과 표에 경고 배지)
}

const ARTS_KOREAN_ENGLISH = FORMULA_TEMPLATES.find(
  (t) => t.key === 'arts_korean_english_standard'
)!.base

export const FORMULA_PRESETS: Readonly<Record<string, FormulaPreset>> = {
  // ───────────── 세종대 영화예술-연출제작 (reference) ─────────────
  'sejong-2026-silgi-film-direction': {
    key: 'sejong-2026-silgi-film-direction',
    version: 1,
    templateKey: 'arts_korean_english_standard',
    spec: { ...ARTS_KOREAN_ENGLISH },
    sourceNote: '예체능 표준 템플릿 가정값. 실제 모집요강과 대조 필요.',
    isDraft: true,
  },

  // ───────────── 서경대 영화영상학과 (reference) ─────────────
  'seokyeong-2026-silgi-film': {
    key: 'seokyeong-2026-silgi-film',
    version: 1,
    templateKey: 'arts_korean_english_standard',
    spec: { ...ARTS_KOREAN_ENGLISH },
    sourceNote: '예체능 표준 템플릿 가정값. 실제 모집요강과 대조 필요.',
    isDraft: true,
  },

  // ───────────── 한예종 영상원 영화과 일반전형 (2027) ─────────────
  // 한예종은 표준 템플릿과 산식이 달라 spec을 직접 작성한다.
  //  - 반영교과: 전 교과목(이수단위 합 가중) — 학생 측 등급평균 산출에 가까운 모델
  //  - 학년별 반영비율: 1학년 20%, 2학년 40%, 3학년 40%
  //  - 실제 환산: 9→1점 역등급 합산 후 32분위 → 22.5~100점 매핑 (요강 p.74)
  //  - 본 시스템은 등급평균(grade_mean_with_career)을 산출하여 내부 컷과 비교
  'karts-2027-ilban-film': {
    key: 'karts-2027-ilban-film',
    version: 1,
    spec: {
      reflectedSubjects: [
        '국어',
        '수학',
        '영어',
        '한국사',
        '사회',
        '과학',
        '체육',
        '예술',
        '기술가정',
        '제2외국어',
        '한문',
        '전문교과',
        '기타',
      ],
      reflectedCourseTypes: [
        '공통',
        '일반선택',
        '진로선택',
        '융합선택',
        '전문교과I',
        '전문교과II',
        '체육·예술',
        '기타',
      ],
      yearWeight: { kind: 'per_grade', y1: 20, y2: 40, y3: 40 },
      passFailRule: 'exclude',
      rankConversion: {
        1: 1000,
        2: 990,
        3: 980,
        4: 950,
        5: 900,
        6: 800,
        7: 700,
        8: 500,
        9: 0,
      },
      achievementConversion: { A: 1000, B: 980, C: 900 },
      achievementToRankFallback: { A: 1, B: 3, C: 5 },
      weights: { common: 0.8, career: 0.2 },
      totalScore: 100,
      outputs: ['grade_mean_with_career', 'grade_mean_without_career'],
      notes:
        '한예종 영화과 일반전형(11월입시) 가늠용 추정 산식. 실제 한예종 환산은 9→1점 역등급 합산 + 32분위 매핑(요강 p.74)으로 본 시스템과 다름. ' +
        '학생 적합성 가늠을 위해 전 교과목·전 학년 등급평균을 산출하여 내부 컷(3.5/4.5)과 비교.',
    },
    sourceNote: '2027학년도 한예종 예술사과정 모집요강 p.32(영화과), p.73~74(학교생활기록부 반영).',
    isDraft: true,
  },
}

export function getFormulaPreset(programKey: string): FormulaPreset | null {
  return FORMULA_PRESETS[programKey] ?? null
}
