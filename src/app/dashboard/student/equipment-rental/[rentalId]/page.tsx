import { notFound, redirect } from 'next/navigation'

import { RentalForm } from '@/components/dashboard/student/equipment-rental/RentalForm'
import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { requireAuthForDashboard } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import {
  formatSetTypeLabel,
  type EquipmentRentalStatus,
  type EquipmentSetType,
} from '@/lib/equipment-rental'

interface PageParams {
  rentalId: string
}

interface SlotInfo {
  slot_date: string
  set_type: EquipmentSetType
}

interface ClassInfo {
  id: string
  name: string
}

export default async function RentalDetailPage(props: {
  params: Promise<PageParams>
}) {
  const { profile } = await requireAuthForDashboard('student')
  const params = await props.params

  const supabase = await createClient()
  const { data: rental, error } = await supabase
    .from('equipment_rentals')
    .select(
      `id,
       slot_id,
       student_id,
       class_id,
       memo,
       status,
       checkout_photo_path,
       return_photo_path,
       checked_out_at,
       returned_at,
       created_at,
       equipment_slots (
         slot_date,
         set_type
       ),
       classes:class_id (
         id,
         name
       )`
    )
    .eq('id', params.rentalId)
    .maybeSingle()

  if (error) {
    console.error('[equipment] fetch rental error', error)
    notFound()
  }

  if (!rental) {
    notFound()
  }

  // 본인 대여가 아니면 리다이렉트
  if (rental.student_id !== profile.id) {
    redirect('/dashboard/student/equipment-rental')
  }

  const slotData = rental.equipment_slots as unknown as SlotInfo | null
  const classData = rental.classes as unknown as ClassInfo | null

  const rentalInfo = {
    id: rental.id,
    slotDate: slotData?.slot_date ?? '',
    setType: (slotData?.set_type ?? 'set_a') as EquipmentSetType,
    className: classData?.name ?? null,
    memo: rental.memo,
    status: rental.status as EquipmentRentalStatus,
    checkoutPhotoPath: rental.checkout_photo_path,
    returnPhotoPath: rental.return_photo_path,
    checkedOutAt: rental.checked_out_at,
    returnedAt: rental.returned_at,
    createdAt: rental.created_at,
  }

  return (
    <section className="space-y-6">
      <div className="space-y-3">
        <DashboardBackLink fallbackHref="/dashboard/student/equipment-rental" label="장비 대여 목록" />
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-slate-900">
            {formatSetTypeLabel(rentalInfo.setType)} 대여
          </h1>
          <p className="text-sm text-slate-600">
            {rentalInfo.slotDate} 장비 대여 신청서
          </p>
        </div>
      </div>
      <RentalForm rental={rentalInfo} studentId={profile.id} />
    </section>
  )
}

