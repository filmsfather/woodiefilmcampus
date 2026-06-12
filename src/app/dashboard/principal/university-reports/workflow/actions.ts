'use server'

import { z } from 'zod'

import { getAuthContext } from '@/lib/auth'
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
