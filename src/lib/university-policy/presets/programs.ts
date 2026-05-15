/**
 * 모집단위 프리셋. (universityId × year × admissionTrack × name) 단위로 1개 row.
 *
 * key 명명 규칙: <universityId>-<year>-<track-slug>-<program-slug>
 *   예) 'sejong-2026-silgi-film-direction'
 *
 * 1차에선 reference 1~2개만 채우고 나머지는 사용자가 직접 추가하세요.
 * 모든 필드는 선택적이지만 universityId / year / admissionTrack / name 은 필수.
 */

export interface ProgramPreset {
  key: string
  universityId: string
  year: number
  admissionTrack: string
  name: string
  trackCode?: string
  recruitCount?: number
  totalScore?: number
  notes?: string
}

export const PROGRAM_PRESETS: readonly ProgramPreset[] = [
  // ───────────── 세종대학교 (reference) ─────────────
  {
    key: 'sejong-2026-silgi-film-direction',
    universityId: 'sejong',
    year: 2026,
    admissionTrack: '실기우수자',
    name: '영화예술학과-연출제작',
    recruitCount: 12,
    totalScore: 1000,
    notes: '예체능 표준 (국어·영어, 80/20, 1000점) 가정. 실측 수치로 교체 필요.',
  },
  // ───────────── 서경대학교 (reference) ─────────────
  {
    key: 'seokyeong-2026-silgi-film',
    universityId: 'seokyeong',
    year: 2026,
    admissionTrack: '실기우수자',
    name: '영화영상학과',
    recruitCount: 20,
    totalScore: 1000,
    notes: '70/100 컷 동시 제공 (등급+점수) 케이스 가정.',
  },
  // ───────────── 한국예술종합학교 영상원 영화과 (2027) ─────────────
  {
    key: 'karts-2027-ilban-film',
    universityId: 'karts',
    year: 2027,
    admissionTrack: '일반전형',
    name: '영상원 영화과',
    recruitCount: 30,
    totalScore: 100,
    notes:
      '11월입시. 1차: 글쓰기 테스트 80 + 고교내신 20 / 2차: 이야기 구성 60 + 구술 40. ' +
      '내신 학년별 반영비율 20:40:40 (2027.2 졸업예정자는 3학년 1학기까지만 반영). ' +
      '실제 환산은 9→1점 역등급 + 32분위 매핑 방식(요강 p.74). 시험과목 1개라도 결시 시 불합격.',
  },
  {
    key: 'karts-2027-tukbyeol-film-foreign-language',
    universityId: 'karts',
    year: 2027,
    admissionTrack: '특별전형(외국어성적우수자)',
    name: '영상원 영화과',
    recruitCount: 9,
    totalScore: 100,
    notes:
      '8월입시. 지원자격(2024.1.1 이후 성적, 단일회차): TOEFL iBT 102 / NEW TEPS 419(600점) / TOEIC 900 / HSK 6급 / JLPT N1급 중 하나. ' +
      '1차: 논술 50 + 구술 50. 학생부 내신 미반영(시험성적 100%). 분석 대상이 아닌 자격 충족형 전형.',
  },
  {
    key: 'karts-2027-tukbyeol-film-art-talent',
    universityId: 'karts',
    year: 2027,
    admissionTrack: '특별전형(영상예술특기자)',
    name: '영상원 영화과',
    recruitCount: 6,
    totalScore: 100,
    notes:
      '8월입시. 지원자격: 2019.1.1 이후 개최된 지정 영화제·공모전 3등 이내 수상자(연출/촬영 단독 또는 2인 공동 한정) 또는 사진부문 지정 공모전 선정 작가. ' +
      '예비심사(고교내신 20 + 서류 80) → 1차(논술 50 + 구술 50). 작품 USB·작품설명서·풀트리트먼트 제출 필요.',
  },
  // 추가 프리셋은 위 패턴을 따라 자유롭게 추가하세요.
] as const

export function getProgramPreset(key: string): ProgramPreset | null {
  return PROGRAM_PRESETS.find((p) => p.key === key) ?? null
}

export function listProgramPresetsByUniversity(
  universityId: string
): ProgramPreset[] {
  return PROGRAM_PRESETS.filter((p) => p.universityId === universityId)
}
