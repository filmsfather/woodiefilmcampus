/**
 * 프리셋 진입점. data 레이어와 분석 엔진은 여기서만 import.
 *
 * 분석 가능 단위는 "활성 산식 + 활성 컷"이 모두 있는 모집단위입니다.
 */

import {
  CUT_PRESETS,
  getCutPreset,
  type CutPreset,
} from './cuts'
import {
  FORMULA_PRESETS,
  getFormulaPreset,
  type FormulaPreset,
} from './formulas'
import {
  PROGRAM_PRESETS,
  getProgramPreset,
  listProgramPresetsByUniversity,
  type ProgramPreset,
} from './programs'
import {
  UNIVERSITY_PRESETS,
  getUniversityPreset,
  type UniversityPreset,
} from './universities'
import {
  PROGRAM_ANALYSIS_OVERRIDES,
  listProgramsForAnalysis,
  resolveAnalysisMode,
  type ProgramAnalysisMode,
  type ProgramForAnalysis,
} from './analysis'

export type {
  CutPreset,
  FormulaPreset,
  ProgramPreset,
  UniversityPreset,
  ProgramAnalysisMode,
  ProgramForAnalysis,
}

export {
  CUT_PRESETS,
  FORMULA_PRESETS,
  PROGRAM_PRESETS,
  UNIVERSITY_PRESETS,
  PROGRAM_ANALYSIS_OVERRIDES,
  getCutPreset,
  getFormulaPreset,
  getProgramPreset,
  getUniversityPreset,
  listProgramPresetsByUniversity,
  listProgramsForAnalysis,
  resolveAnalysisMode,
}

/**
 * 모집단위 + 활성 산식/컷을 한 번에 묶어서 반환. 분석 엔진의 입력으로 사용.
 * 산식 또는 컷이 비어있어도 포함하지만, hasFormula/hasCut 플래그를 함께 제공한다.
 */
export interface ProgramWithPolicy {
  program: ProgramPreset
  formula: FormulaPreset | null
  cut: CutPreset | null
}

export function listAllProgramsWithPolicy(): ProgramWithPolicy[] {
  return PROGRAM_PRESETS.map((program) => ({
    program,
    formula: getFormulaPreset(program.key),
    cut: getCutPreset(program.key),
  }))
}

/**
 * 분석 가능한(산식 + 컷이 모두 있는) 모집단위만 필터링.
 */
export function listAnalyzablePrograms(): Array<{
  program: ProgramPreset
  formula: FormulaPreset
  cut: CutPreset
}> {
  const out: Array<{ program: ProgramPreset; formula: FormulaPreset; cut: CutPreset }> = []
  for (const program of PROGRAM_PRESETS) {
    const formula = getFormulaPreset(program.key)
    const cut = getCutPreset(program.key)
    if (!formula || !cut) continue
    out.push({ program, formula, cut })
  }
  return out
}

export function getProgramWithPolicy(programKey: string): ProgramWithPolicy | null {
  const program = getProgramPreset(programKey)
  if (!program) return null
  return {
    program,
    formula: getFormulaPreset(programKey),
    cut: getCutPreset(programKey),
  }
}
