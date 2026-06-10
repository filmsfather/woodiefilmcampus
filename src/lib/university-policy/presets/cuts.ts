/**
 * 모집단위별 입시결과 컷 프리셋. programKey → CutPreset.
 *
 * 컷이 없는 모집단위는 프리셋에서 제외하면 됩니다(분석 결과에 "컷 미공개"로 표시).
 * version은 점들이 바뀔 때마다 +1 하세요. 캐시가 자동 무효화됩니다.
 *
 * sourceType:
 *  - university_official : 대학 공식 발표
 *  - estimated_by_staff  : 원장/교사 추정값
 *  - community           : 외부 커뮤니티 자료
 *  - inferred_prev_year  : 전년도 자료 차용
 *
 * point_kind:
 *  - best/mean/worst : 최고/평균/최저
 *  - percentile      : 50%, 70%, 100% Cut 등 (percentile 필드 함께 사용)
 *  - stage           : 1단계/2단계 컷
 *  - custom          : 위에 안 들어가는 라벨
 */

import type { CutSourceType, CutPoint } from '@/lib/university-policy/types'

export interface CutPreset {
  key: string // = programKey (1 모집단위 = 1 활성 컷 묶음)
  version: number
  sourceYear: number
  sourceType: CutSourceType
  sourceUrl?: string
  applicants?: number
  registered?: number
  competitionRate?: number
  lastAdmitNo?: number
  fillRate?: number
  notes?: string
  points: CutPoint[]
}

