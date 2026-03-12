'use client'

import { useRef, useState, useTransition } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { cn } from '@/lib/utils'
import { TEACHER_RECEIPTS_BUCKET } from '@/lib/storage/buckets'
import { buildRandomizedFileName, uploadFileToStorageViaClient } from '@/lib/storage-upload'
import { saveReceipt, deleteReceipt } from '@/app/dashboard/teacher/work-journal/receipt-actions'
import { RECEIPT_REVIEW_STATUS_LABEL, type Receipt } from '@/lib/receipts'

interface ReceiptSectionProps {
  monthToken: string
  teacherId: string
  initialReceipts: Receipt[]
}

type FeedbackState = {
  type: 'success' | 'error'
  message: string
} | null

const MAX_RECEIPT_IMAGE_SIZE = 10 * 1024 * 1024

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('ko-KR').format(amount)
}

export function ReceiptSection({ monthToken, teacherId, initialReceipts }: ReceiptSectionProps) {
  const [receipts, setReceipts] = useState<Receipt[]>(initialReceipts)
  const [feedback, setFeedback] = useState<FeedbackState>(null)
  const [isPending, startTransition] = useTransition()
  const [pendingAction, setPendingAction] = useState<'save' | string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [usedDate, setUsedDate] = useState('')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [approvalNumber, setApprovalNumber] = useState('')

  const resetForm = () => {
    setUsedDate('')
    setDescription('')
    setAmount('')
    setApprovalNumber('')
    setSelectedFile(null)
    setPreviewUrl(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) {
      setSelectedFile(null)
      setPreviewUrl(null)
      return
    }

    if (file.size > MAX_RECEIPT_IMAGE_SIZE) {
      setFeedback({ type: 'error', message: '이미지 파일은 최대 10MB까지 허용됩니다.' })
      e.target.value = ''
      return
    }

    if (!file.type.startsWith('image/')) {
      setFeedback({ type: 'error', message: '이미지 파일만 첨부할 수 있습니다.' })
      e.target.value = ''
      return
    }

    setSelectedFile(file)
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    setFeedback(null)
  }

  const handleSave = () => {
    if (!usedDate) {
      setFeedback({ type: 'error', message: '사용일자를 입력해주세요.' })
      return
    }
    if (!description.trim()) {
      setFeedback({ type: 'error', message: '사용내역을 입력해주세요.' })
      return
    }
    if (!amount || Number(amount) <= 0) {
      setFeedback({ type: 'error', message: '금액을 올바르게 입력해주세요.' })
      return
    }

    setPendingAction('save')
    startTransition(async () => {
      try {
        let imagePath: string | null = null

        if (selectedFile) {
          const fileName = buildRandomizedFileName(selectedFile.name)
          const storagePath = `${teacherId}/${fileName}`
          await uploadFileToStorageViaClient({
            bucket: TEACHER_RECEIPTS_BUCKET,
            file: selectedFile,
            path: storagePath,
            maxSizeBytes: MAX_RECEIPT_IMAGE_SIZE,
          })
          imagePath = storagePath
        }

        const formData = new FormData()
        formData.append('monthToken', monthToken)
        formData.append('usedDate', usedDate)
        formData.append('description', description.trim())
        formData.append('amount', amount)
        if (approvalNumber.trim()) {
          formData.append('approvalNumber', approvalNumber.trim())
        }
        if (imagePath) {
          formData.append('receiptImagePath', imagePath)
        }

        const result = await saveReceipt(formData)
        if (!result?.success || !result.receipt) {
          setFeedback({ type: 'error', message: result?.error ?? '영수증 등록 중 문제가 발생했습니다.' })
          return
        }

        setReceipts((prev) => [...prev, result.receipt!])
        resetForm()
        setFeedback({ type: 'success', message: '영수증이 등록되었습니다.' })
      } catch {
        setFeedback({ type: 'error', message: '영수증 등록 중 오류가 발생했습니다.' })
      } finally {
        setPendingAction(null)
      }
    })
  }

  const handleDelete = (receiptId: string) => {
    setPendingAction(receiptId)
    startTransition(async () => {
      try {
        const formData = new FormData()
        formData.append('receiptId', receiptId)
        const result = await deleteReceipt(formData)
        if (!result?.success) {
          setFeedback({ type: 'error', message: result?.error ?? '영수증 삭제에 실패했습니다.' })
          return
        }
        setReceipts((prev) => prev.filter((r) => r.id !== receiptId))
        setFeedback({ type: 'success', message: '영수증이 삭제되었습니다.' })
      } finally {
        setPendingAction(null)
      }
    })
  }

  const totalAmount = receipts.reduce((sum, r) => sum + r.amount, 0)

  return (
    <Card className="border-slate-200">
      <CardHeader>
        <CardTitle className="text-lg text-slate-900">영수증 증빙</CardTitle>
        <CardDescription>개인 지출 영수증을 등록하면 월급 정산 시 반영됩니다.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4 rounded-md border border-slate-200 bg-slate-50/50 p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="receipt-date" className="text-sm font-medium text-slate-700">
                사용일자 <span className="text-red-500">*</span>
              </label>
              <Input
                id="receipt-date"
                type="date"
                value={usedDate}
                onChange={(e) => setUsedDate(e.target.value)}
                disabled={isPending}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="receipt-amount" className="text-sm font-medium text-slate-700">
                금액 (원) <span className="text-red-500">*</span>
              </label>
              <Input
                id="receipt-amount"
                type="number"
                min="1"
                step="1"
                placeholder="예: 15000"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={isPending}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="receipt-description" className="text-sm font-medium text-slate-700">
              사용내역 <span className="text-red-500">*</span>
            </label>
            <Input
              id="receipt-description"
              type="text"
              placeholder="예: 수업 자료 구입"
              maxLength={200}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isPending}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="receipt-approval" className="text-sm font-medium text-slate-700">
              영수증 승인번호
            </label>
            <Input
              id="receipt-approval"
              type="text"
              placeholder="영수증 승인번호 (선택)"
              maxLength={50}
              value={approvalNumber}
              onChange={(e) => setApprovalNumber(e.target.value)}
              disabled={isPending}
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="receipt-image" className="text-sm font-medium text-slate-700">
              영수증 첨부
            </label>
            <Input
              ref={fileInputRef}
              id="receipt-image"
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              disabled={isPending}
              className="file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1 file:text-sm file:text-slate-700 hover:file:bg-slate-200"
            />
            {previewUrl && (
              <div className="mt-2">
                <img
                  src={previewUrl}
                  alt="영수증 미리보기"
                  className="max-h-40 rounded-md border border-slate-200 object-contain"
                />
              </div>
            )}
            <p className="text-xs text-slate-500">이미지 파일만 첨부 가능하며, 최대 10MB입니다.</p>
          </div>

          <div className="flex items-center gap-3">
            <Button type="button" onClick={handleSave} disabled={isPending}>
              {pendingAction === 'save' ? (
                <span className="flex items-center gap-2">
                  <LoadingSpinner />
                  등록 중...
                </span>
              ) : (
                '영수증 등록'
              )}
            </Button>
            {feedback && (
              <span
                className={cn(
                  'text-sm',
                  feedback.type === 'success' ? 'text-emerald-600' : 'text-red-600'
                )}
              >
                {feedback.message}
              </span>
            )}
          </div>
        </div>

        {receipts.length === 0 ? (
          <p className="text-sm text-slate-500">이번 달에 등록된 영수증이 없습니다.</p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-slate-700">등록된 영수증 ({receipts.length}건)</span>
              <span className="font-semibold text-slate-900">합계 {formatCurrency(totalAmount)}원</span>
            </div>
            <div className="divide-y divide-slate-200 rounded-md border border-slate-200">
              {receipts.map((receipt) => {
                const isLocked = receipt.reviewStatus === 'approved' || receipt.reviewStatus === 'paid'
                return (
                  <div key={receipt.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-1 flex-col gap-1 text-sm">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="font-medium text-slate-800">{receipt.usedDate}</span>
                        <span className="text-slate-600">{receipt.description}</span>
                        <span className="font-semibold text-slate-900">{formatCurrency(receipt.amount)}원</span>
                        <Badge
                          variant={
                            receipt.reviewStatus === 'approved' ? 'default'
                            : receipt.reviewStatus === 'rejected' ? 'destructive'
                            : receipt.reviewStatus === 'paid' ? 'default'
                            : 'secondary'
                          }
                          className={cn(
                            receipt.reviewStatus === 'pending' && 'bg-amber-100 text-amber-900',
                            receipt.reviewStatus === 'paid' && 'bg-blue-100 text-blue-900',
                          )}
                        >
                          {RECEIPT_REVIEW_STATUS_LABEL[receipt.reviewStatus]}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                        {receipt.approvalNumber && (
                          <span>승인번호: {receipt.approvalNumber}</span>
                        )}
                        {receipt.receiptImagePath && (
                          <a
                            href={`/api/storage/teacher-receipts/${receipt.receiptImagePath}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 underline hover:text-blue-800"
                          >
                            영수증 보기
                          </a>
                        )}
                        {receipt.reviewStatus === 'rejected' && receipt.reviewNote && (
                          <span className="text-red-600">반려 사유: {receipt.reviewNote}</span>
                        )}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isPending || isLocked}
                      onClick={() => handleDelete(receipt.id)}
                      title={isLocked ? '승인 완료 또는 지급완료된 영수증은 삭제할 수 없습니다.' : undefined}
                    >
                      {pendingAction === receipt.id ? (
                        <span className="flex items-center gap-1">
                          <LoadingSpinner />
                          삭제 중
                        </span>
                      ) : (
                        '삭제'
                      )}
                    </Button>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
