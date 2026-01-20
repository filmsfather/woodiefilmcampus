import { EquipmentCalendar } from '@/components/dashboard/student/equipment-rental/EquipmentCalendar'
import { MyRentalsList } from '@/components/dashboard/student/equipment-rental/MyRentalsList'
import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { requireAuthForDashboard } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
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

interface RentalInfoRaw {
  id: string
  student_id: string
  class_id: string | null
  status: EquipmentRentalStatus
  profiles: { name: string }[] | { name: string } | null
  classes: { name: string }[] | { name: string } | null
}

interface SlotRow {
  id: string
  slot_date: string
  set_type: EquipmentSetType
  status: EquipmentSlotStatus
  equipment_rentals: RentalInfoRaw[]
}

interface SlotInfo {
  slot_date: string
  set_type: EquipmentSetType
}

interface ClassRow {
  id: string
  name: string
}

function normalizeDateParam(value: string | undefined, fallback: string) {
  if (!value) {
    return fallback
  }
  return /^\d{4}-\d{2}-\d{2}$/u.test(value) ? value : fallback
}

export default async function EquipmentRentalPage(props: {
  searchParams: Promise<SearchParams>
}) {
  const { profile } = await requireAuthForDashboard('student')
  const searchParams = await props.searchParams
  const today = getTodayISOInKst()
  const selectedDate = normalizeDateParam(searchParams?.date, today)

  const [yearStr, monthStr] = selectedDate.split('-')
  const year = Number(yearStr)
  const month = Number(monthStr)
  const { start, end } = getMonthRange(year, month)

  const supabase = await createClient()

  // 모든 슬롯(오픈 + 예약됨) 가져오기, 예약 정보 포함
  const { data: slotRows, error: slotError } = await supabase
    .from('equipment_slots')
    .select(
      `id,
       slot_date,
       set_type,
       status,
       equipment_rentals (
         id,
         student_id,
         class_id,
         status,
         profiles:student_id (name),
         classes:class_id (name)
       )`
    )
    .gte('slot_date', start)
    .lte('slot_date', end)
    .in('status', ['open', 'reserved'])
    .order('slot_date', { ascending: true })

  if (slotError) {
    console.error('[equipment] slots fetch error', slotError)
  }

  const slots = (slotRows ?? []) as SlotRow[]

  // 학생의 기존 대여 목록
  const { data: rentalRows, error: rentalError } = await supabase
    .from('equipment_rentals')
    .select(
      `id,
       slot_id,
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
       )`
    )
    .eq('student_id', profile.id)
    .order('created_at', { ascending: false })
    .limit(20)

  if (rentalError) {
    console.error('[equipment] rentals fetch error', rentalError)
  }

  const myRentals = (rentalRows ?? []).map((r) => {
    const slotData = r.equipment_slots as unknown as SlotInfo | null
    return {
      id: r.id,
      slotId: r.slot_id,
      slotDate: slotData?.slot_date ?? '',
      setType: (slotData?.set_type ?? 'set_a') as EquipmentSetType,
      memo: r.memo,
      status: r.status as EquipmentRentalStatus,
      checkoutPhotoPath: r.checkout_photo_path,
      returnPhotoPath: r.return_photo_path,
      checkedOutAt: r.checked_out_at,
      returnedAt: r.returned_at,
      createdAt: r.created_at,
    }
  })

  // 학생이 속한 반 가져오기
  const { data: classStudentRows } = await supabase
    .from('class_students')
    .select('class_id, classes:class_id(id, name)')
    .eq('student_id', profile.id)

  const classes: ClassRow[] = (classStudentRows ?? [])
    .map((row) => (row.classes as unknown as ClassRow))
    .filter((c): c is ClassRow => c !== null)

  // 슬롯을 날짜별로 그룹화 (예약 정보 포함)
  interface SlotEntry {
    slotId: string | null
    status: EquipmentSlotStatus
    rental: {
      id: string
      studentName: string
      className: string | null
      status: EquipmentRentalStatus
    } | null
  }

  const slotsByDate = new Map<string, { setA: SlotEntry | null; setB: SlotEntry | null }>()
  for (const slot of slots) {
    const entry = slotsByDate.get(slot.slot_date) ?? { setA: null, setB: null }
    const activeRental = slot.equipment_rentals?.find(
      (r) => r.status === 'pending' || r.status === 'rented'
    )

    // profiles와 classes가 배열 또는 객체일 수 있음
    const getProfileName = (profiles: RentalInfoRaw['profiles']) => {
      if (!profiles) return '알 수 없음'
      if (Array.isArray(profiles)) return profiles[0]?.name ?? '알 수 없음'
      return profiles.name
    }
    const getClassName = (classes: RentalInfoRaw['classes']) => {
      if (!classes) return null
      if (Array.isArray(classes)) return classes[0]?.name ?? null
      return classes.name
    }

    const slotEntry: SlotEntry = {
      slotId: slot.status === 'open' ? slot.id : null,
      status: slot.status,
      rental: activeRental
        ? {
            id: activeRental.id,
            studentName: getProfileName(activeRental.profiles),
            className: getClassName(activeRental.classes),
            status: activeRental.status,
          }
        : null,
    }

    if (slot.set_type === 'set_a') {
      entry.setA = slotEntry
    } else if (slot.set_type === 'set_b') {
      entry.setB = slotEntry
    }
    slotsByDate.set(slot.slot_date, entry)
  }

  const availableSlots = Array.from(slotsByDate.entries()).map(([date, entry]) => ({
    date,
    setA: entry.setA,
    setB: entry.setB,
  }))

  return (
    <section className="space-y-6">
      <div className="space-y-3">
        <DashboardBackLink fallbackHref="/dashboard/student" label="대시보드로 돌아가기" />
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-slate-900">장비 대여</h1>
          <p className="text-sm text-slate-600">
            촬영 장비(A세트/B세트)를 예약하고 대여/반납을 진행합니다.
          </p>
        </div>
      </div>

      <EquipmentCalendar
        today={today}
        selectedDate={selectedDate}
        availableSlots={availableSlots}
        classes={classes}
        studentId={profile.id}
      />

      {myRentals.length > 0 && <MyRentalsList rentals={myRentals} />}
    </section>
  )
}

