/**
 * 대학 정책/평가 관련 조회 헬퍼.
 *
 * - 대학·모집단위·산식·컷은 모두 코드 프리셋(`./presets/`)에서 가져옵니다.
 *   DB에는 정책 데이터가 더 이상 존재하지 않습니다(102 → 103 마이그레이션으로 제거).
 * - DB에서 가져오는 것은 학생 분석 결과 캐시(metric_cache, evaluations) 뿐입니다.
 */

import type { PostgrestError } from '@supabase/supabase-js'

import { createAdminClient } from '@/lib/supabase/admin'
import {
  CUT_PRESETS,
  FORMULA_PRESETS,
  PROGRAM_PRESETS,
  UNIVERSITY_PRESETS,
  getCutPreset,
  getFormulaPreset,
  getProgramPreset,
  getProgramWithPolicy,
  getUniversityPreset,
  listAllProgramsWithPolicy,
  listAnalyzablePrograms,
  listProgramPresetsByUniversity,
  resolveAnalysisMode,
  type CutPreset,
  type FormulaPreset,
  type ProgramAnalysisMode,
  type ProgramPreset,
  type ProgramWithPolicy,
  type UniversityPreset,
} from '@/lib/university-policy/presets'
import {
  CUTOFF_METRIC_LABELS,
  CUTOFF_METRIC_LOWER_IS_BETTER,
  type CutSourceType,
  type CutoffMetric,
  type MetricVerdict,
  type StudentMetrics,
  type VerdictTier,
} from '@/lib/university-policy/types'

function logSupabaseError(scope: string, error: PostgrestError | null | undefined) {
  if (!error) return
  console.error(`[university-policy] ${scope}`, {
    message: error.message,
    code: error.code,
    details: error.details,
    hint: error.hint,
  })
}

// ----- 프리셋 단순 패스스루 (호출부 가독성) ---------------------------------

export function fetchUniversities(): UniversityPreset[] {
  return [...UNIVERSITY_PRESETS]
}

export function fetchUniversity(id: string): UniversityPreset | null {
  return getUniversityPreset(id)
}

export function fetchProgramsByUniversity(universityId: string): ProgramPreset[] {
  return listProgramPresetsByUniversity(universityId)
}

export function fetchProgram(programKey: string): ProgramPreset | null {
  return getProgramPreset(programKey)
}

export function fetchActiveFormulaByProgram(programKey: string): FormulaPreset | null {
  return getFormulaPreset(programKey)
}

export function fetchActiveCutByProgram(programKey: string): CutPreset | null {
  return getCutPreset(programKey)
}

export function fetchProgramPolicy(programKey: string): ProgramWithPolicy | null {
  return getProgramWithPolicy(programKey)
}

export function fetchAllProgramsWithPolicy(): ProgramWithPolicy[] {
  return listAllProgramsWithPolicy()
}

export function fetchAnalyzablePrograms(): Array<{
  program: ProgramPreset
  formula: FormulaPreset
  cut: CutPreset
}> {
  return listAnalyzablePrograms()
}

// ----- 평가 결과(DB 캐시) 조회 ---------------------------------------------

export interface EvaluationListRow {
  id: string
  programKey: string
  formulaKey: string
  cutKey: string
  formulaVersion: number
  cutVersion: number
  verdicts: MetricVerdict[]
  metricsSnapshot: StudentMetrics | null
  warnings: string[] | null
  computedAt: string
  // 프리셋 조인 (없으면 빈 문자열)
  universityId: string
  universityName: string
  programName: string
  programYear: number
  programTrack: string
  programTotalScore: number | null
  cutSourceType: CutSourceType
  // 분석 방식 (grade_cut: 컷 비교 / always_open: 전 등급 지원 가능 / consult: 원장 문의)
  analysisMode: ProgramAnalysisMode
}