export const CUT_PRESETS: Readonly<Record<string, CutPreset>> = {
  // ───────────── 세종대 영화예술-연출제작 (reference) ─────────────
  'sejong-2026-silgi-film-direction': {
    key: 'sejong-2026-silgi-film-direction',
    version: 1,
    sourceYear: 2025,
    sourceType: 'estimated_by_staff',
    competitionRate: 30.0,
    fillRate: 50,
    notes: '예시값입니다. 실제 발표 자료로 교체 필요.',
    points: [
      {
        metric: 'grade_mean_with_career',
        label: '평균',
        percentile: null,
        pointKind: 'mean',
        value: 4.5,
        confidence: 'low',
        isEstimated: true,
      },
      {
        metric: 'grade_mean_with_career',
        label: '70% Cut',
        percentile: 70,
        pointKind: 'percentile',
        value: 5.0,
        confidence: 'low',
        isEstimated: true,
      },
    ],
  },

  // ───────────── 한예종 영상원 영화과 일반전형 (2027) ─────────────
  // 우디필름캠퍼스 내부 기준(원장 추정): 등급평균 3.5 / 4.5 두 점 사용.
  //  - ≤ 3.5  : safe(안정) — 사용자 의미 "적정"
  //  - ≤ 4.5  : reach(도전) — 사용자 의미 "소신/도전"
  //  - > 4.5  : risk(위험) — 사용자 의미 "상향"
  'karts-2027-ilban-film': {
    key: 'karts-2027-ilban-film',
    version: 1,
    sourceYear: 2026,
    sourceType: 'estimated_by_staff',
    notes:
      '한예종 미공개 컷에 대한 우디필름캠퍼스 내부 추정 기준. 등급평균 3.5 이내는 적정, 3.5~4.5는 소신(도전), 4.5 초과는 상향. ' +
      '한예종 학생부 비중은 1차 시험의 20%에 불과하므로 본 컷은 참고용 가늠치이며, 실제 합격은 글쓰기·구술·이야기 구성이 결정.',
    points: [
      {
        metric: 'grade_mean_with_career',
        label: '적정 컷 (≤ 3.5)',
        percentile: null,
        pointKind: 'custom',
        value: 3.5,
        confidence: 'low',
        isEstimated: true,
      },
      {
        metric: 'grade_mean_with_career',
        label: '소신/도전 컷 (≤ 4.5)',
        percentile: null,
        pointKind: 'custom',
        value: 4.5,
        confidence: 'low',
        isEstimated: true,
      },
    ],
  },

  // ───────────── 중앙대 영화전공(실기형) 2027 ─────────────
  // 출처: 중앙대 입학처 비카우스(BeCAUs) 뉴스 PDF (2025_ss_bn / 2026_ss_bn).
  // 실기 80% 비중이라 학생부 평균등급은 참고용. 합격자 평균등급을 연도별 컷으로 사용.
  'chungang-2027-silgi-film': {
    key: 'chungang-2027-silgi-film',
    version: 1,
    sourceYear: 2025,
    sourceType: 'university_official',
    competitionRate: 131.0,
    fillRate: 25,
    notes:
      '중앙대 입학처 비카우스(BeCAUs) 뉴스 PDF 기준 최근 3개년 실기형 입결. ' +
      '2024: 모집 25명 · 경쟁률 160.4:1 · 충원율 25% · 학생부 평균 3.6 · 환산 94.1(학생부 100점 만점). ' +
      '2025: 모집 25명 · 경쟁률 131.0:1 · 충원율 25% · 학생부 평균 3.8 · 환산 95.4. ' +
      '2026: 입결 2026.6~ 공개 예정, 수능최저 신설(국·수·영·탐 2개 합 6 이내). ' +
      '※ 2027학년도 수시 실기형 모집인원은 8명으로 축소. 실기 80% 비중으로 학생부 등급은 참고용 가늠치.',
    points: [
      {
        metric: 'grade_mean_with_career',
        label: '합격자 평균등급 (2024)',
        percentile: null,
        pointKind: 'mean',
        value: 3.6,
        confidence: 'medium',
        isEstimated: false,
      },
      {
        metric: 'grade_mean_with_career',
        label: '합격자 평균등급 (2025)',
        percentile: null,
        pointKind: 'mean',
        value: 3.8,
        confidence: 'medium',
        isEstimated: false,
      },
    ],
  },

  // ───────────── 세종대 영화예술-연출제작 (실기우수자) 2027 ─────────────
  // 출처: 세종대 입학처 수시모집 상담자료 PDF (최근 3개년 입결).
  // 실기 60% 비중이라 학생부 평균등급은 참고용. 3개년 합격 평균등급을 컷 점으로 사용.
  'sejong-2027-silgi-film-direction': {
    key: 'sejong-2027-silgi-film-direction',
    version: 1,
    sourceYear: 2026,
    sourceType: 'university_official',
    applicants: 753,
    registered: 6,
    competitionRate: 125.5,
    fillRate: 0,
    notes:
      '세종대 입학처 수시모집 상담자료 PDF 기준 최근 3개년 실기우수자(연출제작) 입결. ' +
      '2024: 모집 10명 · 경쟁률 78.50:1 · 충원율 60% · 평균등급 3.20 · 70%컷 3.54. ' +
      '2025: 모집 12명 · 경쟁률 101.83:1 · 충원율 8.3% · 평균등급 3.51 · 70%컷 3.82. ' +
      '2026: 모집 6명(반토막) · 경쟁률 125.50:1 · 충원율 0% · 평균등급 3.97 · 70%컷 3.71(최저 5.58). ' +
      '※ 실기 60% 비중으로 학생부 등급은 합격 결정력이 낮은 참고용 가늠치.',
    points: [
      {
        metric: 'grade_mean_with_career',
        label: '합격자 평균등급 (2024)',
        percentile: null,
        pointKind: 'mean',
        value: 3.2,
        confidence: 'medium',
        isEstimated: false,
      },
      {
        metric: 'grade_mean_with_career',
        label: '합격자 평균등급 (2025)',
        percentile: null,
        pointKind: 'mean',
        value: 3.51,
        confidence: 'medium',
        isEstimated: false,
      },
      {
        metric: 'grade_mean_with_career',
        label: '합격자 평균등급 (2026)',
        percentile: null,
        pointKind: 'mean',
        value: 3.97,
        confidence: 'medium',
        isEstimated: false,
      },
    ],
  },

  // ───────────── 경희대 연극영화학과(영화연출 및 제작) 네오르네상스 2027 ─────────────
  // 출처: 경희대 입학처 학생부종합전형 가이드북 (최근 3개년 입결).
  // 학종 정성평가라 등급은 참고용. 2025는 50%컷 2.49 / 70%컷 2.80 중앙값으로 추정.
  'kyunghee-2027-neorenaissance-film-direction': {
    key: 'kyunghee-2027-neorenaissance-film-direction',
    version: 1,
    sourceYear: 2026,
    sourceType: 'university_official',
    competitionRate: 16.6,
    notes:
      '경희대 입학처 학생부종합 가이드북 기준 최근 3개년 영화연출 및 제작 입결. ' +
      '2024: 모집 9~10명 · 경쟁률 11.00:1 · 합격 평균등급 2.63. ' +
      '2025: 모집 15명 · 경쟁률 15.00:1 · 50%컷 2.49 / 70%컷 2.80(평균 ≈2.65 추정). ' +
      '2026: 모집 15명 · 경쟁률 16.60:1 · 합격 평균등급 3.65. ' +
      '※ 학종 정성평가로 합격자 등급 분포가 넓음(일반고 73~74%). 수능최저 없음.',
    points: [
      {
        metric: 'grade_mean_with_career',
        label: '합격자 평균등급 (2024)',
        percentile: null,
        pointKind: 'mean',
        value: 2.63,
        confidence: 'medium',
        isEstimated: false,
      },
      {
        metric: 'grade_mean_with_career',
        label: '합격 평균등급 추정 (2025)',
        percentile: null,
        pointKind: 'mean',
        value: 2.65,
        confidence: 'low',
        isEstimated: true,
      },
      {
        metric: 'grade_mean_with_career',
        label: '합격 평균등급 (2026)',
        percentile: null,
        pointKind: 'mean',
        value: 3.65,
        confidence: 'medium',
        isEstimated: false,
      },
    ],
  },

  // ───────────── 동국대 영화영상학과 Do Dream(학생부종합) 2027 ─────────────
  // 출처: 동국대 입학처 입학전형결과 PDF (최근 3개년).
  // 학종 정성평가라 등급은 참고용. 1단계 서류 평균등급 기준.
  'dongguk-2027-dodream-film': {
    key: 'dongguk-2027-dodream-film',
    version: 1,
    sourceYear: 2026,
    sourceType: 'university_official',
    applicants: 465,
    competitionRate: 42.27,
    fillRate: 27,
    notes:
      '동국대 입학처 입학전형결과 PDF 기준 최근 3개년 Do Dream(학생부종합) 입결. ' +
      '2024: 모집 10명 · 지원 317명 · 경쟁률 31.70:1 · 평균 3.62 · 70%컷 5.54 · 충원율 40%. ' +
      '2025: 모집 11명 · 지원 361명 · 경쟁률 32.82:1 · 평균 3.81 · 70%컷 5.75 · 충원율 27%. ' +
      '2026: 모집 11명 · 지원 465명 · 경쟁률 42.27:1 · 평균 2.88 · 70%컷 4.71 · 충원율 27%. ' +
      '※ 학종 정성평가. 합격자 평균등급 사용(70%컷은 미반영).',
    points: [
      {
        metric: 'grade_mean_with_career',
        label: '합격자 평균등급 (2024)',
        percentile: null,
        pointKind: 'mean',
        value: 3.62,
        confidence: 'medium',
        isEstimated: false,
      },
      {
        metric: 'grade_mean_with_career',
        label: '합격자 평균등급 (2025)',
        percentile: null,
        pointKind: 'mean',
        value: 3.81,
        confidence: 'medium',
        isEstimated: false,
      },
      {
        metric: 'grade_mean_with_career',
        label: '합격자 평균등급 (2026)',
        percentile: null,
        pointKind: 'mean',
        value: 2.88,
        confidence: 'medium',
        isEstimated: false,
      },
    ],
  },

  // ───────────── 동국대 영화영상학과 기회균형통합(학생부종합) 2027 ─────────────
  // 출처: 동국대 입학처 입학전형결과 PDF. 충원포함 평균등급 기준.
  'dongguk-2027-gihoegyunhyeong-film': {
    key: 'dongguk-2027-gihoegyunhyeong-film',
    version: 1,
    sourceYear: 2026,
    sourceType: 'university_official',
    applicants: 30,
    competitionRate: 15.0,
    fillRate: 50,
    notes:
      '동국대 입학처 입학전형결과 PDF 기준 최근 3개년 기회균형통합(학생부종합) 입결. ' +
      '2024: 모집 2명 · 지원 39명 · 경쟁률 19.50:1 · 충원포함 평균 2.76 · 충원율 150%. ' +
      '2025: 모집 2명 · 지원 39명 · 경쟁률 19.50:1 · 충원포함 평균 1.61 · 충원율 100%. ' +
      '2026: 모집 2명 · 지원 30명 · 경쟁률 15.00:1 · 충원포함 평균 2.52 · 충원율 50%. ' +
      '※ 모집 2명 소표본이라 연도별 변동 큼. 충원포함 평균등급 사용.',
    points: [
      {
        metric: 'grade_mean_with_career',
        label: '충원포함 평균등급 (2024)',
        percentile: null,
        pointKind: 'mean',
        value: 2.76,
        confidence: 'low',
        isEstimated: false,
      },
      {
        metric: 'grade_mean_with_career',
        label: '충원포함 평균등급 (2025)',
        percentile: null,
        pointKind: 'mean',
        value: 1.61,
        confidence: 'low',
        isEstimated: false,
      },
      {
        metric: 'grade_mean_with_career',
        label: '충원포함 평균등급 (2026)',
        percentile: null,
        pointKind: 'mean',
        value: 2.52,
        confidence: 'low',
        isEstimated: false,
      },
    ],
  },

  // ───────────── 동국대 영화영상학과 학교장추천인재(학생부교과) 2027 ─────────────
  // 출처: 동국대 입학처 입학전형결과 PDF. 충원포함 평균등급 기준.
  'dongguk-2027-hakjong-chuchon-film': {
    key: 'dongguk-2027-hakjong-chuchon-film',
    version: 1,
    sourceYear: 2026,
    sourceType: 'university_official',
    applicants: 30,
    competitionRate: 10.0,
    fillRate: 200,
    notes:
      '동국대 입학처 입학전형결과 PDF 기준 최근 3개년 학교장추천인재(학생부교과) 입결. ' +
      '2024: 모집 4명 · 지원 60명 · 경쟁률 15.00:1 · 충원포함 평균 2.26(최초 2.00) · 충원율 25%. ' +
      '2025: 모집 3명 · 지원 43명 · 경쟁률 14.33:1 · 충원포함 평균 1.68(최초 2.00) · 충원율 100%. ' +
      '2026: 모집 3명 · 지원 30명 · 경쟁률 10.00:1 · 충원포함 평균 2.55(최초 2.71) · 충원율 200%. ' +
      '※ 교과전형. 충원포함 평균등급 사용. 소표본이라 변동 큼.',
    points: [
      {
        metric: 'grade_mean_with_career',
        label: '충원포함 평균등급 (2024)',
        percentile: null,
        pointKind: 'mean',
        value: 2.26,
        confidence: 'medium',
        isEstimated: false,
      },
      {
        metric: 'grade_mean_with_career',
        label: '충원포함 평균등급 (2025)',
        percentile: null,
        pointKind: 'mean',
        value: 1.68,
        confidence: 'medium',
        isEstimated: false,
      },
      {
        metric: 'grade_mean_with_career',
        label: '충원포함 평균등급 (2026)',
        percentile: null,
        pointKind: 'mean',
        value: 2.55,
        confidence: 'medium',
        isEstimated: false,
      },
    ],
  },

  // ───────────── 숭실대 영화예술전공(연출) 예체능우수인재 2027 ─────────────
  // 출처: 숭실대 입학처 입학전형 통계 PDF (3개년 추이표). 주요교과 평균등급 기준.
  'soongsil-2027-yechaeneung-film-direction': {
    key: 'soongsil-2027-yechaeneung-film-direction',
    version: 1,
    sourceYear: 2026,
    sourceType: 'university_official',
    competitionRate: 53.9,
    fillRate: 5,
    notes:
      '숭실대 입학처 입학전형 통계 PDF(2027학년도 통계, 3개년 추이) 기준 영화예술전공(연출) 입결. ' +
      '2024: 모집 22명 · 경쟁률 44.1:1 · 충원율 23% · 주요교과 평균 3.53. ' +
      '2025: 모집 22명 · 경쟁률 46.6:1 · 충원율 0% · 주요교과 평균 3.85. ' +
      '2026: 모집 22명 · 경쟁률 53.9:1 · 충원율 5% · 주요교과 평균 3.98. ' +
      '※ 2027학년도부터 2단계 실기 100%로 변경되어 학생부 영향력 추가 감소 전망.',
    points: [
      {
        metric: 'grade_mean_with_career',
        label: '주요교과 평균등급 (2024)',
        percentile: null,
        pointKind: 'mean',
        value: 3.53,
        confidence: 'medium',
        isEstimated: false,
      },
      {
        metric: 'grade_mean_with_career',
        label: '주요교과 평균등급 (2025)',
        percentile: null,
        pointKind: 'mean',
        value: 3.85,
        confidence: 'medium',
        isEstimated: false,
      },
      {
        metric: 'grade_mean_with_career',
        label: '주요교과 평균등급 (2026)',
        percentile: null,
        pointKind: 'mean',
        value: 3.98,
        confidence: 'medium',
        isEstimated: false,
      },
    ],
  },

  // ───────────── 서경대 영화영상학과 실기우수자 2027 ─────────────
  // 출처: 서경대 입학처 전년도 입시결과(2025학년도 50/70/100%컷). 2024·2026은 미공개.
  'seokyeong-2027-silgi-film': {
    key: 'seokyeong-2027-silgi-film',
    version: 1,
    sourceYear: 2025,
    sourceType: 'university_official',
    competitionRate: 38.43,
    notes:
      '서경대 입학처 전년도 입시결과 기준. 2025학년도 학생부 평균등급 50/70/100%컷만 공개. ' +
      '2025: 경쟁률 38.43:1 · 50%컷 4.45 / 70%컷 4.85 / 100%컷 6.67. ' +
      '2026: 경쟁률 49.33:1(지원 1,480명)이나 등급컷 미공개. ' +
      '※ 실기 80% 비중으로 학생부 4~5등급대 합격자 다수.',
    points: [
      {
        metric: 'grade_mean_with_career',
        label: '50% Cut (2025)',
        percentile: 50,
        pointKind: 'percentile',
        value: 4.45,
        confidence: 'medium',
        isEstimated: false,
      },
      {
        metric: 'grade_mean_with_career',
        label: '70% Cut (2025)',
        percentile: 70,
        pointKind: 'percentile',
        value: 4.85,
        confidence: 'medium',
        isEstimated: false,
      },
      {
        metric: 'grade_mean_with_career',
        label: '100% Cut (2025)',
        percentile: 100,
        pointKind: 'percentile',
        value: 6.67,
        confidence: 'medium',
        isEstimated: false,
      },
    ],
  },

  // ───────────── 단국대 영화전공 실기우수자 2027 ─────────────
  // 출처: 단국대 입학처 죽전캠퍼스 수시모집 입시결과 PDF. 합격 평균등급 기준.
  'dankook-2027-silgi-film': {
    key: 'dankook-2027-silgi-film',
    version: 1,
    sourceYear: 2026,
    sourceType: 'university_official',
    applicants: 543,
    competitionRate: 77.57,
    notes:
      '단국대 입학처 죽전캠퍼스 수시모집 입시결과 PDF 기준 최근 3개년 영화전공(이론·연출·스탭) 입결. ' +
      '2024: 모집 12명 · 지원 725명 · 경쟁률 60.42:1 · 평균 4.18 · 최고 2.63 · 최저 5.32 · 예비 1번. ' +
      '2025: 모집 12명 · 지원 1,237명 · 경쟁률 103.08:1 · 평균 4.18 · 최고 2.65 · 최저 5.86 · 예비 2번. ' +
      '2026: 모집 7명 · 지원 543명 · 경쟁률 77.57:1 · 평균 4.44 · 최고 3.05 · 최저 6.23 · 예비 2번. ' +
      '※ 등록률 100%, 충원 거의 없음. 합격 평균등급 사용.',
    points: [
      {
        metric: 'grade_mean_with_career',
        label: '합격 평균등급 (2024)',
        percentile: null,
        pointKind: 'mean',
        value: 4.18,
        confidence: 'medium',
        isEstimated: false,
      },
      {
        metric: 'grade_mean_with_career',
        label: '합격 평균등급 (2025)',
        percentile: null,
        pointKind: 'mean',
        value: 4.18,
        confidence: 'medium',
        isEstimated: false,
      },
      {
        metric: 'grade_mean_with_career',
        label: '합격 평균등급 (2026)',
        percentile: null,
        pointKind: 'mean',
        value: 4.44,
        confidence: 'medium',
        isEstimated: false,
      },
    ],
  },

  // ───────────── 상명대 천안 영화영상전공(연출·스태프) 상명인재 2027 ─────────────
  // 출처: 상명대 입학처 성적현황 PDF·보도. 학종 합격 평균등급 기준.
  'sangmyung-2027-sangmyungin-film-staff': {
    key: 'sangmyung-2027-sangmyungin-film-staff',
    version: 1,
    sourceYear: 2026,
    sourceType: 'university_official',
    competitionRate: 20.56,
    notes:
      '상명대 천안 입학처 성적현황 PDF·보도 기준 최근 3개년 상명인재(학생부종합) 연출·스태프 입결. ' +
      '2024: 모집 12명 · 경쟁률 13.33:1 · 합격 평균 3.61. ' +
      '2025: 모집 9명 · 합격 평균 3.56 · 50%컷 3.09 / 70%컷 3.81. ' +
      '2026: 모집 9명 · 경쟁률 20.56:1 · 합격 평균 3.02. ' +
      '※ 학종 정성평가로 합격자 등급 분포 넓음(2~5등급대). 수능최저 없음.',
    points: [
      {
        metric: 'grade_mean_with_career',
        label: '합격 평균등급 (2024)',
        percentile: null,
        pointKind: 'mean',
        value: 3.61,
        confidence: 'medium',
        isEstimated: false,
      },
      {
        metric: 'grade_mean_with_career',
        label: '합격 평균등급 (2025)',
        percentile: null,
        pointKind: 'mean',
        value: 3.56,
        confidence: 'medium',
        isEstimated: false,
      },
      {
        metric: 'grade_mean_with_career',
        label: '합격 평균등급 (2026)',
        percentile: null,
        pointKind: 'mean',
        value: 3.02,
        confidence: 'medium',
        isEstimated: false,
      },
    ],
  },

  // ───────────── 중부대 연극영화학(연출/제작/기획) 실기우수자 2027 ─────────────
  // 출처: 중부대 입학처 전년도 입시결과. 학생부 100% 컷 평균. 2024는 미공개라 2년만.
  'joongbu-2027-silgi-film-direction': {
    key: 'joongbu-2027-silgi-film-direction',
    version: 1,
    sourceYear: 2026,
    sourceType: 'university_official',
    applicants: 181,
    competitionRate: 8.62,
    notes:
      '중부대 입학처 전년도 입시결과 게시 기준 연출/제작/기획 트랙 입결(2024 미공개). ' +
      '2025: 모집 26명 · 지원 80명 · 경쟁률 3.08:1 · 합격 평균 3.72 · 70%컷 5.70 · 충원 35번. ' +
      '2026: 모집 21명 · 지원 181명 · 경쟁률 8.62:1 · 합격 평균 3.01 · 70%컷 3.90 · 충원 28번. ' +
      '※ 실기 80% 비중. 학생부 100% 컷 평균등급 사용.',
    points: [
      {
        metric: 'grade_mean_with_career',
        label: '합격 평균등급 (2025)',
        percentile: null,
        pointKind: 'mean',
        value: 3.72,
        confidence: 'medium',
        isEstimated: false,
      },
      {
        metric: 'grade_mean_with_career',
        label: '합격 평균등급 (2026)',
        percentile: null,
        pointKind: 'mean',
        value: 3.01,
        confidence: 'medium',
        isEstimated: false,
      },
    ],
  },

  // ───────────── 경성대 영화전공 실기특별 2027 ─────────────
  // 출처: 경성대 입학처 최종등록자 성적·충원 XLSX. 합격 평균등급 기준.
  'kyungsung-2027-silgi-film': {
    key: 'kyungsung-2027-silgi-film',
    version: 1,
    sourceYear: 2026,
    sourceType: 'university_official',
    competitionRate: 4.59,
    notes:
      '경성대 입학처 수시 최종등록자 성적·충원 XLSX 기준 최근 3개년 실기특별(영화) 입결. ' +
      '2024: 모집 22명 · 지원율 3.68 · 충원 14명 · 평균 4.30 · 실기 평균 93.41. ' +
      '2025: 모집 22명 · 지원율 4.23 · 충원 19명 · 평균 4.24 · 실기 평균 93.51. ' +
      '2026: 모집 22명 · 지원율 4.59 · 충원 11명 · 평균 4.40 · 실기 평균 93.20. ' +
      '※ competitionRate는 지원율 수치. 실기 90% 비중으로 등급 영향 매우 낮음.',
    points: [
      {
        metric: 'grade_mean_with_career',
        label: '합격 평균등급 (2024)',
        percentile: null,
        pointKind: 'mean',
        value: 4.3,
        confidence: 'medium',
        isEstimated: false,
      },
      {
        metric: 'grade_mean_with_career',
        label: '합격 평균등급 (2025)',
        percentile: null,
        pointKind: 'mean',
        value: 4.24,
        confidence: 'medium',
        isEstimated: false,
      },
      {
        metric: 'grade_mean_with_career',
        label: '합격 평균등급 (2026)',
        percentile: null,
        pointKind: 'mean',
        value: 4.4,
        confidence: 'medium',
        isEstimated: false,
      },
    ],
  },

  // ───────────── 경성대 영화전공 일반계고교과 2027 ─────────────
  // 출처: 경성대 입학처 최종등록자 성적·충원 XLSX. 합격 평균등급 기준.
  'kyungsung-2027-gyoga-film': {
    key: 'kyungsung-2027-gyoga-film',
    version: 1,
    sourceYear: 2026,
    sourceType: 'university_official',
    competitionRate: 4.55,
    notes:
      '경성대 입학처 수시 최종등록자 성적·충원 XLSX 기준 최근 3개년 일반계고교과(영화) 입결. ' +
      '2024: 모집 11명 · 지원율 4.27 · 충원 12명 · 평균 2.80 · 환산 964.00. ' +
      '2025: 모집 11명 · 지원율 4.09 · 충원 14명 · 평균 2.99 · 환산 960.18. ' +
      '2026: 모집 11명 · 지원율 4.55 · 충원 22명 · 평균 2.82 · 환산 963.64. ' +
      '※ competitionRate는 지원율 수치. 교과 100% 전형으로 등급 결정력 큼.',
    points: [
      {
        metric: 'grade_mean_with_career',
        label: '합격 평균등급 (2024)',
        percentile: null,
        pointKind: 'mean',
        value: 2.8,
        confidence: 'medium',
        isEstimated: false,
      },
      {
        metric: 'grade_mean_with_career',
        label: '합격 평균등급 (2025)',
        percentile: null,
        pointKind: 'mean',
        value: 2.99,
        confidence: 'medium',
        isEstimated: false,
      },
      {
        metric: 'grade_mean_with_career',
        label: '합격 평균등급 (2026)',
        percentile: null,
        pointKind: 'mean',
        value: 2.82,
        confidence: 'medium',
        isEstimated: false,
      },
    ],
  },

  // ───────────── 청주대 영화영상학과 예체능전형 2027 ─────────────
  // 출처: 청주대 입학처 최종등록자 모집결과 PDF. 합격 평균등급 기준(2025 미공개).
  'cheongju-2027-yechaeneung-film': {
    key: 'cheongju-2027-yechaeneung-film',
    version: 1,
    sourceYear: 2026,
    sourceType: 'university_official',
    applicants: 477,
    competitionRate: 11.1,
    notes:
      '청주대 입학처 수시 최종등록자 모집결과 PDF 기준 영화영상학과 예체능전형 입결(2025 미공개). ' +
      '2024: 모집 42명 · 지원 377명 · 경쟁률 8.98:1 · 평균등급 4.58 · 70%컷 5.13 · 추합 23명. ' +
      '2026: 모집 43명 · 지원 477명 · 경쟁률 11.10:1 · 평균등급 4.94 · 70%컷 6.06 · 추합 16명. ' +
      '※ 실기 80% 비중. 합격자 등급 분포 매우 넓음(2.13~6.06). 합격 평균등급 사용.',
    points: [
      {
        metric: 'grade_mean_with_career',
        label: '평균등급 (2024)',
        percentile: null,
        pointKind: 'mean',
        value: 4.58,
        confidence: 'medium',
        isEstimated: false,
      },
      {
        metric: 'grade_mean_with_career',
        label: '평균등급 (2026)',
        percentile: null,
        pointKind: 'mean',
        value: 4.94,
        confidence: 'medium',
        isEstimated: false,
      },
    ],
  },

  // ───────────── 동아방송예대 영화예술과 일반전형(실기) 2026 ─────────────
  // 출처: 동아방송예대 입학처·진학사. 2024 평균등급만 확보(2025·2026 등급 미공개).
  'dima-2026-silgi-film': {
    key: 'dima-2026-silgi-film',
    version: 1,
    sourceYear: 2024,
    sourceType: 'community',
    notes:
      '동아방송예대 입학처·진학사 기준 영화예술과 실기 일반전형 입결. ' +
      '2024: 합격 평균등급 4.17 · 최저 5.53. ' +
      '2025: 경쟁률 29.15:1 / 2026: 경쟁률 21.53:1이나 등급 미공개. ' +
      '※ 실기 80% 비중. 평균·최저 2점만 확보(외부 자료 포함). 2027 발표 시 갱신 필요.',
    points: [
      {
        metric: 'grade_mean_with_career',
        label: '합격 평균등급 (2024)',
        percentile: null,
        pointKind: 'mean',
        value: 4.17,
        confidence: 'low',
        isEstimated: false,
      },
      {
        metric: 'grade_mean_with_career',
        label: '합격 최저등급 (2024)',
        percentile: null,
        pointKind: 'worst',
        value: 5.53,
        confidence: 'low',
        isEstimated: false,
      },
    ],
  },

  // ───────────── 서일대 영화방송제작전공 일반전형(실기/면접) 2024 ─────────────
  // 출처: 서일대 입학처 수시1차 정원내 PDF. 합격 평균등급 기준(수시1차).
  'seoil-2024-silgi-film-production': {
    key: 'seoil-2024-silgi-film-production',
    version: 1,
    sourceYear: 2026,
    sourceType: 'university_official',
    applicants: 281,
    competitionRate: 9.37,
    notes:
      '서일대 입학처 수시1차 정원내 PDF 기준 최근 3개년 영화방송제작전공 입결. ' +
      '2024: 모집 26명 · 경쟁률 8.12:1 · 평균 4.64 · 내신 최저 6.14 · 예비 31번. ' +
      '2025: 모집 28명 · 경쟁률 8.04:1 · 평균 4.86 · 내신 최저 4.24 · 예비 65번. ' +
      '2026: 모집 30명 · 경쟁률 9.37:1 · 평균 4.60 · 내신 최저 4.52 · 예비 52번. ' +
      '※ 수시1차 기준(2차·정시 별도). 실기 80% 비중. 프로그램 프리셋은 2024학년도 키이나 컷은 3개년 반영.',
    points: [
      {
        metric: 'grade_mean_with_career',
        label: '합격 평균등급 (2024)',
        percentile: null,
        pointKind: 'mean',
        value: 4.64,
        confidence: 'medium',
        isEstimated: false,
      },
      {
        metric: 'grade_mean_with_career',
        label: '합격 평균등급 (2025)',
        percentile: null,
        pointKind: 'mean',
        value: 4.86,
        confidence: 'medium',
        isEstimated: false,
      },
      {
        metric: 'grade_mean_with_career',
        label: '합격 평균등급 (2026)',
        percentile: null,
        pointKind: 'mean',
        value: 4.6,
        confidence: 'medium',
        isEstimated: false,
      },
    ],
  },

  // ───────────── 국민대 영화전공 실기우수자 2027 ─────────────
  // 우디필름캠퍼스 내부 지원 기준(원장): 산출 등급평균 3.3 이내 지원가능 / 3.5 이내 도전 / 초과 위험.
  'kookmin-2027-silgi-film': {
    key: 'kookmin-2027-silgi-film',
    version: 1,
    sourceYear: 2026,
    sourceType: 'estimated_by_staff',
    notes:
      '국민대 산출 방식으로 계산한 등급평균 기준 우디필름캠퍼스 내부 지원 기준. ' +
      '3.3 이내는 지원 가능(안정), 3.3~3.5는 도전, 3.5 초과는 위험. ' +
      '실기·면접 비중이 크므로 본 기준은 내신 가늠치이며 최종 판단은 원장 상담 권장.',
    points: [
      {
        metric: 'grade_mean_with_career',
        label: '지원 가능 기준 (≤ 3.3)',
        percentile: null,
        pointKind: 'custom',
        value: 3.3,
        confidence: 'medium',
        isEstimated: true,
      },
      {
        metric: 'grade_mean_with_career',
        label: '도전 기준 (≤ 3.5)',
        percentile: null,
        pointKind: 'custom',
        value: 3.5,
        confidence: 'medium',
        isEstimated: true,
      },
    ],
  },

  // ───────────── 용인대 영화영상학과 일반학생 2027 ─────────────
  // 우디필름캠퍼스 내부 지원 기준(원장): 등급평균 4.0 이내 지원가능 / 4.5 이내 도전 / 초과 위험.
  'yongin-2027-silgi-film-general': {
    key: 'yongin-2027-silgi-film-general',
    version: 1,
    sourceYear: 2026,
    sourceType: 'estimated_by_staff',
    notes:
      '용인대 산출 방식으로 계산한 등급평균 기준 우디필름캠퍼스 내부 지원 기준. ' +
      '4.0 이내는 지원 가능(안정), 4.0~4.5는 도전, 4.5 초과는 위험. ' +
      '실기 70% 비중으로 내신 영향은 제한적이며 최종 판단은 원장 상담 권장.',
    points: [
      {
        metric: 'grade_mean_with_career',
        label: '지원 가능 기준 (≤ 4.0)',
        percentile: null,
        pointKind: 'custom',
        value: 4.0,
        confidence: 'medium',
        isEstimated: true,
      },
      {
        metric: 'grade_mean_with_career',
        label: '도전 기준 (≤ 4.5)',
        percentile: null,
        pointKind: 'custom',
        value: 4.5,
        confidence: 'medium',
        isEstimated: true,
      },
    ],
  },

  // ───────────── 용인대 영화영상학과 기회균형 특별전형 2027 ─────────────
  // 일반학생과 동일 산식·동일 내부 기준 적용.
  'yongin-2027-silgi-film-opportunity': {
    key: 'yongin-2027-silgi-film-opportunity',
    version: 1,
    sourceYear: 2026,
    sourceType: 'estimated_by_staff',
    notes:
      '용인대 일반학생과 동일 산식·내부 기준(기회균형 특별전형). ' +
      '4.0 이내 지원 가능, 4.0~4.5 도전, 4.5 초과 위험. 최종 판단은 원장 상담 권장.',
    points: [
      {
        metric: 'grade_mean_with_career',
        label: '지원 가능 기준 (≤ 4.0)',
        percentile: null,
        pointKind: 'custom',
        value: 4.0,
        confidence: 'medium',
        isEstimated: true,
      },
      {
        metric: 'grade_mean_with_career',
        label: '도전 기준 (≤ 4.5)',
        percentile: null,
        pointKind: 'custom',
        value: 4.5,
        confidence: 'medium',
        isEstimated: true,
      },
    ],
  },

  // ───────────── 성결대 영화영상학과 실기우수자 2027 ─────────────
  // 출처: 성결대 입학처 수시모집 최종합격자 입시결과표(2025·2026). 70% Cut 등급 기준.
  'sungkyul-2027-silgi-film': {
    key: 'sungkyul-2027-silgi-film',
    version: 1,
    sourceYear: 2026,
    sourceType: 'university_official',
    applicants: 1034,
    competitionRate: 44.96,
    notes:
      '성결대 입학처 수시모집 최종합격자 입시결과표 기준 영화영상학과 실기우수자 입결. ' +
      '2025: 모집 23명 · 지원 598명 · 경쟁률 26.00:1 · 70%컷 6.6등급 · 예비 8번. ' +
      '2026: 모집 23명 · 지원 1,034명 · 경쟁률 44.96:1 · 70%컷 6.2등급 · 예비 14번. ' +
      '※ 실기 80% 비중으로 70%컷이 6.2~6.6등급까지 형성 → 내신 등급은 사실상 전 등급 지원 가능 수준, 실기 결정력이 큼.',
    points: [
      {
        metric: 'grade_mean_with_career',
        label: '70% Cut (2025)',
        percentile: 70,
        pointKind: 'percentile',
        value: 6.6,
        confidence: 'medium',
        isEstimated: false,
      },
      {
        metric: 'grade_mean_with_career',
        label: '70% Cut (2026)',
        percentile: 70,
        pointKind: 'percentile',
        value: 6.2,
        confidence: 'medium',
        isEstimated: false,
      },
    ],
  },

  // ───────────── 순천향대 공연영상학과 영화영상연출제작 실기우수자 2027 ─────────────
  // 출처: 순천향대 입학처 2026학년도 수시모집 입시결과(대입전형결과 PDF). 합격 평균·최저등급 기준.
  'soonchunhyang-2027-silgi-film-direction': {
    key: 'soonchunhyang-2027-silgi-film-direction',
    version: 1,
    sourceYear: 2026,
    sourceType: 'university_official',
    applicants: 105,
    competitionRate: 10.5,
    lastAdmitNo: 9,
    notes:
      '순천향대 입학처 2026학년도 수시모집 입시결과 기준 공연영상학과(영화영상연출제작) 실기우수자 입결. ' +
      '2026: 모집 10명 · 지원 105명 · 경쟁률 10.50:1 · 학생부등급 평균 5.09 · 최저 6.50 · 추합 9번. ' +
      '※ 학생부등급은 진로선택 미반영·2027학년도 반영방식 적용. 실기 80% 비중으로 등급 영향은 보조적. 2026 단년도 자료.',
    points: [
      {
        metric: 'grade_mean_with_career',
        label: '합격자 평균등급 (2026)',
        percentile: null,
        pointKind: 'mean',
        value: 5.09,
        confidence: 'medium',
        isEstimated: false,
      },
      {
        metric: 'grade_mean_with_career',
        label: '합격자 최저등급 (2026)',
        percentile: null,
        pointKind: 'worst',
        value: 6.5,
        confidence: 'medium',
        isEstimated: false,
      },
    ],
  },

  // ───────────── 호서대 문화영상학부(영상미디어트랙) 실기전형 2027 ─────────────
  // 출처: 호서대 입학처 모집요강 부록 '2026학년도 수시 입시결과'(p.64). 등록 평균·80%컷 기준.
  'hoseo-2027-silgi-media-track': {
    key: 'hoseo-2027-silgi-media-track',
    version: 1,
    sourceYear: 2026,
    sourceType: 'university_official',
    applicants: 88,
    competitionRate: 3.52,
    lastAdmitNo: 22,
    notes:
      '호서대 입학처 모집요강 부록(2026학년도 수시 입시결과) 기준 문화영상학부 실기전형 입결. ' +
      '2026: 모집 25명 · 지원 88명 · 경쟁률 3.52:1 · 등록 평균 4.08등급 · 80%컷 5.2등급 · 추합 22번. ' +
      '※ 영상미디어·문화콘텐츠기획 트랙 합산. 실기 80% 비중으로 등급 영향은 보조적. 2026 단년도(모집요강 부록) 자료.',
    points: [
      {
        metric: 'grade_mean_with_career',
        label: '등록자 평균등급 (2026)',
        percentile: null,
        pointKind: 'mean',
        value: 4.08,
        confidence: 'medium',
        isEstimated: false,
      },
      {
        metric: 'grade_mean_with_career',
        label: '80% Cut (2026)',
        percentile: 80,
        pointKind: 'percentile',
        value: 5.2,
        confidence: 'medium',
        isEstimated: false,
      },
    ],
  },
}

export function getCutPreset(programKey: string): CutPreset | null {
  return CUT_PRESETS[programKey] ?? null
}
