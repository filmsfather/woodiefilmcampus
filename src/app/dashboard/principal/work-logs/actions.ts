'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { getAuthContext } from '@/lib/auth'
import {
  WORK_LOG_ENTRY_SELECT_FIELDS,
  mapWorkLogRow,
  type WorkLogEntry,
  type WorkLogEntryRow,
} from '@/lib/work-logs'
import { createClient as createServerSupabase } from '@/lib/supabase/server'

const reviewSchema = z.object({
  entryId: z.string().uuid('근무일지 ID가 올바르지 않습니다.'),
  decision: z.enum(['approve', 'reject'] as const),
  reviewNote: z
    .string()
    .optional()
    .transform((value) => {
      if (!value) {
        return null
      }
      const trimmed = value.trim()
      return trimmed.length > 0 ? trimmed : null
    }),
})

type ReviewInput = z.infer<typeof reviewSchema>

type ReviewResult = {
  success?: true
  entry?: WorkLogEntry
  error?: string
}

export async function reviewWorkLogEntry(formData: FormData): Promise<ReviewResult> {
  const { profile } = await getAuthContext()

  if (!profile || profile.role !== 'principal') {
    return { error: '근무일지를 승인할 권한이 없습니다.' }
  }

  const parsed = reviewSchema.safeParse(Object.fromEntries(formData.entries()))

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]
    return { error: firstIssue?.message ?? '승인 정보를 확인해주세요.' }
  }

  const input: ReviewInput = parsed.data

  const supabase = await createServerSupabase()

  const { data: existing, error: fetchError } = await supabase
    .from('work_log_entries')
    .select(WORK_LOG_ENTRY_SELECT_FIELDS)
    .eq('id', input.entryId)
    .maybeSingle<WorkLogEntryRow>()

  if (fetchError) {
    console.error('[principal-work-log] fetch error', fetchError)
    return { error: '근무일지를 불러오지 못했습니다.' }
  }

  if (!existing) {
    return { error: '해당 근무일지를 찾을 수 없습니다.' }
  }

  const targetStatus = input.decision === 'approve' ? 'approved' : 'rejected'

  if (existing.review_status === targetStatus && input.decision === 'approve') {
    return { error: '이미 승인된 근무일지입니다.' }
  }

  const now = new Date().toISOString()

  const { data: row, error: updateError } = await supabase
    .from('work_log_entries')
    .update({
      review_status: targetStatus,
      review_note: input.reviewNote,
      reviewed_by: profile.id,
      reviewed_at: now,
    })
    .eq('id', input.entryId)
    .select(WORK_LOG_ENTRY_SELECT_FIELDS)
    .maybeSingle<WorkLogEntryRow>()

  if (updateError || !row) {
    console.error('[principal-work-log] update error', updateError)
    return { error: '근무일지 승인 처리에 실패했습니다.' }
  }

  revalidatePath('/dashboard/teacher/work-journal')
  revalidatePath('/dashboard/principal/work-logs')

  return {
    success: true,
    entry: mapWorkLogRow(row),
  }
}

const bulkApproveSchema = z.object({
  entryIds: z.array(z.string().uuid('근무일지 ID가 올바르지 않습니다.')).min(1, '승인할 항목이 없습니다.'),
})

type BulkApproveResult = {
  success?: true
  approvedCount?: number
  error?: string
}

export async function bulkApproveWorkLogEntries(entryIds: string[]): Promise<BulkApproveResult> {
  const { profile } = await getAuthContext()

  if (!profile || profile.role !== 'principal') {
    return { error: '근무일지를 승인할 권한이 없습니다.' }
  }

  const parsed = bulkApproveSchema.safeParse({ entryIds })

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]
    return { error: firstIssue?.message ?? '승인 정보를 확인해주세요.' }
  }

  const supabase = await createServerSupabase()
  const now = new Date().toISOString()

  const { data: rows, error: updateError } = await supabase
    .from('work_log_entries')
    .update({
      review_status: 'approved',
      reviewed_by: profile.id,
      reviewed_at: now,
    })
    .in('id', parsed.data.entryIds)
    .eq('review_status', 'pending')
    .select('id')

  if (updateError) {
    console.error('[principal-work-log] bulk approve error', updateError)
    return { error: '일괄 승인 처리에 실패했습니다.' }
  }

  revalidatePath('/dashboard/teacher/work-journal')
  revalidatePath('/dashboard/principal/work-logs')

  return {
    success: true,
    approvedCount: rows?.length ?? 0,
  }
}
