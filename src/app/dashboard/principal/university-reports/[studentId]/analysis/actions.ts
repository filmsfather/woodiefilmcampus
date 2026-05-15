'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { getAuthContext } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { evaluateMetricsForSnapshot } from '@/lib/university-policy/calculator'
import { hashSnapshotCourses } from '@/lib/university-policy/hash'
import { listAnalyzablePrograms } from '@/lib/university-policy/presets'
import type { StudentMetrics } from '@/lib/university-policy/types'
import { buildVerdicts } from '@/lib/university-policy/verdict'
import { fetchCoursesForSnapshot } from '@/lib/university-report/data'

const runAnalysisSchema = z.object({
  studentId: z.string().uuid(),
})

export type RunAnalysisResult =
  | {
      success: true
      snapshotId: string
      evaluatedCount: number
      skipped: number
    }
  | { error: string }

/**
 * 학생 활성 snapshot에 대해 모든 (program_key, formula, cut) 프리셋을 평가해
 * metric_cache + evaluations에 저장한다. 캐시가 stale인 경우만 재계산.
 *
 * 산식·컷은 `src/lib/university-policy/presets/`에서만 가져옵니다.
 * formula_key/program_key/cut_key는 모두 `programKey`와 동일하게 사용합니다.
 */
export async function runAnalysisAction(payload: unknown): Promise<RunAnalysisResult> {
  const { profile } = await getAuthContext()
  if (!profile) return { error: '로그인이 필요합니다.' }
  if (profile.role !== 'principal') return { error: '원장만 실행할 수 있습니다.' }

  const parsed = runAnalysisSchema.safeParse(payload)
  if (!parsed.success) return { error: '잘못된 요청입니다.' }

  const supabase = createAdminClient()

  const { data: snapshot, error: snapError } = await supabase
    .from('university_report_snapshots')
    .select('id, status')
    .eq('student_id', parsed.data.studentId)
    .not('status', 'in', '("archived","failed")')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (snapError) {
    console.error('[analysis] snapshot fetch error', snapError)
    return { error: '학생 성적증명서 정보를 가져오지 못했습니다.' }
  }
  if (!snapshot || snapshot.status !== 'parsed') {
    return { error: '분석 가능한 성적증명서가 없습니다. 먼저 성적증명서를 업로드해 주세요.' }
  }

  const snapshotId = snapshot.id
  const courses = await fetchCoursesForSnapshot(snapshotId)
  if (courses.length === 0) {
    return { error: '추출된 과목 정보가 없어 분석을 실행할 수 없습니다.' }
  }
  const contentHash = hashSnapshotCourses(courses)

  const analyzable = listAnalyzablePrograms()
  if (analyzable.length === 0) {
    return {
      error:
        '분석 대상 모집단위가 없습니다. presets/formulas.ts와 presets/cuts.ts에 데이터를 채워주세요.',
    }
  }

  const formulaKeys = Array.from(new Set(analyzable.map((a) => a.formula.key)))
  const { data: existingCaches } = await supabase
    .from('university_report_metric_cache')
    .select('id, formula_key, formula_version, snapshot_content_hash, metrics, warnings')
    .eq('snapshot_id', snapshotId)
    .in('formula_key', formulaKeys)

  const cacheByFormulaKey = new Map<
    string,
    { id: string; metrics: StudentMetrics; warnings: string[] | null }
  >()

  const formulaByKey = new Map(analyzable.map((a) => [a.formula.key, a.formula]))

  for (const row of existingCaches ?? []) {
    const fKey = row.formula_key as string
    const formula = formulaByKey.get(fKey)
    if (!formula) continue
    if (
      row.formula_version === formula.version &&
      row.snapshot_content_hash === contentHash
    ) {
      cacheByFormulaKey.set(fKey, {
        id: row.id,
        metrics: row.metrics as StudentMetrics,
        warnings: (row.warnings as string[] | null) ?? null,
      })
    }
  }

  for (const formula of formulaByKey.values()) {
    if (cacheByFormulaKey.has(formula.key)) continue
    const metrics = evaluateMetricsForSnapshot(courses, formula.spec)
    const { data: upserted, error: upsertError } = await supabase
      .from('university_report_metric_cache')
      .upsert(
        {
          snapshot_id: snapshotId,
          formula_key: formula.key,
          formula_version: formula.version,
          snapshot_content_hash: contentHash,
          metrics,
          warnings: metrics.warnings.length > 0 ? metrics.warnings : null,
        },
        { onConflict: 'snapshot_id,formula_key' }
      )
      .select('id')
      .single()
    if (upsertError || !upserted) {
      console.error('[analysis] metric_cache upsert error', upsertError)
      continue
    }
    cacheByFormulaKey.set(formula.key, {
      id: upserted.id,
      metrics,
      warnings: metrics.warnings,
    })
  }

  let evaluatedCount = 0
  let skipped = 0

  for (const { program, formula, cut } of analyzable) {
    const cache = cacheByFormulaKey.get(formula.key)
    if (!cache) {
      skipped += 1
      continue
    }

    const { data: existingEval } = await supabase
      .from('university_report_evaluations')
      .select('id, formula_version, cut_version, snapshot_content_hash')
      .eq('snapshot_id', snapshotId)
      .eq('program_key', program.key)
      .maybeSingle()

    if (
      existingEval &&
      existingEval.formula_version === formula.version &&
      existingEval.cut_version === cut.version &&
      existingEval.snapshot_content_hash === contentHash
    ) {
      skipped += 1
      continue
    }

    const verdicts = buildVerdicts(cache.metrics, cut.points)
    const warnings = [
      ...(cache.warnings ?? []),
      ...(cut.points.length === 0 ? ['이 모집단위는 컷이 등록되어 있지 않습니다.'] : []),
    ]

    const { error: evalError } = await supabase
      .from('university_report_evaluations')
      .upsert(
        {
          snapshot_id: snapshotId,
          program_key: program.key,
          formula_key: formula.key,
          cut_key: cut.key,
          metric_cache_id: cache.id,
          formula_version: formula.version,
          cut_version: cut.version,
          snapshot_content_hash: contentHash,
          verdicts,
          metrics_snapshot: cache.metrics,
          warnings: warnings.length > 0 ? warnings : null,
          computed_at: new Date().toISOString(),
        },
        { onConflict: 'snapshot_id,program_key' }
      )

    if (evalError) {
      console.error('[analysis] evaluations upsert error', evalError)
      skipped += 1
      continue
    }
    evaluatedCount += 1
  }

  revalidatePath(`/dashboard/principal/university-reports/${parsed.data.studentId}`)
  revalidatePath(`/dashboard/principal/university-reports/${parsed.data.studentId}/analysis`)

  return { success: true, snapshotId, evaluatedCount, skipped }
}
