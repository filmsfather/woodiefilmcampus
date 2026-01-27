import { EquipmentSlotPlanner } from '@/components/dashboard/teacher/film-production/EquipmentSlotPlanner'
import { RentalReviewPanel } from '@/components/dashboard/teacher/film-production/RentalReviewPanel'
import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { requireAuthForDashboard } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  getMonthRange,
  getTodayISOInKst,
  type EquipmentRentalStatus,
  type EquipmentSetType,
  type EquipmentSlotStatus,
} from '@/lib/equipment-rental'

interface SearchParams {
  date?: string
}

interface ProfileInfo {
  id: string
  name: string | null
}

interface ClassInfo {
  id: string
  name: string
}

function normalizeDateParam(value: string | undefined, fallback: string) {
  if (!value) {
    return fallback
  }
  return /^\d{4}-\d{2}-\d{2}$/u.test(value) ? value : fallback
}

export default async function FilmProductionPage(props: {
  searchParams: Promise<SearchParams>
}) {
  await requireAuthForDashboard('teacher')
  const searchParams = await props.searchParams
  const today = getTodayISOInKst()
  const selectedDate = normalizeDateParam(searchParams?.date, today)

  const [yearStr, monthStr] = selectedDate.split('-')
  const year = Number(yearStr)
  const month = Number(monthStr)
  const { start, end } = getMonthRange(year, month)

  const supabase = createAdminClient()
  const { data: slotRows, error } = await supabase
    .from('equipment_slots')
    .select(
      `id,
       slot_date,
       set_type,
       status,
       notes,
       equipment_rentals (
         id,
         student_id,
         class_id,
         memo,
         status,
         checkout_photo_path,
         return_photo_path,
         checked_out_at,
         returned_at,
         created_at,
         profiles:student_id (
           id,
           name
         ),
         classes:class_id (
           id,
           name
         )
       )
      `
    )
    .gte('slot_date', start)
    .lte('slot_date', end)
    .order('slot_date', { ascending: true })

  if (error) {
    console.error('[equipment] slots fetch error', error)
  }

  const slots = slotRows ?? []

  // 월별 요약 생성
  const summaryMap = new Map<
    string,
    { setA: EquipmentSlotStatus | null; setB: EquipmentSlotStatus | null }
  >()

  for (const slot of slots) {
    const summary = summaryMap.get(slot.slot_date) ?? { setA: null, setB: null }
    if (slot.set_type === 'set_a') {
      summary.setA = slot.status as EquipmentSlotStatus
    } else if (slot.set_type === 'set_b') {
      summary.setB = slot.status as EquipmentSlotStatus
    }
    summaryMap.set(slot.slot_date, summary)
  }

  const monthSummary = Array.from(summaryMap.entries()).map(([date, summary]) => ({
    date,
    setA: summary.setA,
    setB: summary.setB,
  }))

  // 선택된 날짜의 슬롯 정보
  const daySlots = slots
    .filter((slot) => slot.slot_date === selectedDate)
    .map((slot) => {
      const rentals = slot.equipment_rentals as Array<{
        id: string
        student_id: string
        class_id: string | null
        memo: string | null
        status: string
        checkout_photo_path: string | null
        return_photo_path: string | null
        checked_out_at: string | null
        returned_at: string | null
        created_at: string
        profiles: unknown
        classes: unknown
      }> | null
      const firstRental = rentals?.[0]
      const profileData = firstRental?.profiles as ProfileInfo | null
      const classData = firstRental?.classes as ClassInfo | null

      return {
        id: slot.id,
        setType: slot.set_type as EquipmentSetType,
        status: slot.status as EquipmentSlotStatus,
        notes: slot.notes,
        rental: firstRental
          ? {
              id: firstRental.id,
              studentId: firstRental.student_id,
              studentName: profileData?.name ?? '알 수 없음',
              className: classData?.name ?? null,
              memo: firstRental.memo,
              status: firstRental.status as EquipmentRentalStatus,
              checkoutPhotoPath: firstRental.checkout_photo_path,
              returnPhotoPath: firstRental.return_photo_path,
              checkedOutAt: firstRental.checked_out_at,
              returnedAt: firstRental.returned_at,
              createdAt: firstRental.created_at,
            }
          : null,
      }
    })

  return (
    <section className="space-y-6">
      <div className="space-y-3">
        <DashboardBackLink fallbackHref="/dashboard/teacher" label="대시보드로 돌아가기" />
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-slate-900">영화제작</h1>
          <p className="text-sm text-slate-600">
            촬영 장비 예약 슬롯을 관리하고 학생들의 대여/반납 현황을 확인합니다.
          </p>
        </div>
      </div>

      <EquipmentSlotPlanner
        today={today}
        selectedDate={selectedDate}
        daySlots={daySlots}
        monthSummary={monthSummary}
      />

      {daySlots.some((slot) => slot.rental) && (
        <RentalReviewPanel
          rentals={daySlots
            .filter((slot) => slot.rental)
            .map((slot) => ({
              setType: slot.setType,
              ...slot.rental!,
            }))}
          selectedDate={selectedDate}
        />
      )}
    </section>
  )
}

