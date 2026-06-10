/**
 * 모집단위별 "분석 방식" 결정.
 *
 * 기존에는 (산식 + 컷)이 모두 있는 모집단위만 분석했지만, 실기 100% 전형이나
 * 정성평가(학종) 전형도 분석 결과에 노출해야 하므로 모드를 도입한다.
 *
 *  - grade_cut   : 산식으로 등급/점수를 산출하고 컷과 비교해 안정/도전/위험 판정.
 *                  (산식 + 컷이 모두 존재할 때 기본값)
 *  - always_open : 내신 영향이 미미하거나 실기 100%라 "전 등급 지원 가능"으로 안내.
 *  - consult     : 산식이 원천적으로 없는 정성평가(학종) 등. 분석에는 노출하되
 *                  지원 가능 여부는 원장에게 문의하도록 안내.
 *  - exclude     : 분석 목록에서 제외(중복 reference 등).
 *
 * 기본 규칙(override 미지정 시):
 *  - 산식 + 컷 모두 존재 → grade_cut
 *  - 그 외(산식만 있거나 둘 다 없음) → consult
 */

import { getCutPreset, type CutPreset } from './cuts'
import { getFormulaPreset, type FormulaPreset } from './formulas'
import { PROGRAM_PRESETS, type ProgramPreset } from './programs'

export type ProgramAnalysisMode = 'grade_cut' | 'always_open' | 'consult' | 'exclude'

/**
 * 기본 규칙과 다르게 처리할 모집단위만 등록한다.
 */
export const PROGRAM_ANALYSIS_OVERRIDES: Readonly<Record<string, ProgramAnalysisMode>> = {
  // ── 모든 등급 지원 가능 (내신 영향 미미 / 실기 100%) ──
  'suwon-2027-silgi-film': 'always_open', // 수원대: 모든 등급 지원 가능
  'daejin-2026-silgi-film': 'always_open', // 대진대: 모든 등급 지원 가능
  'seoularts-2026-ilban-film': 'always_open', // 서울예대: 모든 등급 지원 가능
  'mokwon-2027-silgi-film': 'always_open', // 목원대 실기전형: 실기 100%
  // 동아방송대·평택대: 전 모집단위를 모든 학생에게 안정(전 등급 지원 가능)으로 안내
  'dima-2026-silgi-film': 'always_open', // 동아방송대 수시1차(실기)
  'dima-2026-silgi-film-second': 'always_open', // 동아방송대 수시2차(실기)
  'pyeongtaek-2027-ptu-silgi-film': 'always_open', // 평택대 PTU실기: 실기 100%
  'pyeongtaek-2027-ptu-gyoga-film': 'always_open', // 평택대 PTU교과
  'baekseok-arts-2027-silgi-film-contents': 'always_open', // 백석예대 영화콘텐츠: 영상학부 묶음 모집·입결 미공개 → 모든 성적 지원 가능

  // ── 입시결과 컷 확보 → grade_cut (산식+컷 존재, override 없이도 grade_cut지만 의도 명시) ──
  // 'sungkyul-2027-silgi-film'             → 성결대 실기우수자(70%컷 6.2/6.6)
  // 'soonchunhyang-2027-silgi-film-direction' → 순천향대 영화영상연출제작(평균 5.09/최저 6.50)
  // 'hoseo-2027-silgi-media-track'         → 호서대 영상미디어트랙(평균 4.08/80%컷 5.2)

  // ── 산식 없음(정성평가 학종 등) → 원장 문의 ──
  // (산식이 없으면 기본 규칙으로도 consult지만, 의도를 명시적으로 표시)
  'kyunghee-2027-neorenaissance-film-direction': 'consult', // 경희대 네오르네상스(학종)
  'dongguk-2027-dodream-film': 'consult', // 동국대 Do Dream(학종)
  'dongguk-2027-gihoegyunhyeong-film': 'consult', // 동국대 기회균형(학종)
  'sangmyung-2027-sangmyungin-film-staff': 'consult', // 상명대 상명인재(학종)
  'sangmyung-2027-gihoegyunhyeong-film-staff': 'consult', // 상명대 기회균형(학종)
  'karts-2027-tukbyeol-film-foreign-language': 'consult', // 한예종 외국어성적우수자
  'karts-2027-tukbyeol-film-art-talent': 'consult', // 한예종 영상예술특기자
  'sungkyunkwan-2027-seonggyuninjae-acting-direction': 'consult', // 성균관대 연기예술학과(연출) 성균인재(학종)

  // ── 분석 목록 제외 (2026 reference 중복 — 2027 정식 모집단위 존재) ──
  'sejong-2026-silgi-film-direction': 'exclude',
  'seokyeong-2026-silgi-film': 'exclude',
}

/**
 * 모집단위 1개의 분석 모드를 결정한다.
 */
export function resolveAnalysisMode(programKey: string): ProgramAnalysisMode {
  const override = PROGRAM_ANALYSIS_OVERRIDES[programKey]
  if (override) return override

  const hasFormula = Boolean(getFormulaPreset(programKey))
  const hasCut = Boolean(getCutPreset(programKey))
  if (hasFormula && hasCut) return 'grade_cut'
  return 'consult'
}

export interface ProgramForAnalysis {
  program: ProgramPreset
  mode: Exclude<ProgramAnalysisMode, 'exclude'>
  formula: FormulaPreset | null
  cut: CutPreset | null
}

/**
 * 분석 결과에 노출할 모든 모집단위와 모드를 반환한다('exclude'는 제외).
 */
export function listProgramsForAnalysis(): ProgramForAnalysis[] {
  const out: ProgramForAnalysis[] = []
  for (const program of PROGRAM_PRESETS) {
    const mode = resolveAnalysisMode(program.key)
    if (mode === 'exclude') continue
    out.push({
      program,
      mode,
      formula: getFormulaPreset(program.key),
      cut: getCutPreset(program.key),
    })
  }
  return out
}
