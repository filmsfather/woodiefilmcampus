'use server'

import { randomUUID } from 'crypto'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { getAuthContext } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { evaluateMetricsForSnapshot } from '@/lib/university-policy/calculator'
import { hashSnapshotCourses } from '@/lib/university-policy/hash'
import { listProgramsForAnalysis } from '@/lib/university-policy/presets'
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

  const programs = listProgramsForAnalysis()
  if (programs.length === 0) {
    return {
      error:
        '분석 대상 모집단위가 없습니다. presets/programs.ts에 데이터를 채워주세요.',
    }
  }

  // 산식이 있는 모집단위(grade_cut · always_open)는 metric 캐시를 사용한다.
  const formulaByKey = new Map(
    programs
      .filter((p) => p.formula)
      .map((p) => [p.formula!.key, p.formula!] as const)
  )
  const formulaKeys = Array.from(formulaByKey.keys())

  const cacheByFormulaKey = new Map<
    string,
    { id: string; metrics: StudentMetrics; warnings: string[] | null }
  >()

  if (formulaKeys.length > 0) {
    const { data: existingCaches } = await supabase
      .from('university_report_metric_cache')
      .select('id, formula_key, formula_version, snapshot_content_hash, metrics, warnings')
      .eq('snapshot_id', snapshotId)
      .in('formula_key', formulaKeys)

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
  }

  let evaluatedCount = 0
  let skipped = 0

  for (const { program, mode, formula, cut } of programs) {
    const cache = formula ? cacheByFormulaKey.get(formula.key) ?? null : null

    // grade_cut인데 캐시 산출에 실패했으면 건너뛴다.
    if (mode === 'grade_cut' && (!formula || !cut || !cache)) {
      skipped += 1
      continue
    }

    const formulaKey = formula?.key ?? ''
    const formulaVersion = formula?.version ?? 0
    const cutKey = mode === 'grade_cut' && cut ? cut.key : ''
    const cutVersion = mode === 'grade_cut' && cut ? cut.version : 0

    const { data: existingEval } = await supabase
      .from('university_report_evaluations')
      .select('id, formula_version, cut_version, snapshot_content_hash')
      .eq('snapshot_id', snapshotId)
      .eq('program_key', program.key)
      .maybeSingle()

    if (
      existingEval &&
      existingEval.formula_version === formulaVersion &&
      existingEval.cut_version === cutVersion &&
      existingEval.snapshot_content_hash === contentHash
    ) {
      skipped += 1
      continue
    }

    // 모드별 verdict / metrics 구성.
    //  - grade_cut   : 산식 결과를 컷과 비교한 판정
    //  - always_open : 전 등급 지원 가능(판정은 표시 단계에서 결정), metrics는 참고용
    //  - consult     : 산식 없음 → 빈 verdict, metrics 없음
    const verdicts =
      mode === 'grade_cut' && cache && cut ? buildVerdicts(cache.metrics, cut.points) : []
    const metricsSnapshot = mode === 'consult' ? null : cache?.metrics ?? null
    const warnings =
      mode === 'grade_cut' && cache
        ? [
            ...(cache.warnings ?? []),
            ...(cut && cut.points.length === 0
              ? ['이 모집단위는 컷이 등록되어 있지 않습니다.']
              : []),
          ]
        : []

    const { error: evalError } = await supabase
      .from('university_report_evaluations')
      .upsert(
        {
          snapshot_id: snapshotId,
          program_key: program.key,
          formula_key: formulaKey,
          cut_key: cutKey,
          metric_cache_id: cache?.id ?? null,
          formula_version: formulaVersion,
          cut_version: cutVersion,
          snapshot_content_hash: contentHash,
          verdicts,
          metrics_snapshot: metricsSnapshot,
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

// ----- 학생·학부모 공개(발행) ------------------------------------------------

const publishReportSchema = z.object({
  studentId: z.string().uuid(),
  comment: z.string().trim().max(2000).optional(),
})

const revokeReportSchema = z.object({
  publicationId: z.string().uuid(),
  studentId: z.string().uuid(),
})

export type PublishReportResult = { success: true; publicationId: string } | { error: string }
export type RevokeReportResult = { success: true } | { error: string }

function generateShareToken(): string {
  return `${randomUUID()}${randomUUID()}`.replace(/-/g, '')
}

/**
 * 원장이 학생의 활성 snapshot 분석 결과를 학생·학부모에게 공개(발행)한다.
 * 평가가 1건 이상 존재할 때만 발행 가능하며, 학생당 published 1개를 유지한다(재발행 시 갱신).
 */
export async function publishReportAction(payload: unknown): Promise<PublishReportResult> {
  const { profile } = await getAuthContext()
  if (!profile) return { error: '로그인이 필요합니다.' }
  if (profile.role !== 'principal') return { error: '원장만 공개할 수 있습니다.' }

  const parsed = publishReportSchema.safeParse(payload)
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
    console.error('[publish-report] snapshot fetch error', snapError)
    return { error: '학생 성적증명서 정보를 가져오지 못했습니다.' }
  }
  if (!snapshot || snapshot.status !== 'parsed') {
    return { error: '분석 가능한 성적증명서가 없습니다.' }
  }

  const { count: evalCount, error: countError } = await supabase
    .from('university_report_evaluations')
    .select('id', { count: 'exact', head: true })
    .eq('snapshot_id', snapshot.id)

  if (countError) {
    console.error('[publish-report] evaluation count error', countError)
    return { error: '분석 결과를 확인하지 못했습니다.' }
  }
  if (!evalCount || evalCount === 0) {
    return { error: '먼저 분석을 실행해 결과를 만든 뒤 공개할 수 있습니다.' }
  }

  // 기존 published 행이 있으면 취소 처리해 partial unique 제약을 비운다.
  const { error: revokeExistingError } = await supabase
    .from('university_report_publications')
    .update({ status: 'revoked', revoked_at: new Date().toISOString() })
    .eq('student_id', parsed.data.studentId)
    .eq('status', 'published')

  if (revokeExistingError) {
    console.error('[publish-report] revoke existing error', revokeExistingError)
    return { error: '기존 공개 정보를 정리하지 못했습니다.' }
  }

  const { data: inserted, error: insertError } = await supabase
    .from('university_report_publications')
    .insert({
      snapshot_id: snapshot.id,
      student_id: parsed.data.studentId,
      published_by: profile.id,
      share_token: generateShareToken(),
      principal_comment: parsed.data.comment && parsed.data.comment.length > 0 ? parsed.data.comment : null,
      status: 'published',
      published_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (insertError || !inserted) {
    console.error('[publish-report] insert error', insertError)
    return { error: '공개에 실패했습니다.' }
  }

  revalidatePath(`/dashboard/principal/university-reports/${parsed.data.studentId}/analysis`)
  revalidatePath('/dashboard/student/university-report/analysis')

  return { success: true, publicationId: inserted.id }
}

const publishManualReportSchema = z.object({
  studentId: z.string().uuid(),
  comment: z.string().trim().min(1, '학생에게 전달할 코멘트를 입력해주세요.').max(2000),
})

/**
 * 성적증명서가 없는 학생(검정고시 등)을 위해 원장이 코멘트만으로 리포트를 발행한다.
 * 분석 데이터(snapshot/evaluations) 없이 코멘트 기반으로 학생·학부모에게 공개한다.
 */
export async function publishManualReportAction(payload: unknown): Promise<PublishReportResult> {
  const { profile } = await getAuthContext()
  if (!profile) return { error: '로그인이 필요합니다.' }
  if (profile.role !== 'principal') return { error: '원장만 공개할 수 있습니다.' }

  const parsed = publishManualReportSchema.safeParse(payload)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? '잘못된 요청입니다.' }
  }

  const supabase = createAdminClient()

  // 기존 published 행이 있으면 취소 처리해 partial unique 제약을 비운다.
  const { error: revokeExistingError } = await supabase
    .from('university_report_publications')
    .update({ status: 'revoked', revoked_at: new Date().toISOString() })
    .eq('student_id', parsed.data.studentId)
    .eq('status', 'published')

  if (revokeExistingError) {
    console.error('[publish-manual-report] revoke existing error', revokeExistingError)
    return { error: '기존 공개 정보를 정리하지 못했습니다.' }
  }

  const { data: inserted, error: insertError } = await supabase
    .from('university_report_publications')
    .insert({
      snapshot_id: null,
      student_id: parsed.data.studentId,
      published_by: profile.id,
      share_token: generateShareToken(),
      principal_comment: parsed.data.comment,
      status: 'published',
      published_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (insertError || !inserted) {
    console.error('[publish-manual-report] insert error', insertError)
    return { error: '공개에 실패했습니다.' }
  }

  revalidatePath(`/dashboard/principal/university-reports/${parsed.data.studentId}`)
  revalidatePath(`/dashboard/principal/university-reports/${parsed.data.studentId}/analysis`)
  revalidatePath('/dashboard/student/university-report')
  revalidatePath('/dashboard/student/university-report/analysis')

  return { success: true, publicationId: inserted.id }
}

/**
 * 발행된 리포트를 비공개(revoked) 처리한다.
 */
export async function revokeReportAction(payload: unknown): Promise<RevokeReportResult> {
  const { profile } = await getAuthContext()
  if (!profile) return { error: '로그인이 필요합니다.' }
  if (profile.role !== 'principal') return { error: '원장만 비공개할 수 있습니다.' }

  const parsed = revokeReportSchema.safeParse(payload)
  if (!parsed.success) return { error: '잘못된 요청입니다.' }

  const supabase = createAdminClient()
  const { error } = await supabase
    .from('university_report_publications')
    .update({ status: 'revoked', revoked_at: new Date().toISOString() })
    .eq('id', parsed.data.publicationId)
    .eq('status', 'published')

  if (error) {
    console.error('[revoke-report] update error', error)
    return { error: '비공개 처리에 실패했습니다.' }
  }

  revalidatePath(`/dashboard/principal/university-reports/${parsed.data.studentId}/analysis`)
  revalidatePath('/dashboard/student/university-report/analysis')

  return { success: true }
}
