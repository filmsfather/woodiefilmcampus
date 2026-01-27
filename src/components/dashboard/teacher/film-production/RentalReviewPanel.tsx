'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Camera, User, Calendar, MessageSquare } from 'lucide-react'

import {
  formatSetTypeLabel,
  formatRentalStatusLabel,
  getRentalStatusBadgeStyle,
  type EquipmentSetType,
  type EquipmentRentalStatus,
} from '@/lib/equipment-rental'
import { formatForDisplay } from '@/lib/date-util'
import { EQUIPMENT_RENTAL_BUCKET } from '@/lib/storage/buckets'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

interface RentalInfo {
  setType: EquipmentSetType
  id: string
  studentId: string
  studentName: string
  className: string | null
  memo: string | null
  status: EquipmentRentalStatus
  checkoutPhotoPath: string | null
  returnPhotoPath: string | null
  checkedOutAt: string | null
  returnedAt: string | null
  createdAt: string
}

interface RentalReviewPanelProps {
  rentals: RentalInfo[]
  selectedDate: string
}

function PhotoViewer({
  path,
  label,
  timestamp,
}: {
  path: string | null
  label: string
  timestamp: string | null
}) {
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadImage = async () => {
    if (!path) return
    setIsLoading(true)
    setError(null)

    try {
      const supabase = createClient()
      const { data, error: signError } = await supabase.storage
        .from(EQUIPMENT_RENTAL_BUCKET)
        .createSignedUrl(path, 60 * 5) // 5분 유효

      if (signError) {
        throw signError
      }

      setImageUrl(data.signedUrl)
    } catch (err) {
      console.error('[rental] image load error', err)
      setError('이미지를 불러올 수 없습니다.')
    } finally {
      setIsLoading(false)
    }
  }

  if (!path) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4">
        <Camera className="h-8 w-8 text-slate-400" />
        <span className="mt-2 text-sm text-slate-500">{label} 사진 없음</span>
      </div>
    )
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="flex h-auto flex-col items-center gap-2 p-4"
          onClick={loadImage}
        >
          <Camera className="h-6 w-6 text-slate-600" />
          <span className="text-sm font-medium">{label} 사진 보기</span>
          {timestamp && (
            <span className="text-xs text-slate-500">
              {formatForDisplay(timestamp, { dateStyle: 'short', timeStyle: 'short' })}
            </span>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{label} 사진</DialogTitle>
        </DialogHeader>
        <div className="flex items-center justify-center">
          {isLoading && <span className="text-slate-500">로딩 중...</span>}
          {error && <span className="text-red-500">{error}</span>}
          {imageUrl && (
            <Image
              src={imageUrl}
              alt={`${label} 사진`}
              width={600}
              height={400}
              className="max-h-[70vh] w-auto rounded-lg object-contain"
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function RentalReviewPanel({ rentals, selectedDate }: RentalReviewPanelProps) {
  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base font-semibold text-slate-900">
          {selectedDate} 대여 현황
        </CardTitle>
        <p className="text-sm text-slate-600">
          학생들이 제출한 대여/반납 사진을 비교하여 장비 상태를 확인합니다.
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {rentals.map((rental) => (
            <div
              key={rental.id}
              className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{formatSetTypeLabel(rental.setType)}</Badge>
                    <Badge className={getRentalStatusBadgeStyle(rental.status)}>
                      {formatRentalStatusLabel(rental.status)}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-slate-600">
                    <span className="flex items-center gap-1">
                      <User className="h-4 w-4" />
                      {rental.studentName}
                    </span>
                    {rental.className && (
                      <span className="text-slate-500">({rental.className})</span>
                    )}
                  </div>
                  {rental.memo && (
                    <div className="flex items-start gap-1 text-sm text-slate-500">
                      <MessageSquare className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{rental.memo}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1 text-xs text-slate-400">
                    <Calendar className="h-3 w-3" />
                    예약: {formatForDisplay(rental.createdAt, { dateStyle: 'short', timeStyle: 'short' })}
                  </div>
                </div>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <PhotoViewer
                  path={rental.checkoutPhotoPath}
                  label="대여 확인"
                  timestamp={rental.checkedOutAt}
                />
                <PhotoViewer
                  path={rental.returnPhotoPath}
                  label="반납 확인"
                  timestamp={rental.returnedAt}
                />
              </div>

              {rental.checkoutPhotoPath && rental.returnPhotoPath && (
                <div className="mt-3 rounded-md border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                  ✓ 대여/반납 사진이 모두 제출되었습니다. 장비 상태를 비교해주세요.
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

