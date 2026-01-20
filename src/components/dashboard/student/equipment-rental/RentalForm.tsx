'use client'

import { useRef, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { Camera, Calendar, Check, Loader2, Upload } from 'lucide-react'

import {
  formatSetTypeLabel,
  formatRentalStatusLabel,
  getRentalStatusBadgeStyle,
  buildEquipmentPhotoPath,
  type EquipmentSetType,
  type EquipmentRentalStatus,
} from '@/lib/equipment-rental'
import { EQUIPMENT_RENTAL_BUCKET } from '@/lib/storage/buckets'
import { createClient } from '@/lib/supabase/client'
import {
  updateRentalMemo,
  completeCheckout,
  completeReturn,
} from '@/app/dashboard/student/equipment-rental/actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'

interface RentalInfo {
  id: string
  slotDate: string
  setType: EquipmentSetType
  className: string | null
  memo: string | null
  status: EquipmentRentalStatus
  checkoutPhotoPath: string | null
  returnPhotoPath: string | null
  checkedOutAt: string | null
  returnedAt: string | null
  createdAt: string
}

interface RentalFormProps {
  rental: RentalInfo
  studentId: string
}

const MAX_PHOTO_SIZE = 10 * 1024 * 1024 // 10MB

export function RentalForm({ rental, studentId }: RentalFormProps) {
  const router = useRouter()
  const checkoutInputRef = useRef<HTMLInputElement>(null)
  const returnInputRef = useRef<HTMLInputElement>(null)

  const [memo, setMemo] = useState(rental.memo ?? '')
  const [isSavingMemo, setIsSavingMemo] = useState(false)
  const [memoSaved, setMemoSaved] = useState(false)

  const [checkoutPreview, setCheckoutPreview] = useState<string | null>(null)
  const [returnPreview, setReturnPreview] = useState<string | null>(null)

  const [isUploadingCheckout, setIsUploadingCheckout] = useState(false)
  const [isUploadingReturn, setIsUploadingReturn] = useState(false)

  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  )

  const handleMemoBlur = async () => {
    if (memo === (rental.memo ?? '')) return

    setIsSavingMemo(true)
    try {
      const result = await updateRentalMemo({ rentalId: rental.id, memo: memo || null })
      if (result?.error) {
        setFeedback({ type: 'error', message: result.error })
      } else {
        setMemoSaved(true)
        setTimeout(() => setMemoSaved(false), 2000)
      }
    } catch (error) {
      console.error('[rental] memo save error', error)
    } finally {
      setIsSavingMemo(false)
    }
  }

  const handleCheckoutPhotoSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (file.size > MAX_PHOTO_SIZE) {
      setFeedback({ type: 'error', message: '사진 크기는 10MB 이하로 업로드해주세요.' })
      return
    }

    // 미리보기
    const previewUrl = URL.createObjectURL(file)
    setCheckoutPreview(previewUrl)

    // 업로드
    setIsUploadingCheckout(true)
    setFeedback(null)

    try {
      const supabase = createClient()
      const path = buildEquipmentPhotoPath(studentId, rental.id, 'checkout')

      const { error: uploadError } = await supabase.storage
        .from(EQUIPMENT_RENTAL_BUCKET)
        .upload(path, file, {
          cacheControl: '3600',
          upsert: false,
          contentType: file.type,
        })

      if (uploadError) {
        throw uploadError
      }

      // 서버 액션으로 상태 업데이트
      const result = await completeCheckout({ rentalId: rental.id, photoPath: path })
      if (result?.error) {
        setFeedback({ type: 'error', message: result.error })
      } else {
        setFeedback({ type: 'success', message: '대여가 완료되었습니다.' })
        router.refresh()
      }
    } catch (error) {
      console.error('[rental] checkout photo upload error', error)
      setFeedback({ type: 'error', message: '사진 업로드에 실패했습니다.' })
    } finally {
      setIsUploadingCheckout(false)
      if (checkoutInputRef.current) {
        checkoutInputRef.current.value = ''
      }
    }
  }

  const handleReturnPhotoSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (file.size > MAX_PHOTO_SIZE) {
      setFeedback({ type: 'error', message: '사진 크기는 10MB 이하로 업로드해주세요.' })
      return
    }

    // 미리보기
    const previewUrl = URL.createObjectURL(file)
    setReturnPreview(previewUrl)

    // 업로드
    setIsUploadingReturn(true)
    setFeedback(null)

    try {
      const supabase = createClient()
      const path = buildEquipmentPhotoPath(studentId, rental.id, 'return')

      const { error: uploadError } = await supabase.storage
        .from(EQUIPMENT_RENTAL_BUCKET)
        .upload(path, file, {
          cacheControl: '3600',
          upsert: false,
          contentType: file.type,
        })

      if (uploadError) {
        throw uploadError
      }

      // 서버 액션으로 상태 업데이트
      const result = await completeReturn({ rentalId: rental.id, photoPath: path })
      if (result?.error) {
        setFeedback({ type: 'error', message: result.error })
      } else {
        setFeedback({ type: 'success', message: '반납이 완료되었습니다.' })
        router.refresh()
      }
    } catch (error) {
      console.error('[rental] return photo upload error', error)
      setFeedback({ type: 'error', message: '사진 업로드에 실패했습니다.' })
    } finally {
      setIsUploadingReturn(false)
      if (returnInputRef.current) {
        returnInputRef.current.value = ''
      }
    }
  }

  return (
    <div className="space-y-6">
      {feedback && (
        <div
          className={[
            'rounded-md border px-4 py-3 text-sm',
            feedback.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-red-200 bg-red-50 text-red-600',
          ].join(' ')}
        >
          {feedback.message}
        </div>
      )}

      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="text-base font-semibold text-slate-900">대여 정보</span>
            <Badge className={getRentalStatusBadgeStyle(rental.status)}>
              {formatRentalStatusLabel(rental.status)}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <span className="text-sm font-medium text-slate-500">장비</span>
              <p className="text-slate-900">{formatSetTypeLabel(rental.setType)}</p>
            </div>
            <div className="space-y-1">
              <span className="text-sm font-medium text-slate-500">대여일</span>
              <p className="flex items-center gap-1 text-slate-900">
                <Calendar className="h-4 w-4" />
                {rental.slotDate}
              </p>
            </div>
            {rental.className && (
              <div className="space-y-1">
                <span className="text-sm font-medium text-slate-500">반</span>
                <p className="text-slate-900">{rental.className}</p>
              </div>
            )}
            <div className="space-y-1">
              <span className="text-sm font-medium text-slate-500">신청일시</span>
              <p className="text-slate-900">
                {new Date(rental.createdAt).toLocaleString('ko-KR')}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="memo" className="text-sm font-medium text-slate-700">
                메모
              </label>
              {isSavingMemo && (
                <span className="text-xs text-slate-400">저장 중...</span>
              )}
              {memoSaved && (
                <span className="flex items-center gap-1 text-xs text-emerald-600">
                  <Check className="h-3 w-3" /> 저장됨
                </span>
              )}
            </div>
            <Textarea
              id="memo"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              onBlur={handleMemoBlur}
              placeholder="대여 관련 메모를 입력하세요 (선택)"
              className="resize-none"
              rows={3}
              disabled={rental.status === 'returned'}
            />
          </div>
        </CardContent>
      </Card>

      {/* 대여 확인 */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-slate-900">
            대여 확인
          </CardTitle>
          <p className="text-sm text-slate-600">
            장비를 대여할 때 장비 상태를 사진으로 촬영해주세요.
          </p>
        </CardHeader>
        <CardContent>
          {rental.status === 'pending' ? (
            <div className="space-y-4">
              {checkoutPreview ? (
                <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-slate-200">
                  <Image
                    src={checkoutPreview}
                    alt="대여 확인 사진 미리보기"
                    fill
                    className="object-cover"
                  />
                </div>
              ) : (
                <div className="flex aspect-video w-full flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-slate-50">
                  <Camera className="h-12 w-12 text-slate-400" />
                  <p className="mt-2 text-sm text-slate-500">
                    장비 상태 사진을 업로드해주세요
                  </p>
                </div>
              )}

              <input
                ref={checkoutInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleCheckoutPhotoSelect}
              />

              <Button
                className="w-full"
                onClick={() => checkoutInputRef.current?.click()}
                disabled={isUploadingCheckout}
              >
                {isUploadingCheckout ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="mr-2 h-4 w-4" />
                )}
                대여 확인 사진 업로드
              </Button>
            </div>
          ) : (
            <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-4 text-center">
              <Check className="mx-auto h-8 w-8 text-emerald-600" />
              <p className="mt-2 font-medium text-emerald-700">대여 완료</p>
              {rental.checkedOutAt && (
                <p className="mt-1 text-sm text-emerald-600">
                  {new Date(rental.checkedOutAt).toLocaleString('ko-KR')}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 반납 확인 */}
      {rental.status !== 'pending' && (
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-slate-900">
              반납 확인
            </CardTitle>
            <p className="text-sm text-slate-600">
              장비를 반납할 때 장비 상태를 사진으로 촬영해주세요.
            </p>
          </CardHeader>
          <CardContent>
            {rental.status === 'rented' ? (
              <div className="space-y-4">
                {returnPreview ? (
                  <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-slate-200">
                    <Image
                      src={returnPreview}
                      alt="반납 확인 사진 미리보기"
                      fill
                      className="object-cover"
                    />
                  </div>
                ) : (
                  <div className="flex aspect-video w-full flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-slate-50">
                    <Camera className="h-12 w-12 text-slate-400" />
                    <p className="mt-2 text-sm text-slate-500">
                      반납 시 장비 상태 사진을 업로드해주세요
                    </p>
                  </div>
                )}

                <input
                  ref={returnInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handleReturnPhotoSelect}
                />

                <Button
                  className="w-full"
                  onClick={() => returnInputRef.current?.click()}
                  disabled={isUploadingReturn}
                >
                  {isUploadingReturn ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="mr-2 h-4 w-4" />
                  )}
                  반납 확인 사진 업로드
                </Button>
              </div>
            ) : (
              <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-4 text-center">
                <Check className="mx-auto h-8 w-8 text-emerald-600" />
                <p className="mt-2 font-medium text-emerald-700">반납 완료</p>
                {rental.returnedAt && (
                  <p className="mt-1 text-sm text-emerald-600">
                    {new Date(rental.returnedAt).toLocaleString('ko-KR')}
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

