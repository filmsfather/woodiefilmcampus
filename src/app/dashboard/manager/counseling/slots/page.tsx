import { ManagerSlotPlanner } from '@/components/counseling/ManagerSlotPlanner'
import {
  CounselingReservationStatus,
  CounselingSlotStatus,
  getMonthRange,
  getTodayISOInKst,
} from '@/lib/counseling'
import { requireAuthForDashboard } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

interface SearchParams {
  date?: string
}

interface ReservationRow {
  id: string
  student_name: string
  contact_phone: string
  academic_record: string | null
  target_university: string | null
  question: string | null
  status: CounselingReservationStatus
  created_at: string
}

interface SlotRow {
  id: string
  counseling_date: string
  start_time: string
  duration_minutes: number
  status: CounselingSlotStatus
  notes: string | null
  counseling_reservations: ReservationRow[] | null
}

function normalizeDateParam(value: string | undefined, fallback: string) {
  if (!value) {
    return fallback
  }
  return /^\d{4}-\d{2}-\d{2}$/u.test(value) ? value : fallback
}

export default async function ManagerCounselingSlotsPage({ searchParams }: { searchParams?: SearchParams }) {
  await requireAuthForDashboard('manager')
  const today = getTodayISOInKst()
  const selectedDate = normalizeDateParam(searchParams?.date, today)

  const [yearStr, monthStr] = selectedDate.split('-')
  const year = Number(yearStr)
  const month = Number(monthStr)
  const { start, end } = getMonthRange(year, month)

  const supabase = createClient()
  const { data: slotRows, error } = await supabase
    .from('counseling_slots')
    .select(
      `id,
       counseling_date,
       start_time,
       duration_minutes,
       status,
       notes,
       counseling_reservations (
         id,
         student_name,
         contact_phone,
         academic_record,
         target_university,
         question,
         status,
         created_at
       )
      `
    )
    .gte('counseling_date', start)
    .lte('counseling_date', end)
    .order('counseling_date', { ascending: true })
    .order('start_time', { ascending: true })

  if (error) {
    console.error('[counseling] slots fetch error', error)
  }

  const slots = (slotRows ?? []) as SlotRow[]
  const summaryMap = new Map<string, { total: number; open: number; booked: number; closed: number }>()

  for (const slot of slots) {
    const summary = summaryMap.get(slot.counseling_date) ?? {
      total: 0,
      open: 0,
      booked: 0,
      closed: 0,
    }
    summary.total += 1
    if (slot.status === 'open') {
      summary.open += 1
    } else if (slot.status === 'booked') {
      summary.booked += 1
    } else if (slot.status === 'closed') {
      summary.closed += 1
    }
    summaryMap.set(slot.counseling_date, summary)
  }

  const monthSummary = Array.from(summaryMap.entries()).map(([date, counts]) => ({
    date,
    total: counts.total,
    open: counts.open,
    booked: counts.booked,
    closed: counts.closed,
  }))

  const daySlots = slots
    .filter((slot) => slot.counseling_date === selectedDate)
    .map((slot) => ({
      id: slot.id,
      start_time: slot.start_time,
      status: slot.status,
      duration_minutes: slot.duration_minutes,
      notes: slot.notes,
      reservations: (slot.counseling_reservations ?? []).map((reservation) => ({
        id: reservation.id,
        student_name: reservation.student_name,
        contact_phone: reservation.contact_phone,
        academic_record: reservation.academic_record,
        target_university: reservation.target_university,
        question: reservation.question,
        status: reservation.status,
        created_at: reservation.created_at,
      })),
    }))

  return (
    <ManagerSlotPlanner
      today={today}
      selectedDate={selectedDate}
      daySlots={daySlots}
      monthSummary={monthSummary}
    />
  )
}
