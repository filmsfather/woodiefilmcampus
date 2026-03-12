'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { getAuthContext } from '@/lib/auth'
import { createClient as createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { TEACHER_RECEIPTS_BUCKET } from '@/lib/storage/buckets'
import { RECEIPT_SELECT_FIELDS, mapReceiptRow, type Receipt, type ReceiptRow } from '@/lib/receipts'

function canManageWorkJournal(role: string | null | undefined): role is 'teacher' | 'manager' {
  return role === 'teacher' || role === 'manager'
}

const receiptSchema = z.object({
  receiptId: z
    .string()
    .uuid()
    .optional()
    .transform((v) => v ?? null),
  monthToken: z
    .string()
    .min(1)
    .refine((v) => /^\d{4}-\d{2}$/.test(v), '월 형식이 올바르지 않습니다.'),
  usedDate: z
    .string()
    .min(1, '사용일자를 입력해주세요.')
    .refine((v) => /^\d{4}-\d{2}-\d{2}$/.test(v), '날짜 형식이 올바르지 않습니다.'),
  description: z
    .string()
    .min(1, '사용내역을 입력해주세요.')
    .max(200, '사용내역은 200자 이하로 입력해주세요.'),
  amount: z
    .string()
    .min(1, '금액을 입력해주세요.')
    .transform((v) => {
      const parsed = Number(v)
      if (Number.isNaN(parsed) || parsed <= 0 || !Number.isInteger(parsed)) {
        return Number.NaN
      }
      return parsed
    })
    .refine((v) => !Number.isNaN(v), '금액은 양수 정수로 입력해주세요.'),
  approvalNumber: z
    .string()
    .optional()
    .transform((v) => {
      if (!v) return null
      const trimmed = v.trim()
      return trimmed.length > 0 ? trimmed : null
    }),
  receiptImagePath: z
    .string()
    .optional()
    .transform((v) => {
      if (!v) return null
      const trimmed = v.trim()
      return trimmed.length > 0 ? trimmed : null
    }),
})

type ReceiptActionResult = {
  success?: true
  receipt?: Receipt
  error?: string
}

function normalizeFormData(formData: FormData) {
  const entries: Record<string, string> = {}
  formData.forEach((value, key) => {
    if (typeof value === 'string') {
      entries[key] = value
    }
  })
  return entries
}

export async function saveReceipt(formData: FormData): Promise<ReceiptActionResult> {
  const { profile } = await getAuthContext()

  if (!profile || !canManageWorkJournal(profile.role)) {
    return { error: '영수증을 등록할 수 있는 권한이 없습니다.' }
  }

  const parsed = receiptSchema.safeParse(normalizeFormData(formData))

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]
    return { error: firstIssue?.message ?? '입력값을 확인해주세요.' }
  }

  const input = parsed.data
  const supabase = await createServerSupabase()

  const payload = {
    teacher_id: profile.id,
    month_token: input.monthToken,
    used_date: input.usedDate,
    description: input.description,
    amount: input.amount,
    approval_number: input.approvalNumber,
    receipt_image_path: input.receiptImagePath,
  }

  if (input.receiptId) {
    const { data: existing } = await supabase
      .from('teacher_receipts')
      .select('id, teacher_id')
      .eq('id', input.receiptId)
      .eq('teacher_id', profile.id)
      .maybeSingle()

    if (!existing) {
      return { error: '수정할 영수증을 찾을 수 없습니다.' }
    }

    const { data: row, error: updateError } = await supabase
      .from('teacher_receipts')
      .update(payload)
      .eq('id', input.receiptId)
      .select(RECEIPT_SELECT_FIELDS)
      .maybeSingle<ReceiptRow>()

    if (updateError || !row) {
      console.error('[receipt] update error', updateError)
      return { error: '영수증 저장에 실패했습니다.' }
    }

    revalidatePath('/dashboard/teacher/work-journal')
    return { success: true, receipt: mapReceiptRow(row) }
  }

  const { data: row, error: insertError } = await supabase
    .from('teacher_receipts')
    .insert(payload)
    .select(RECEIPT_SELECT_FIELDS)
    .maybeSingle<ReceiptRow>()

  if (insertError || !row) {
    console.error('[receipt] insert error', insertError)
    return { error: '영수증 등록에 실패했습니다.' }
  }

  revalidatePath('/dashboard/teacher/work-journal')
  return { success: true, receipt: mapReceiptRow(row) }
}

export async function deleteReceipt(formData: FormData): Promise<ReceiptActionResult> {
  const { profile } = await getAuthContext()

  if (!profile || !canManageWorkJournal(profile.role)) {
    return { error: '영수증을 삭제할 수 있는 권한이 없습니다.' }
  }

  const receiptId = formData.get('receiptId')
  if (typeof receiptId !== 'string' || !receiptId) {
    return { error: '삭제할 영수증 정보가 올바르지 않습니다.' }
  }

  const supabase = await createServerSupabase()

  const { data: existing } = await supabase
    .from('teacher_receipts')
    .select('id, teacher_id, receipt_image_path, review_status')
    .eq('id', receiptId)
    .eq('teacher_id', profile.id)
    .maybeSingle()

  if (!existing) {
    return { error: '삭제할 영수증을 찾을 수 없습니다.' }
  }

  if (existing.review_status === 'approved') {
    return { error: '승인 완료된 영수증은 삭제할 수 없습니다.' }
  }

  if (existing.receipt_image_path) {
    try {
      const admin = createAdminClient()
      await admin.storage.from(TEACHER_RECEIPTS_BUCKET).remove([existing.receipt_image_path])
    } catch (err) {
      console.error('[receipt] storage delete error', err)
    }
  }

  const { error: deleteError } = await supabase
    .from('teacher_receipts')
    .delete()
    .eq('id', receiptId)

  if (deleteError) {
    console.error('[receipt] delete error', deleteError)
    return { error: '영수증 삭제에 실패했습니다.' }
  }

  revalidatePath('/dashboard/teacher/work-journal')
  return { success: true }
}
