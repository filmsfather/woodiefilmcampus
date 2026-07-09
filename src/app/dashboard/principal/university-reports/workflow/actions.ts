'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { getAuthContext } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { ensureFinalConfirmation } from '@/lib/university-confirmation/data'
import {
  notifyUniversityConsultOpinionRequest,
  notifyUniversityFinalConfirmationRequest,
  notifyUniversityPrincipalConfirmed,
  notifyUniversityReportWishReselect,
} from '@/lib/university-report/notifications'
import {
  publishReportAction,
  runAnalysisAction,
} from '@/app/dashboard/principal/university-reports/[studentId]/analysis/actions'

const bulkSchema = z.object({
  studentIds: z.array(z.string().uuid()).min(1, '학생을 선택해주세요.').max(200, '한 번에 처리할 수 있는 인원을 초과했습니다.'),
})

export interface BulkActionResult {
  ok: number
  failed: number
  errors: string[]
}

export type BulkResult = ({ success: true } & BulkActionResult) | { error: string }

/**
 * 선택한 학생들에 대해 성적 분석을 일괄 실행한다.
 * 내부적으로 단건 runAnalysisAction을 순차 호출하며(권한·검증은 단건 액션이 담당),
 * 성공/실패 건수와 대표 오류 메시지를 합산해 반환한다.
 */
export async function runBulkAnalysisAction(payload: unknown): Promise<BulkResult> {
  const { profile } = await getAuthContext()
  if (!profile) return { error: '로그인이 필요합니다.' }
  if (profile.role !== 'principal') return { error: '원장만 실행할 수 있습니다.' }

  const parsed = bulkSchema.safeParse(payload)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? '잘못된 요청입니다.' }
  }

  const result: BulkActionResult = { ok: 0, failed: 0, errors: [] }
  for (const studentId of parsed.data.studentIds) {
    const r = await runAnalysisAction({ studentId })
    if ('error' in r) {
      result.failed += 1
      if (!result.errors.includes(r.error)) result.errors.push(r.error)
    } else {
      result.ok += 1
    }
  }

  return { success: true, ...result }
}

/**
 * 선택한 학생들의 분석 결과를 일괄 발행(공개)한다.
 * 단건 publishReportAction을 순차 호출한다.
 */
export async function publishBulkReportAction(payload: unknown): Promise<BulkResult> {
  const { profile } = await getAuthContext()
  if (!profile) return { error: '로그인이 필요합니다.' }
  if (profile.role !== 'principal') return { error: '원장만 발행할 수 있습니다.' }

  const parsed = bulkSchema.safeParse(payload)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? '잘못된 요청입니다.' }
  }

  const result: BulkActionResult = { ok: 0, failed: 0, errors: [] }
  for (const studentId of parsed.data.studentIds) {
    const r = await publishReportAction({ studentId })
    if ('error' in r) {
      result.failed += 1
      if (!result.errors.includes(r.error)) result.errors.push(r.error)
    } else {
      result.ok += 1
    }
  }

  return { success: true, ...result }
}

/**
 * 선택한 학생들에게 "희망대학 선택·의견 작성" 독려 문자를 일괄 발송한다.
 * 발행된 공유 링크가 있고 연락처가 있는 학생에게만 발송되며(best-effort),
 * 발송에 성공한 인원(ok)과 발송하지 못한 인원(failed)을 합산해 반환한다.
 */
export async function sendConsultOpinionRequestSmsAction(payload: unknown): Promise<BulkResult> {
  const { profile } = await getAuthContext()
  if (!profile) return { error: '로그인이 필요합니다.' }
  if (profile.role !== 'principal') return { error: '원장만 발송할 수 있습니다.' }

  const parsed = bulkSchema.safeParse(payload)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? '잘못된 요청입니다.' }
  }

  const result: BulkActionResult = { ok: 0, failed: 0, errors: [] }
  for (const studentId of parsed.data.studentIds) {
    try {
      const { sent } = await notifyUniversityConsultOpinionRequest({ studentId })
      if (sent > 0) {
        result.ok += 1
      } else {
        result.failed += 1
        if (!result.errors.includes('발행된 공유 링크 또는 연락처가 없어 발송하지 못한 학생이 있습니다.')) {
          result.errors.push('발행된 공유 링크 또는 연락처가 없어 발송하지 못한 학생이 있습니다.')
        }
      }
    } catch (error) {
      console.error('[workflow] sendConsultOpinionRequestSmsAction error', error)
      result.failed += 1
      if (!result.errors.includes('문자 발송 중 오류가 발생했습니다.')) {
        result.errors.push('문자 발송 중 오류가 발생했습니다.')
      }
    }
  }

  return { success: true, ...result }
}

