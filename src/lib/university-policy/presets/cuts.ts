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
}

export function getCutPreset(programKey: string): CutPreset | null {
  return CUT_PRESETS[programKey] ?? null
}