interface EvaluationRow {
  id: string
  program_key: string
  formula_key: string
  cut_key: string
  formula_version: number
  cut_version: number
  verdicts: MetricVerdict[]
  metrics_snapshot: StudentMetrics | null
  warnings: string[] | null
  computed_at: string
}

export async function fetchEvaluationsForSnapshot(
  snapshotId: string
): Promise<EvaluationListRow[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('university_report_evaluations')
    .select(
      'id, program_key, formula_key, cut_key, formula_version, cut_version, verdicts, metrics_snapshot, warnings, computed_at'
    )
    .eq('snapshot_id', snapshotId)
    .order('computed_at', { ascending: false })

  if (error || !data) {
    logSupabaseError('fetchEvaluationsForSnapshot', error)
    return []
  }

  return (data as EvaluationRow[]).map((e) => {
    const program = getProgramPreset(e.program_key)
    const cut = getCutPreset(e.cut_key)
    const university = program ? getUniversityPreset(program.universityId) : null
    return {
      id: e.id,
      programKey: e.program_key,
      formulaKey: e.formula_key,
      cutKey: e.cut_key,
      formulaVersion: e.formula_version,
      cutVersion: e.cut_version,
      verdicts: e.verdicts,
      metricsSnapshot: e.metrics_snapshot,
      warnings: e.warnings,
      computedAt: e.computed_at,
      universityId: program?.universityId ?? '',
      universityName: university?.name ?? '',
      programName: program?.name ?? e.program_key,
      programYear: program?.year ?? 0,
      programTrack: program?.admissionTrack ?? '',
      programTotalScore: program?.totalScore ?? null,
      cutSourceType: cut?.sourceType ?? 'university_official',
      analysisMode: resolveAnalysisMode(e.program_key),
    }
  })
}

/**
 * 학생 metric 캐시 1건 조회 (verify 페이지에서 직접 계산하지 않고 캐시를 보조로 쓰고 싶을 때).
 */
export async function fetchMetricCache(
  snapshotId: string,
  formulaKey: string
): Promise<{
  formulaVersion: number
  snapshotContentHash: string
  metrics: StudentMetrics
  computedAt: string
} | null> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('university_report_metric_cache')
    .select('formula_version, snapshot_content_hash, metrics, computed_at')
    .eq('snapshot_id', snapshotId)
    .eq('formula_key', formulaKey)
    .maybeSingle()

  if (error) {
    logSupabaseError('fetchMetricCache', error)
    return null
  }
  if (!data) return null
  return {
    formulaVersion: data.formula_version,
    snapshotContentHash: data.snapshot_content_hash,
    metrics: data.metrics as StudentMetrics,
    computedAt: data.computed_at,
  }
}

// ----- helper: tier 라벨/색상 (UI용) -----------------------------------------

export const VERDICT_TIER_BADGE: Record<
  VerdictTier,
  { label: string; className: string }
> = {
  safe: { label: '안정', className: 'bg-emerald-100 text-emerald-700' },
  fit: { label: '적정', className: 'bg-sky-100 text-sky-700' },
  reach: { label: '도전', className: 'bg-amber-100 text-amber-800' },
  risk: { label: '위험', className: 'bg-rose-100 text-rose-700' },
  unfit: { label: '부적합', className: 'bg-slate-200 text-slate-600' },
  consult: { label: '원장 문의', className: 'bg-violet-100 text-violet-700' },
  unknown: { label: '판정 불가', className: 'bg-slate-100 text-slate-500' },
}

export function metricLabel(metric: CutoffMetric): string {
  return CUTOFF_METRIC_LABELS[metric]
}

export function metricLowerIsBetter(metric: CutoffMetric): boolean {
  return CUTOFF_METRIC_LOWER_IS_BETTER[metric]
}

// ----- export presets passthrough (UI에서 직접 import 줄이기) -----------------

export {
  CUT_PRESETS,
  FORMULA_PRESETS,
  PROGRAM_PRESETS,
  UNIVERSITY_PRESETS,
}