/**
 * 선택한 학생들에게 "지원 대학 최종 확정" 폼 링크(/confirm/[token]) 문자를 일괄 발송한다.
 * 학생별로 확정 세션·토큰을 확보(ensureFinalConfirmation)한 뒤, 연락처가 있는 학생·학부모에게만
 * 발송한다(best-effort). 발송에 성공한 인원(ok)과 실패 인원(failed)을 합산해 반환한다.
 */
export async function sendFinalConfirmationRequestSmsAction(payload: unknown): Promise<BulkResult> {
  const { profile } = await getAuthContext()
  if (!profile) return { error: '로그인이 필요합니다.' }
  if (profile.role !== 'principal') return { error: '원장만 발송할 수 있습니다.' }

  const parsed = bulkSchema.safeParse(payload)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? '잘못된 요청입니다.' }
  }

  const result: BulkActionResult = { ok: 0, failed: 0, errors: [] }
  for (const studentId of parsed.data.studentIds) {
    try {
      const confirmation = await ensureFinalConfirmation(studentId, profile.id)
      if (!confirmation) {
        result.failed += 1
        if (!result.errors.includes('확정 링크를 준비하지 못한 학생이 있습니다.')) {
          result.errors.push('확정 링크를 준비하지 못한 학생이 있습니다.')
        }
        continue
      }

      const { sent } = await notifyUniversityFinalConfirmationRequest({
        studentId,
        token: confirmation.shareToken,
      })
      if (sent > 0) {
        result.ok += 1
      } else {
        result.failed += 1
        if (!result.errors.includes('연락처가 없어 발송하지 못한 학생이 있습니다.')) {
          result.errors.push('연락처가 없어 발송하지 못한 학생이 있습니다.')
        }
      }
    } catch (error) {
      console.error('[workflow] sendFinalConfirmationRequestSmsAction error', error)
      result.failed += 1
      if (!result.errors.includes('문자 발송 중 오류가 발생했습니다.')) {
        result.errors.push('문자 발송 중 오류가 발생했습니다.')
      }
    }
  }

  return { success: true, ...result }
}

/**
 * 확정 기간이 지나도록 최종 확정 폼을 제출하지 않은 학생을 원장 권한으로 임의 확정한다.
 *
 * 학생별로 확정 세션을 확보(ensureFinalConfirmation — 없으면 컨설팅 추천 확정본을 복사해 생성)한 뒤
 * status를 confirmed로 전환하고 confirmed_source='principal'로 기록한다.
 * 이미 확정된 학생은 덮어쓰지 않고 건너뛴다.
 *
 * 확정 후 학생·학부모에게 기존 확정 링크(/confirm/[token])로 "원장이 임의 확정했으니
 * 수정하려면 링크에서 재확정하라"는 안내 문자를 발송한다(best-effort — 폼은 재제출을
 * 허용하므로 학생이 이후 직접 수정하면 confirmed_source가 student로 승격된다).
 */
export async function principalConfirmFinalAction(payload: unknown): Promise<BulkResult> {
  const { profile } = await getAuthContext()
  if (!profile) return { error: '로그인이 필요합니다.' }
  if (profile.role !== 'principal') return { error: '원장만 실행할 수 있습니다.' }

  const parsed = bulkSchema.safeParse(payload)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? '잘못된 요청입니다.' }
  }

  const supabase = createAdminClient()
  const result: BulkActionResult = { ok: 0, failed: 0, errors: [] }

  for (const studentId of parsed.data.studentIds) {
    try {
      const confirmation = await ensureFinalConfirmation(studentId, profile.id)
      if (!confirmation) {
        result.failed += 1
        if (!result.errors.includes('확정 세션을 준비하지 못한 학생이 있습니다.')) {
          result.errors.push('확정 세션을 준비하지 못한 학생이 있습니다.')
        }
        continue
      }

      // 이미 학생이 확정한 경우 원장 확정으로 덮어쓰지 않는다.
      if (confirmation.status === 'confirmed') {
        result.failed += 1
        if (!result.errors.includes('이미 최종 확정된 학생은 건너뛰었습니다.')) {
          result.errors.push('이미 최종 확정된 학생은 건너뛰었습니다.')
        }
        continue
      }

      const { error: updateError } = await supabase
        .from('university_final_confirmations')
        .update({
          status: 'confirmed',
          confirmed_at: new Date().toISOString(),
          confirmed_source: 'principal',
        })
        .eq('id', confirmation.id)
        .eq('status', 'pending')

      if (updateError) {
        console.error('[workflow] principalConfirmFinalAction update error', updateError)
        result.failed += 1
        if (!result.errors.includes('확정 처리 중 오류가 발생했습니다.')) {
          result.errors.push('확정 처리 중 오류가 발생했습니다.')
        }
        continue
      }

      result.ok += 1

      // 안내 문자는 best-effort: 실패해도 확정 자체는 유지한다.
      await notifyUniversityPrincipalConfirmed({
        studentId,
        token: confirmation.shareToken,
      })
    } catch (error) {
      console.error('[workflow] principalConfirmFinalAction error', error)
      result.failed += 1
      if (!result.errors.includes('확정 처리 중 오류가 발생했습니다.')) {
        result.errors.push('확정 처리 중 오류가 발생했습니다.')
      }
    }
  }

  revalidatePath('/dashboard/principal/university-reports/workflow')
  revalidatePath('/dashboard/principal/university-reports/wishlists')

  return { success: true, ...result }
}

