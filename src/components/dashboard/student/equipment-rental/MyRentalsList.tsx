'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Calendar, Camera, ChevronRight, Loader2 } from 'lucide-react'

import {
  formatSetTypeLabel,
  formatRentalStatusLabel,
  getRentalStatusBadgeStyle,
  type EquipmentSetType,
  type EquipmentRentalStatus,
} from '@/lib/equipment-rental'
import { cancelMyRental } from '@/app/dashboard/student/equipment-rental/actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

interface RentalInfo {
  id: string
  slotId: string
  slotDate: string
  setType: EquipmentSetType
  memo: string | null
  status: EquipmentRentalStatus
  checkoutPhotoPath: string | null
  returnPhotoPath: string | null
  checkedOutAt: string | null
  returnedAt: string | null
  createdAt: string
}

interface MyRentalsListProps {
  rentals: RentalInfo[]
}

export function MyRentalsList({ rentals }: MyRentalsListProps) {
  const router = useRouter()
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const activeRentals = rentals.filter((r) => r.status !== 'returned')
  const pastRentals = rentals.filter((r) => r.status === 'returned')

  const handleCancel = async (rentalId: string) => {
    setCancellingId(rentalId)
    setError(null)

    try {
      const result = await cancelMyRental({ rentalId })
      if (result?.error) {
        setError(result.error)
      } else {
        router.refresh()
      }
    } catch (err) {
      console.error('[equipment] cancel rental error', err)
      setError('예약 취소에 실패했습니다.')
    } finally {
      setCancellingId(null)
    }
  }

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base font-semibold text-slate-900">내 대여 내역</CardTitle>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </div>
        )}

        {activeRentals.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-slate-700">진행 중인 대여</h3>
            <div className="space-y-2">
              {activeRentals.map((rental) => (
                <div
                  key={rental.id}
                  className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4"
                >
                  <Link
                    href={`/dashboard/student/equipment-rental/${rental.id}`}
                    className="flex flex-1 items-center gap-4 transition hover:opacity-80"
                  >
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{formatSetTypeLabel(rental.setType)}</Badge>
                        <Badge className={getRentalStatusBadgeStyle(rental.status)}>
                          {formatRentalStatusLabel(rental.status)}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-slate-600">
                        <Calendar className="h-4 w-4" />
                        <span>{rental.slotDate}</span>
                      </div>
                    </div>
                  </Link>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        <Camera className="h-3 w-3" />
                        대여: {rental.checkoutPhotoPath ? '✓' : '—'}
                      </span>
                      <span className="flex items-center gap-1">
                        <Camera className="h-3 w-3" />
                        반납: {rental.returnPhotoPath ? '✓' : '—'}
                      </span>
                    </div>
                    {rental.status === 'pending' && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 px-2 text-xs text-red-600 hover:bg-red-50 hover:text-red-700"
                            disabled={cancellingId === rental.id}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {cancellingId === rental.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              '취소'
                            )}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>예약을 취소하시겠습니까?</AlertDialogTitle>
                            <AlertDialogDescription>
                              {rental.slotDate} {formatSetTypeLabel(rental.setType)} 예약을
                              취소합니다. 이 작업은 되돌릴 수 없습니다.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>돌아가기</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-red-600 hover:bg-red-700"
                              onClick={() => handleCancel(rental.id)}
                            >
                              예약 취소
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                    <Link href={`/dashboard/student/equipment-rental/${rental.id}`}>
                      <ChevronRight className="h-5 w-5 text-slate-400" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {pastRentals.length > 0 && (
          <div className={activeRentals.length > 0 ? 'mt-6 space-y-3' : 'space-y-3'}>
            <h3 className="text-sm font-medium text-slate-500">지난 대여</h3>
            <div className="space-y-2">
              {pastRentals.slice(0, 5).map((rental) => (
                <Link
                  key={rental.id}
                  href={`/dashboard/student/equipment-rental/${rental.id}`}
                  className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm transition hover:bg-slate-100"
                >
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="text-xs">
                      {formatSetTypeLabel(rental.setType)}
                    </Badge>
                    <span className="text-slate-600">{rental.slotDate}</span>
                    <Badge className={getRentalStatusBadgeStyle(rental.status)}>
                      {formatRentalStatusLabel(rental.status)}
                    </Badge>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-400" />
                </Link>
              ))}
            </div>
          </div>
        )}

        {rentals.length === 0 && (
          <p className="py-8 text-center text-sm text-slate-500">아직 대여 내역이 없습니다.</p>
        )}
      </CardContent>
    </Card>
  )
}

