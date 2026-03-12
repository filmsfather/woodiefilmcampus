'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { getAuthContext } from '@/lib/auth'
import { createClient as createServerSupabase } from '@/lib/supabase/server'
import { RECEIPT_SELECT_FIELDS, mapReceiptRow, type Receipt, type ReceiptRow } from '@/lib/receipts'

function canReviewReceipts(role: string | null | undefined): role is 'manager' | 'principal' {
  return role === 'manager' || role === 'principal'
}

const reviewSchema = z.object({
  receiptId: z.string().uuid('영수증 ID가 올바르지 않습니다.'),
  decision: z.enum(['approve', 'reject'] as const),
  reviewNote: z
    .string()
    .optional()
    .transform((v) => {
      if (!v) return null
      const trimmed = v.trim()
      return trimmed.length > 0 ? trimmed : null
    }),
})

type ReviewResult = {
  success?: true
  receipt?: Receipt
  error?: string
}

export async function reviewReceipt(formData: FormData): Promise<ReviewResult> {
  const { profile } = await getAuthContext()

  if (!profile || !canReviewReceipts(profile.role)) {
    return { error: '영수증을 승인할 권한이 없습니다.' }
  }

  const parsed = reviewSchema.safeParse(Object.fromEntries(formData.entries()))

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]
    return { error: firstIssue?.message ?? '승인 정보를 확인해주세요.' }
  }

  const input = parsed.data
  const supabase = await createServerSupabase()

  const { data: existing, error: fetchError } = await supabase
    .from('teacher_receipts')
    .select(RECEIPT_SELECT_FIELDS)
    .eq('id', input.receiptId)
    .maybeSingle<ReceiptRow>()

  if (fetchError) {
    console.error('[receipt-review] fetch error', fetchError)
    return { error: '영수증을 불러오지 못했습니다.' }
  }

  if (!existing) {
    return { error: '해당 영수증을 찾을 수 없습니다.' }
  }

  const targetStatus = input.decision === 'approve' ? 'approved' : 'rejected'

  if (existing.review_status === 'approved' && input.decision === 'approve') {
    return { error: '이미 승인된 영수증입니다.' }
  }

  const now = new Date().toISOString()

  const { data: row, error: updateError } = await supabase
    .from('teacher_receipts')
    .update({
      review_status: targetStatus,
      review_note: input.reviewNote,
      reviewed_by: profile.id,
      reviewed_at: now,
    })
    .eq('id', input.receiptId)
    .select(RECEIPT_SELECT_FIELDS)
    .maybeSingle<ReceiptRow>()

  if (updateError || !row) {
    console.error('[receipt-review] update error', updateError)
    return { error: '영수증 승인 처리에 실패했습니다.' }
  }

  revalidatePath('/dashboard/teacher/work-journal')
  revalidatePath('/dashboard/manager/receipts')

  return { success: true, receipt: mapReceiptRow(row) }
}

const bulkApproveSchema = z.object({
  receiptIds: z.array(z.string().uuid()).min(1, '승인할 항목이 없습니다.'),
})

type BulkApproveResult = {
  success?: true
  approvedCount?: number
  error?: string
}

export async function bulkApproveReceipts(receiptIds: string[]): Promise<BulkApproveResult> {
  const { profile } = await getAuthContext()

  if (!profile || !canReviewReceipts(profile.role)) {
    return { error: '영수증을 승인할 권한이 없습니다.' }
  }

  const parsed = bulkApproveSchema.safeParse({ receiptIds })

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]
    return { error: firstIssue?.message ?? '승인 정보를 확인해주세요.' }
  }

  const supabase = await createServerSupabase()
  const now = new Date().toISOString()

  const { data: rows, error: updateError } = await supabase
    .from('teacher_receipts')
    .update({
      review_status: 'approved',
      reviewed_by: profile.id,
      reviewed_at: now,
    })
    .in('id', parsed.data.receiptIds)
    .eq('review_status', 'pending')
    .select('id')

  if (updateError) {
    console.error('[receipt-review] bulk approve error', updateError)
    return { error: '일괄 승인 처리에 실패했습니다.' }
  }

  revalidatePath('/dashboard/teacher/work-journal')
  revalidatePath('/dashboard/manager/receipts')

  return { success: true, approvedCount: rows?.length ?? 0 }
}

function canMarkAsPaid(role: string | null | undefined): role is 'principal' {
  return role === 'principal'
}

const bulkPaidSchema = z.object({
  receiptIds: z.array(z.string().uuid()).min(1, '지급완료 처리할 항목이 없습니다.'),
})

type BulkPaidResult = {
  success?: true
  paidCount?: number
  error?: string
}

export async function bulkMarkAsPaid(receiptIds: string[]): Promise<BulkPaidResult> {
  const { profile } = await getAuthContext()

  if (!profile || !canMarkAsPaid(profile.role)) {
    return { error: '지급완료 처리 권한이 없습니다. 원장만 가능합니다.' }
  }

  const parsed = bulkPaidSchema.safeParse({ receiptIds })

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]
    return { error: firstIssue?.message ?? '지급완료 정보를 확인해주세요.' }
  }

  const supabase = await createServerSupabase()
  const now = new Date().toISOString()

  const { data: rows, error: updateError } = await supabase
    .from('teacher_receipts')
    .update({
      review_status: 'paid',
      paid_by: profile.id,
      paid_at: now,
    })
    .in('id', parsed.data.receiptIds)
    .eq('review_status', 'approved')
    .select('id')

  if (updateError) {
    console.error('[receipt-review] bulk mark-as-paid error', updateError)
    return { error: '지급완료 처리에 실패했습니다.' }
  }

  revalidatePath('/dashboard/teacher/work-journal')
  revalidatePath('/dashboard/manager/receipts')

  return { success: true, paidCount: rows?.length ?? 0 }
}