export interface BackfillResult extends BulkActionResult {
  candidates: number
  notified: number
}

export type BackfillEvaluationsResult =
  | ({ success: true } & BackfillResult)
  | { error: string }

/**
 * 이미 발행됐지만 분석 평가(evaluations) 행이 비어 있는 학생들의 평가 데이터를 복구한다.
 *
 * 대상: status='published' + snapshot_id 연결됨 + 해당 스냅샷의 evaluations가 0건인 학생만.
 * 동작: 분석을 다시 실행하되 자동 발행을 건너뛰어(autoPublish=false) 기존 발행/공유 링크는
 *       그대로 두고, 평가 행만 다시 채운다. 복구에 성공하면 기존 공유 링크로
 *       "희망 대학을 다시 선택해 주세요(컨설팅 참고용)" 안내 문자를 발송한다.
 *
 * 이미 평가가 있는 학생은 대상에서 제외되므로 중복 문자 발송 위험이 없다.
 */
export async function backfillMissingEvaluationsAction(): Promise<BackfillEvaluationsResult> {
  const { profile } = await getAuthContext()
  if (!profile) return { error: '로그인이 필요합니다.' }
  if (profile.role !== 'principal') return { error: '원장만 실행할 수 있습니다.' }

  const supabase = createAdminClient()

  const { data: pubs, error: pubError } = await supabase
    .from('university_report_publications')
    .select('student_id, snapshot_id, share_token')
    .eq('status', 'published')
    .not('snapshot_id', 'is', null)

  if (pubError) {
    console.error('[backfill-evaluations] publication fetch error', pubError)
    return { error: '발행 정보를 불러오지 못했습니다.' }
  }

  const result: BackfillResult = { ok: 0, failed: 0, errors: [], candidates: 0, notified: 0 }

  for (const pub of pubs ?? []) {
    const snapshotId = pub.snapshot_id as string

    const { count: beforeCount, error: countError } = await supabase
      .from('university_report_evaluations')
      .select('id', { count: 'exact', head: true })
      .eq('snapshot_id', snapshotId)

    if (countError) {
      console.error('[backfill-evaluations] eval count error', countError)
      continue
    }
    // 이미 평가가 있는 학생은 복구 대상이 아니다(문자 재발송 방지).
    if ((beforeCount ?? 0) > 0) continue

    result.candidates += 1

    // 발행/문자 없이 평가만 다시 생성한다.
    const r = await runAnalysisAction({ studentId: pub.student_id }, { autoPublish: false })
    if ('error' in r) {
      result.failed += 1
      if (!result.errors.includes(r.error)) result.errors.push(r.error)
      continue
    }

    // 발행 레코드가 가리키는 스냅샷에 평가가 실제로 채워졌는지 확인 후 안내 문자 발송.
    const { count: afterCount } = await supabase
      .from('university_report_evaluations')
      .select('id', { count: 'exact', head: true })
      .eq('snapshot_id', snapshotId)

    if ((afterCount ?? 0) === 0) {
      result.failed += 1
      if (!result.errors.includes('평가 복구 후에도 결과가 비어 있습니다.')) {
        result.errors.push('평가 복구 후에도 결과가 비어 있습니다.')
      }
      continue
    }

    result.ok += 1

    const notifyResult = await notifyUniversityReportWishReselect({
      studentId: pub.student_id,
      token: pub.share_token as string,
    })
    if (notifyResult.sent > 0) result.notified += 1
  }

  return { success: true, ...result }
}
