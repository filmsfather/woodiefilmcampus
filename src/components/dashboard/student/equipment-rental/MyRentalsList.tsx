'use client'

import Link from 'next/link'
import { Calendar, Camera, ChevronRight } from 'lucide-react'

import {
  formatSetTypeLabel,
  formatRentalStatusLabel,
  getRentalStatusBadgeStyle,
  type EquipmentSetType,
  type EquipmentRentalStatus,
} from '@/lib/equipment-rental'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

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
  const activeRentals = rentals.filter((r) => r.status !== 'returned')
  const pastRentals = rentals.filter((r) => r.status === 'returned')

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base font-semibold text-slate-900">내 대여 내역</CardTitle>
      </CardHeader>
      <CardContent>
        {activeRentals.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-slate-700">진행 중인 대여</h3>
            <div className="space-y-2">
              {activeRentals.map((rental) => (
                <Link
                  key={rental.id}
                  href={`/dashboard/student/equipment-rental/${rental.id}`}
                  className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  <div className="flex items-center gap-4">
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
                  </div>
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
                    <ChevronRight className="h-5 w-5 text-slate-400" />
                  </div>
                </Link>
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

