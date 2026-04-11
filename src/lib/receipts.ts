export type ReceiptReviewStatus = 'pending' | 'approved' | 'rejected' | 'paid'

export const RECEIPT_REVIEW_STATUS_LABEL: Record<ReceiptReviewStatus, string> = {
  pending: '승인 대기',
  approved: '승인 완료',
  rejected: '반려',
  paid: '지급완료',
}

export type ReceiptRow = {
  id: string
  teacher_id: string
  month_token: string
  used_date: string
  description: string
  amount: number
  approval_number: string | null
  receipt_image_paths: string[]
  review_status: ReceiptReviewStatus
  review_note: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  paid_by: string | null
  paid_at: string | null
  created_at: string
  updated_at: string
}

export type Receipt = {
  id: string
  teacherId: string
  monthToken: string
  usedDate: string
  description: string
  amount: number
  approvalNumber: string | null
  receiptImagePaths: string[]
  reviewStatus: ReceiptReviewStatus
  reviewNote: string | null
  reviewedBy: string | null
  reviewedAt: string | null
  paidBy: string | null
  paidAt: string | null
  createdAt: string
}

export type ReceiptWithTeacher = Receipt & {
  teacher: { id: string; name: string | null; email: string | null } | null
}

export const RECEIPT_SELECT_FIELDS =
  'id, teacher_id, month_token, used_date, description, amount, approval_number, receipt_image_paths, review_status, review_note, reviewed_by, reviewed_at, paid_by, paid_at, created_at, updated_at'

export function mapReceiptRow(row: ReceiptRow): Receipt {
  return {
    id: row.id,
    teacherId: row.teacher_id,
    monthToken: row.month_token,
    usedDate: row.used_date,
    description: row.description,
    amount: row.amount,
    approvalNumber: row.approval_number,
    receiptImagePaths: row.receipt_image_paths ?? [],
    reviewStatus: row.review_status,
    reviewNote: row.review_note,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    paidBy: row.paid_by,
    paidAt: row.paid_at,
    createdAt: row.created_at,
  }
}
