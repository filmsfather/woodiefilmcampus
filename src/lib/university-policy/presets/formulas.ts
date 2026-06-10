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

const ARTS_ONLY_GRADE_MEAN = FORMULA_TEMPLATES.find(
  (t) => t.key === 'arts_only_grade_mean'
)!.base

// 진로선택 미반영(공통/일반선택만) 헬퍼.
const NO_CAREER_WEIGHTS = { common: 1, career: 0 } as const

// 산식이 적용되지 않는 모집단위(전형) 메모용.
//  - 실기 100% 학교: 평택대 PTU실기, 목원대 실기전형
//  - 학종/학교장추천: 동국대, 경희대, 상명대 학종, 한예종 외국어/특기자
//  - 한예종 일반전형은 별도 산식 작성됨

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

  // ───────────── 중앙대 — 영화전공(실기형) 2027 ─────────────
  // 국·수·영·사회 교과 전 과목, 진로선택 미반영, 학년별 가중치 없음. 등급별 점수표(10/9.6...).
  'chungang-2027-silgi-film': {
    key: 'chungang-2027-silgi-film',
    version: 1,
    spec: {
      reflectedSubjects: ['국어', '수학', '영어', '사회'],
      reflectedCourseTypes: ['공통', '일반선택'],
      yearWeight: { kind: 'all_equal' },
      passFailRule: 'exclude',
      rankConversion: {
        1: 1000,
        2: 960,
        3: 920,
        4: 880,
        5: 820,
        6: 760,
        7: 700,
        8: 600,
        9: 300,
      },
      achievementConversion: { A: 1000, B: 920, C: 820 },
      achievementToRankFallback: { A: 1, B: 3, C: 5 },
      weights: { ...NO_CAREER_WEIGHTS },
      totalScore: 150,
      outputs: ['grade_mean_with_career', 'converted_score_1000'],
      notes:
        '교과 영역 점수 = 환산점수 평균 × 15%(150점 만점). 출결 5%(50점) 별도. 실기 800점. ' +
        '진로선택 미반영. 학년·교과별 가중치 없음.',
    },
    sourceNote: '2027학년도 중앙대 수시 모집요강(실기형 등급별 환산점수).',
    isDraft: true,
  },

  // ───────────── 동국대 — 학교장추천(학생부교과) 2027 ─────────────
  // 국·수·사·영·한국사 석차등급 상위 10과목, 이수단위 미적용, 학년 가중치 없음.
  'dongguk-2027-hakjong-chuchon-film': {
    key: 'dongguk-2027-hakjong-chuchon-film',
    version: 1,
    spec: {
      reflectedSubjects: ['국어', '수학', '사회', '영어', '한국사'],
      reflectedCourseTypes: ['공통', '일반선택'],
      yearWeight: { kind: 'all_equal' },
      passFailRule: 'exclude',
      rankConversion: {
        1: 1000,
        2: 999,
        3: 995,
        4: 990,
        5: 900,
        6: 800,
        7: 500,
        8: 300,
        9: 0,
      },
      achievementConversion: { A: 1000, B: 995, C: 900 },
      achievementToRankFallback: { A: 1, B: 3, C: 5 },
      weights: { ...NO_CAREER_WEIGHTS },
      totalScore: 700,
      outputs: ['grade_mean_with_career', 'converted_score_1000'],
      notes:
        '학교장추천 인문계열 산식. 석차등급 상위 10과목 단순평균 → 700점 환산. ' +
        '이수단위·학년·교과별 가중치 모두 미적용. 학종 Do Dream/기회균형은 정성평가라 산식 없음.',
    },
    sourceNote: '2027학년도 동국대 수시 모집요강(학교장추천인재 인문계열 산출표).',
    isDraft: true,
  },

  // ───────────── 세종대 — 영화예술(연출제작) 실기우수자 2027 ─────────────
  // 예체능 표준(국·영, 80/20, 1000점) + 학년·이수단위 사용.
  'sejong-2027-silgi-film-direction': {
    key: 'sejong-2027-silgi-film-direction',
    version: 1,
    templateKey: 'arts_korean_english_standard',
    spec: { ...ARTS_KOREAN_ENGLISH },
    sourceNote: '2027학년도 세종대 수시 모집요강(예체능 학생부 반영방법).',
    isDraft: true,
  },

  // ───────────── 숭실대 — 영화예술전공(연출) 예체능우수인재 2027 ─────────────
  // 국 35% / 수 15% / 영 35% / 사(한국사 포함) 15%, 진로선택 미반영, 학년 가중치 없음.
  'soongsil-2027-yechaeneung-film-direction': {
    key: 'soongsil-2027-yechaeneung-film-direction',
    version: 1,
    spec: {
      reflectedSubjects: ['국어', '수학', '영어', '사회', '한국사'],
      reflectedCourseTypes: ['공통', '일반선택'],
      yearWeight: { kind: 'all_equal' },
      passFailRule: 'exclude',
      rankConversion: {
        1: 1000,
        2: 950,
        3: 900,
        4: 850,
        5: 800,
        6: 700,
        7: 500,
        8: 300,
        9: 0,
      },
      achievementConversion: { A: 1000, B: 900, C: 800 },
      achievementToRankFallback: { A: 1, B: 3, C: 5 },
      weights: { ...NO_CAREER_WEIGHTS },
      totalScore: 100,
      outputs: ['grade_mean_with_career', 'converted_score_1000'],
      notes:
        '숭실대 교과 산식은 영역별 가중치(국 35 / 수 15 / 영 35 / 사 15)를 사용하지만 ' +
        '본 시스템에서는 동일가중 등급평균으로 근사. 1단계 학생부 40%, 2단계 실기 100%.',
    },
    sourceNote: '2027학년도 숭실대 수시 모집요강(예체능우수인재 연출 트랙).',
    isDraft: true,
  },

  // ───────────── 국민대 — 영화전공 실기우수자 2027 ─────────────
  // 예체능계: 국·영 공통/일반선택 85% + 예술/체육(진로선택) 상위 3 15%.
  'kookmin-2027-silgi-film': {
    key: 'kookmin-2027-silgi-film',
    version: 1,
    spec: {
      reflectedSubjects: ['국어', '영어', '예술', '체육'],
      reflectedCourseTypes: ['공통', '일반선택', '진로선택'],
      yearWeight: { kind: 'all_equal' },
      passFailRule: 'exclude',
      rankConversion: {
        1: 1000,
        2: 990,
        3: 980,
        4: 950,
        5: 900,
        6: 700,
        7: 500,
        8: 300,
        9: 0,
      },
      achievementConversion: { A: 1000, B: 980, C: 900 },
      achievementToRankFallback: { A: 1, B: 3, C: 5 },
      weights: { common: 0.85, career: 0.15 },
      totalScore: 1000,
      outputs: ['grade_mean_with_career', 'converted_score_1000'],
      notes:
        '국·영 공통/일반선택(석차등급) 85% + 예술/체육 진로선택 상위 3과목(성취도) 15%. ' +
        '1단계 학생부 70%(700점) + 실기 30%, 2단계 1단계 70% + 면접 30%.',
    },
    sourceNote: '2027학년도 국민대 수시 모집요강(예체능 영화 실기우수자 산식).',
    isDraft: true,
  },

  // ───────────── 서경대 — 영화영상학과 실기우수자 2027 ─────────────
  // 국·영·수·한국사 각 상위 3과목(각 25%), 공통/일반선택만 반영.
  'seokyeong-2027-silgi-film': {
    key: 'seokyeong-2027-silgi-film',
    version: 1,
    spec: {
      reflectedSubjects: ['국어', '영어', '수학', '한국사'],
      reflectedCourseTypes: ['공통', '일반선택'],
      yearWeight: { kind: 'all_equal' },
      passFailRule: 'exclude',
      rankConversion: {
        1: 1000,
        2: 990,
        3: 980,
        4: 970,
        5: 960,
        6: 950,
        7: 900,
        8: 800,
        9: 600,
      },
      achievementConversion: { A: 1000, B: 980, C: 900 },
      achievementToRankFallback: { A: 1, B: 3, C: 5 },
      weights: { ...NO_CAREER_WEIGHTS },
      totalScore: 1000,
      outputs: ['grade_mean_with_career', 'converted_score_1000'],
      notes:
        '국·영·수·한국사 각 상위 3과목(각 25%) 석차등급 가중합. 1단계 100%, 2단계 20% 반영.',
    },
    sourceNote: '2027학년도 서경대 수시 모집요강(실기우수자 등급별 점수표).',
    isDraft: true,
  },

  // ───────────── 단국대 — 영화전공 실기우수자 2027 ─────────────
  // 예능·체육 계열: 국·영·사(한국사 포함). 진로선택 성취도 → 등급변환.
  'dankook-2027-silgi-film': {
    key: 'dankook-2027-silgi-film',
    version: 1,
    spec: {
      reflectedSubjects: ['국어', '영어', '사회', '한국사'],
      reflectedCourseTypes: ['공통', '일반선택', '진로선택'],
      yearWeight: { kind: 'all_equal' },
      passFailRule: 'exclude',
      rankConversion: {
        1: 1000,
        2: 990,
        3: 980,
        4: 970,
        5: 960,
        6: 950,
        7: 700,
        8: 400,
        9: 0,
      },
      achievementConversion: { A: 1000, B: 980, C: 960 },
      achievementToRankFallback: { A: 1, B: 3, C: 5 },
      weights: { common: 0.8, career: 0.2 },
      totalScore: 150,
      outputs: ['grade_mean_with_career', 'converted_score_1000'],
      notes:
        '예능·체육 계열 산식. 교과 15%(150점 만점) + 출결 5%(50점) 별도. 실기 80%, 면접 30%(2단계).',
    },
    sourceNote: '2027학년도 단국대 수시 모집요강(예능·체육 학생부 반영).',
    isDraft: true,
  },

  // ───────────── 중부대 — 연극영화학(연출/제작/기획) 2027 ─────────────
  // 국·영·수·사(한국사 포함)·과 중 상위 10과목 평균(진로선택 환산 A=2/B=4/C=6).
  'joongbu-2027-silgi-film-direction': {
    key: 'joongbu-2027-silgi-film-direction',
    version: 1,
    spec: {
      reflectedSubjects: ['국어', '영어', '수학', '사회', '한국사', '과학'],
      reflectedCourseTypes: ['공통', '일반선택', '진로선택'],
      yearWeight: { kind: 'all_equal' },
      passFailRule: 'exclude',
      rankConversion: {
        1: 1000,
        2: 975,
        3: 950,
        4: 925,
        5: 900,
        6: 875,
        7: 850,
        8: 800,
        9: 600,
      },
      achievementConversion: { A: 975, B: 925, C: 875 },
      achievementToRankFallback: { A: 2, B: 4, C: 6 },
      weights: { common: 0.8, career: 0.2 },
      totalScore: 200,
      outputs: ['grade_mean_with_career', 'converted_score_1000'],
      notes:
        '평균등급 → 16단계 표 환산(200~120점). 본 시스템은 등급평균으로 근사 비교. 실기 80%, 교과 20%.',
    },
    sourceNote: '2027학년도 중부대 수시 모집요강(실기우수자 교과 환산표).',
    isDraft: true,
  },

  // ───────────── 수원대 — 아트앤엔터테인먼트(영화예술) 2027 ─────────────
  // 예체능: 국·수·영·사(또는 과) 중 상위 2개 영역만, 각 상위 5과목, 진로선택 미반영.
  'suwon-2027-silgi-film': {
    key: 'suwon-2027-silgi-film',
    version: 1,
    spec: {
      reflectedSubjects: ['국어', '수학', '영어', '사회', '과학'],
      reflectedCourseTypes: ['공통', '일반선택'],
      yearWeight: { kind: 'all_equal' },
      passFailRule: 'exclude',
      rankConversion: {
        1: 1000,
        2: 980,
        3: 960,
        4: 940,
        5: 920,
        6: 880,
        7: 780,
        8: 680,
        9: 500,
      },
      achievementConversion: { A: 1000, B: 960, C: 920 },
      achievementToRankFallback: { A: 1, B: 3, C: 5 },
      weights: { ...NO_CAREER_WEIGHTS },
      totalScore: 300,
      outputs: ['grade_mean_with_career', 'converted_score_1000'],
      notes:
        '실제는 상위 2개 교과영역만 사용(영역별 상위 5과목). 본 시스템은 5개 교과 전체 평균으로 근사. ' +
        '명목 30%(300/150점) + 실기 70%(실질 17.6 / 82.4%).',
    },
    sourceNote: '2027학년도 수원대 수시 모집요강(예체능 실기우수자 등급점수표).',
    isDraft: true,
  },

  // ───────────── 용인대 — 영화영상학과 일반학생 2027 ─────────────
  // 예체능: 국·영·수·사(역사/도덕)·과 중 학년별 서로 다른 교과 상위 3과목 = 총 9과목 평균.
  // 1·2·3학년 각 100%.
  'yongin-2027-silgi-film-general': {
    key: 'yongin-2027-silgi-film-general',
    version: 1,
    spec: {
      reflectedSubjects: ['국어', '영어', '수학', '사회', '한국사', '과학'],
      reflectedCourseTypes: ['공통', '일반선택', '진로선택'],
      yearWeight: { kind: 'all_equal' },
      passFailRule: 'exclude',
      rankConversion: {
        1: 150,
        2: 145,
        3: 140,
        4: 135,
        5: 125,
        6: 110,
        7: 90,
        8: 60,
        9: 0,
      },
      achievementConversion: { A: 150, B: 140, C: 125 },
      achievementToRankFallback: { A: 1, B: 3, C: 5 },
      weights: { common: 0.8, career: 0.2 },
      totalScore: 150,
      outputs: ['grade_mean_with_career', 'converted_score_1000'],
      notes:
        '실기학과 30% 반영 등급점수(1등급 150 ~ 9등급 0). 학년별 3과목 × 3학년 = 9과목 평균. ' +
        '본 시스템은 단순 등급평균으로 근사. 실기 70%(350/500점).',
    },
    sourceNote: '2027학년도 용인대 수시 모집요강(실기학과 등급별 반영점수).',
    isDraft: true,
  },
  'yongin-2027-silgi-film-opportunity': {
    key: 'yongin-2027-silgi-film-opportunity',
    version: 1,
    spec: {
      reflectedSubjects: ['국어', '영어', '수학', '사회', '한국사', '과학'],
      reflectedCourseTypes: ['공통', '일반선택', '진로선택'],
      yearWeight: { kind: 'all_equal' },
      passFailRule: 'exclude',
      rankConversion: {
        1: 150,
        2: 145,
        3: 140,
        4: 135,
        5: 125,
        6: 110,
        7: 90,
        8: 60,
        9: 0,
      },
      achievementConversion: { A: 150, B: 140, C: 125 },
      achievementToRankFallback: { A: 1, B: 3, C: 5 },
      weights: { common: 0.8, career: 0.2 },
      totalScore: 150,
      outputs: ['grade_mean_with_career', 'converted_score_1000'],
      notes: '용인대 일반학생과 동일 산식(기회균형 특별전형).',
    },
    sourceNote: '2027학년도 용인대 수시 모집요강.',
    isDraft: true,
  },

  // ───────────── 대진대 — 영화영상학과 실기우수자 2026 ─────────────
  // 국·영·수·사(역사/도덕)·한국사·과 중 상위 15과목(진로선택 최대 5, A=1·B=2·C=4).
  'daejin-2026-silgi-film': {
    key: 'daejin-2026-silgi-film',
    version: 1,
    spec: {
      reflectedSubjects: ['국어', '영어', '수학', '사회', '한국사', '과학'],
      reflectedCourseTypes: ['공통', '일반선택', '진로선택'],
      yearWeight: { kind: 'all_equal' },
      passFailRule: 'exclude',
      rankConversion: {
        1: 1000,
        2: 980,
        3: 960,
        4: 940,
        5: 900,
        6: 850,
        7: 750,
        8: 600,
        9: 300,
      },
      achievementConversion: { A: 1000, B: 980, C: 940 },
      achievementToRankFallback: { A: 1, B: 2, C: 4 },
      weights: { common: 0.8, career: 0.2 },
      totalScore: 200,
      outputs: ['grade_mean_with_career', 'converted_score_1000'],
      notes:
        '실기우수자 20%(200점) 반영. 등급평균 → 30단계 환산표 적용(원문). 본 시스템은 단순 등급평균으로 근사. ' +
        '2026학년도 기준이므로 2027 발표 시 갱신 필요.',
    },
    sourceNote: '2026학년도 대진대 수시 모집요강(실기우수자 등급평균 환산).',
    isDraft: true,
  },

  // ───────────── 평택대 — 영화영상 PTU교과 2027 ─────────────
  // 국·영·수·사·과·한국사 중 상위 9과목 단순평균(진로선택 최대 3, A=1·B=2·C=4).
  // PTU실기는 학생부 미반영이라 산식 없음.
  'pyeongtaek-2027-ptu-gyoga-film': {
    key: 'pyeongtaek-2027-ptu-gyoga-film',
    version: 1,
    spec: {
      reflectedSubjects: ['국어', '영어', '수학', '사회', '한국사', '과학'],
      reflectedCourseTypes: ['공통', '일반선택', '진로선택'],
      yearWeight: { kind: 'all_equal' },
      passFailRule: 'exclude',
      rankConversion: {
        1: 1000,
        2: 875,
        3: 750,
        4: 625,
        5: 500,
        6: 375,
        7: 250,
        8: 125,
        9: 0,
      },
      achievementConversion: { A: 1000, B: 875, C: 625 },
      achievementToRankFallback: { A: 1, B: 2, C: 4 },
      weights: { common: 0.8, career: 0.2 },
      totalScore: 1000,
      outputs: ['grade_mean_with_career', 'converted_score_1000'],
      notes:
        'PTU교과 산식. 상위 9과목 평균 등급 → 1등급 1000점 ~ 9등급 0점. ' +
        'PTU실기 전형은 학생부 미반영이라 별도 산식 없음.',
    },
    sourceNote: '2027학년도 평택대 수시 모집요강(PTU교과 산출).',
    isDraft: true,
  },

  // ───────────── 경성대 — 영화전공 실기특별 2027 ─────────────
  // 국·수·영·탐구(한국사 포함)·기타교과 각 2과목 = 총 10과목. 진로선택 최대 2(A=2·B=4·C=6).
  'kyungsung-2027-silgi-film': {
    key: 'kyungsung-2027-silgi-film',
    version: 1,
    spec: {
      reflectedSubjects: ['국어', '수학', '영어', '사회', '과학', '한국사', '예술', '기타'],
      reflectedCourseTypes: ['공통', '일반선택', '진로선택'],
      yearWeight: { kind: 'all_equal' },
      passFailRule: 'exclude',
      rankConversion: {
        1: 100,
        2: 98,
        3: 96,
        4: 94,
        5: 92,
        6: 90,
        7: 88,
        8: 86,
        9: 84,
      },
      achievementConversion: { A: 98, B: 94, C: 90 },
      achievementToRankFallback: { A: 2, B: 4, C: 6 },
      weights: { common: 0.8, career: 0.2 },
      totalScore: 100,
      outputs: ['grade_mean_with_career', 'converted_score_1000'],
      notes:
        '실기특별 교과 10%(100점 만점, 84~100). 등급 간 차이가 작아 사실상 실기로 결정. ' +
        '본 시스템은 상위 10과목 평균으로 근사.',
    },
    sourceNote: '2027학년도 경성대 수시 모집요강(실기특별 교과 환산).',
    isDraft: true,
  },
  'kyungsung-2027-gyoga-film': {
    key: 'kyungsung-2027-gyoga-film',
    version: 1,
    spec: {
      reflectedSubjects: ['국어', '수학', '영어', '사회', '과학', '한국사', '예술', '기타'],
      reflectedCourseTypes: ['공통', '일반선택', '진로선택'],
      yearWeight: { kind: 'all_equal' },
      passFailRule: 'exclude',
      rankConversion: {
        1: 1000,
        2: 980,
        3: 960,
        4: 940,
        5: 920,
        6: 900,
        7: 880,
        8: 860,
        9: 840,
      },
      achievementConversion: { A: 980, B: 940, C: 900 },
      achievementToRankFallback: { A: 2, B: 4, C: 6 },
      weights: { common: 0.8, career: 0.2 },
      totalScore: 1000,
      outputs: ['grade_mean_with_career', 'converted_score_1000'],
      notes: '일반계고교과 교과 100% 반영. 실기특별과 동일 등급차(2점) × 10 배수.',
    },
    sourceNote: '2027학년도 경성대 수시 모집요강(일반계고교과).',
    isDraft: true,
  },

  // ───────────── 동서대 — 영화과(계열1 통합) 실기전형 2027 ─────────────
  // 국·영·수·사·과 각 3과목 + 전 과목 7과목 = 10과목 합산(진로선택 최대 2, A=1·B=3·C=5).
  'dongseo-2027-silgi-film-series1': {
    key: 'dongseo-2027-silgi-film-series1',
    version: 1,
    spec: {
      reflectedSubjects: [
        '국어',
        '영어',
        '수학',
        '사회',
        '과학',
        '한국사',
        '예술',
        '체육',
        '기술가정',
        '제2외국어',
        '한문',
        '기타',
      ],
      reflectedCourseTypes: ['공통', '일반선택', '진로선택'],
      yearWeight: { kind: 'all_equal' },
      passFailRule: 'exclude',
      rankConversion: {
        1: 20,
        2: 19,
        3: 18,
        4: 17,
        5: 16,
        6: 15,
        7: 14,
        8: 13,
        9: 12,
      },
      achievementConversion: { A: 20, B: 18, C: 16 },
      achievementToRankFallback: { A: 1, B: 3, C: 5 },
      weights: { common: 0.8, career: 0.2 },
      totalScore: 200,
      outputs: ['grade_mean_with_career', 'converted_score_1000'],
      notes:
        '계열1(영화·뮤지컬·연기) 통합 실기전형. 10과목 환산점수 합산 → 학생부 20%(200점 만점). 실질 9.1%.',
    },
    sourceNote: '2027학년도 동서대 수시 모집요강(실기전형 교과 환산).',
    isDraft: true,
  },

  // ───────────── 청주대 — 영화영상학과 예체능전형 2027 ─────────────
  // 국·영·수·사·과·제2외국어/한문 각 상위 2과목 = 총 8과목. 표준점수식이지만 등급평균으로 근사.
  'cheongju-2027-yechaeneung-film': {
    key: 'cheongju-2027-yechaeneung-film',
    version: 1,
    spec: {
      reflectedSubjects: ['국어', '영어', '수학', '사회', '과학', '제2외국어', '한문'],
      reflectedCourseTypes: ['공통', '일반선택'],
      yearWeight: { kind: 'all_equal' },
      passFailRule: 'exclude',
      rankConversion: {
        1: 1000,
        2: 970,
        3: 940,
        4: 910,
        5: 870,
        6: 800,
        7: 700,
        8: 550,
        9: 300,
      },
      achievementConversion: { A: 970, B: 910, C: 870 },
      achievementToRankFallback: { A: 1, B: 3, C: 5 },
      weights: { ...NO_CAREER_WEIGHTS },
      totalScore: 200,
      outputs: ['grade_mean_with_career', 'converted_score_1000'],
      notes:
        '청주대 원 산식은 표준점수 기반(12·{(원점수-평균)/σ}+75)이라 본 시스템과 다름. ' +
        '대안으로 상위 8과목 등급평균으로 근사 비교. 교과 20%, 실기 80%.',
    },
    sourceNote: '2027학년도 청주대 수시 모집요강(예체능전형 표준점수식).',
    isDraft: true,
  },

  // ───────────── 서울예대 — 영화전공 정원내 일반전형 2026 ─────────────
  // 국·영 석차등급 평균(이수단위 미적용, 과목 단위 아닌 교과 단위).
  'seoularts-2026-ilban-film': {
    key: 'seoularts-2026-ilban-film',
    version: 1,
    spec: {
      reflectedSubjects: ['국어', '영어'],
      reflectedCourseTypes: ['공통', '일반선택'],
      yearWeight: { kind: 'all_equal' },
      passFailRule: 'exclude',
      rankConversion: {
        1: 200,
        2: 181,
        3: 162,
        4: 143,
        5: 124,
        6: 105,
        7: 86,
        8: 67,
        9: 48,
      },
      achievementConversion: { A: 200, B: 162, C: 124 },
      achievementToRankFallback: { A: 1, B: 3, C: 5 },
      weights: { ...NO_CAREER_WEIGHTS },
      totalScore: 200,
      outputs: ['grade_mean_with_career', 'converted_score_1000'],
      notes:
        '학생부 200점(실질 16.0%, 등급 간 19점). 원 산식은 이수단위 미적용이라 본 시스템(이수단위 가중)과 차이 존재. ' +
        '실기 800점(작문+이미지분석+구두문답) 합산 1000점.',
    },
    sourceNote: '2026학년도 서울예대 수시 모집요강(영화전공 학생부 산식). 2027 발표 시 갱신 필요.',
    isDraft: true,
  },

  // ───────────── 동아방송예대 — 영화예술과 일반전형(실기) 2026 ─────────────
  // 전 과목 석차등급, 1~3-1 중 최우수 2개 학기 100%.
  'dima-2026-silgi-film': {
    key: 'dima-2026-silgi-film',
    version: 1,
    templateKey: 'arts_only_grade_mean',
    spec: {
      ...ARTS_ONLY_GRADE_MEAN,
      reflectedSubjects: [
        '국어',
        '영어',
        '수학',
        '사회',
        '한국사',
        '과학',
        '예술',
        '체육',
        '기술가정',
        '제2외국어',
        '한문',
        '기타',
      ],
      totalScore: 200,
      notes:
        '전 과목 석차등급 + 최우수 2개 학기 100%(나머지 학기 0%)는 본 시스템에서 표현 불가. ' +
        '대안: 전 과목 단순 등급평균으로 근사. 실기 80%(800점) + 내신 20%(200점). OCR 추출본 기반.',
    },
    sourceNote: '2026학년도 동아방송예대 수시 모집요강(OCR 추출). 2027 발표 시 갱신 필요.',
    isDraft: true,
  },
  'dima-2026-silgi-film-second': {
    key: 'dima-2026-silgi-film-second',
    version: 1,
    templateKey: 'arts_only_grade_mean',
    spec: {
      ...ARTS_ONLY_GRADE_MEAN,
      reflectedSubjects: [
        '국어',
        '영어',
        '수학',
        '사회',
        '한국사',
        '과학',
        '예술',
        '체육',
        '기술가정',
        '제2외국어',
        '한문',
        '기타',
      ],
      totalScore: 200,
      notes: '수시2차 — 수시1차와 동일 산식.',
    },
    sourceNote: '2026학년도 동아방송예대 수시 모집요강(OCR).',
    isDraft: true,
  },

  // ───────────── 서일대 — 영화방송제작전공 일반전형 2024 ─────────────
  // 전 과목 석차등급, 1~3-1 중 최우수 2개 학기 평균. 환산식 별도.
  'seoil-2024-silgi-film-production': {
    key: 'seoil-2024-silgi-film-production',
    version: 1,
    spec: {
      reflectedSubjects: [
        '국어',
        '영어',
        '수학',
        '사회',
        '한국사',
        '과학',
        '예술',
        '체육',
        '기술가정',
        '제2외국어',
        '한문',
        '기타',
      ],
      reflectedCourseTypes: ['공통', '일반선택', '진로선택'],
      yearWeight: { kind: 'all_equal' },
      passFailRule: 'exclude',
      rankConversion: {
        1: 400,
        2: 386,
        3: 372,
        4: 358,
        5: 344,
        6: 330,
        7: 316,
        8: 302,
        9: 288,
      },
      achievementConversion: { A: 386, B: 358, C: 330 },
      achievementToRankFallback: { A: 1, B: 3, C: 5 },
      weights: { common: 0.8, career: 0.2 },
      totalScore: 400,
      outputs: ['grade_mean_with_career', 'converted_score_1000'],
      notes:
        '원 산식: 총점 = (9-내신등급)/8 × (400-288) + 288, 288~400점. 1~3-1 중 최우수 2개 학기 평균. ' +
        '본 시스템은 전 과목 등급평균 단순화. 실기/면접 60%(600점) + 학생부 40%(400점). 2024 기준.',
    },
    sourceNote: '2024학년도 서일대 수시 모집요강. 2027 발표 시 갱신 필요.',
    isDraft: true,
  },

  // ───────────── 성결대 — 영화영상학과 실기우수자 2027 ─────────────
  // 국·수·영·사·과·한국사 중 석차등급 상위 12과목(진로선택 2과목 포함). 이수단위 가중.
  // 등급별 환산점수 5/4.5/4/3.5/3/2.5/2/1.5/1 → 1000점 스케일로 근사.
  'sungkyul-2027-silgi-film': {
    key: 'sungkyul-2027-silgi-film',
    version: 1,
    spec: {
      reflectedSubjects: ['국어', '수학', '영어', '사회', '과학', '한국사'],
      reflectedCourseTypes: ['공통', '일반선택', '진로선택'],
      yearWeight: { kind: 'all_equal' },
      passFailRule: 'exclude',
      rankConversion: {
        1: 1000,
        2: 900,
        3: 800,
        4: 700,
        5: 600,
        6: 500,
        7: 400,
        8: 300,
        9: 200,
      },
      achievementConversion: { A: 1000, B: 800, C: 600 },
      achievementToRankFallback: { A: 1, B: 3, C: 5 },
      weights: { common: 0.83, career: 0.17 },
      totalScore: 1000,
      outputs: ['grade_mean_with_career', 'converted_score_1000'],
      notes:
        '석차등급 상위 12과목(진로선택 2과목 포함) 이수단위 가중평균. 등급별 환산점수(1등급 5 ~ 9등급 1)를 ' +
        '1000점 스케일로 근사. 실기우수자전형은 학생부 20%(200점) + 실기 80%이라 등급 영향은 보조적.',
    },
    sourceNote: '2027학년도 성결대 수시 모집요강 p.50~51(등급별 환산점수·반영교과).',
    isDraft: true,
  },

  // ───────────── 순천향대 — 공연영상학과 영화영상연출제작 실기우수자 2027 ─────────────
  // 국·수·영·사(역사/도덕·한국사 포함)·과 석차등급 제공 전 과목. 변환점수 100/98/96/94/92/89/86/83/80.
  // 진로선택 성적(U)은 최대 1점(/1000)으로 사실상 미미 → 공통/일반선택만 반영.
  'soonchunhyang-2027-silgi-film-direction': {
    key: 'soonchunhyang-2027-silgi-film-direction',
    version: 1,
    spec: {
      reflectedSubjects: ['국어', '수학', '영어', '사회', '한국사', '과학'],
      reflectedCourseTypes: ['공통', '일반선택'],
      yearWeight: { kind: 'all_equal' },
      passFailRule: 'exclude',
      rankConversion: {
        1: 1000,
        2: 980,
        3: 960,
        4: 940,
        5: 920,
        6: 890,
        7: 860,
        8: 830,
        9: 800,
      },
      achievementConversion: { A: 1000, B: 960, C: 920 },
      achievementToRankFallback: { A: 1, B: 3, C: 5 },
      weights: { ...NO_CAREER_WEIGHTS },
      totalScore: 200,
      outputs: ['grade_mean_with_career', 'converted_score_1000'],
      notes:
        '석차등급 변환점수(1등급 100 ~ 9등급 80) 이수단위 가중평균(T). 공연영상학과 교과 = T×2 + U×0.2 - 0.2 ' +
        '(최고 200 / 최저 160, 학생부 20%). 진로선택 성적(U)은 최대 1점(/1000)으로 미미해 미반영 근사. 실기 80%.',
    },
    sourceNote: '2027학년도 순천향대 수시 모집요강 p.52(교과 성적 산출식·석차등급 변환점수).',
    isDraft: true,
  },

  // ───────────── 호서대 — 문화영상학부(영상미디어트랙) 실기전형 2027 ─────────────
  // 국·영·수·사·과·한국사 석차등급 상위 12과목 + 진로선택 상위 3과목. 평균석차등급 구간표(20% 컬럼).
  'hoseo-2027-silgi-media-track': {
    key: 'hoseo-2027-silgi-media-track',
    version: 1,
    spec: {
      reflectedSubjects: ['국어', '영어', '수학', '사회', '과학', '한국사'],
      reflectedCourseTypes: ['공통', '일반선택', '진로선택'],
      yearWeight: { kind: 'all_equal' },
      passFailRule: 'exclude',
      rankConversion: {
        1: 1000,
        2: 900,
        3: 800,
        4: 700,
        5: 600,
        6: 500,
        7: 400,
        8: 300,
        9: 0,
      },
      achievementConversion: { A: 1000, B: 800, C: 600 },
      achievementToRankFallback: { A: 1, B: 3, C: 5 },
      weights: { common: 0.8, career: 0.2 },
      totalScore: 1000,
      outputs: ['grade_mean_with_career', 'converted_score_1000'],
      notes:
        '석차등급 상위 12과목 + 진로선택 상위 3과목(총 15과목) 평균석차등급 → 구간표 환산(1구간 1.00~1.99 등). ' +
        '본 시스템은 등급평균으로 근사. 실기전형은 학생부 20%(200점) + 실기 80%이라 등급 영향은 보조적.',
    },
    sourceNote: '2027학년도 호서대 수시 모집요강 p.46~47(교과성적 반영표·산출 공식).',
    isDraft: true,
  },
}

export function getFormulaPreset(programKey: string): FormulaPreset | null {
  return FORMULA_PRESETS[programKey] ?? null
}
