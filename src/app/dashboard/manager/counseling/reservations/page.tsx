import { ManagerReservationBoard } from '@/components/counseling/ManagerReservationBoard'
import {
  CounselingReservationStatus,
  CounselingSlotStatus,
  getTodayISOInKst,
  getWeekRange,
} from '@/lib/counseling'
import { requireAuthForDashboard } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

interface SearchParams {
  date?: string
  view?: string
}

interface ReservationRow {
  id: string
  student_name: string
  contact_phone: string
  academic_record: string | null
  target_university: string | null
  question: string | null
  additional_answers: Record<string, unknown> | null
  status: CounselingReservationStatus
  memo: string | null
  created_at: string
}

interface SlotRow {
  id: string
  counseling_date: string
  start_time: string
  status: CounselingSlotStatus
  counseling_reservations: ReservationRow[] | null
}

function normalizeDateParam(value: string | undefined, fallback: string) {
  if (!value) {
    return fallback
  }
  return /^\d{4}-\d{2}-\d{2}$/u.test(value) ? value : fallback
}

function normalizeView(value: string | undefined) {
  if (value === 'day' || value === 'week') {
    return value
  }
  return 'week'
}

export default async function ManagerCounselingReservationsPage(props: {
  searchParams: Promise<SearchParams>
}) {
  await requireAuthForDashboard('manager')

  const searchParams = await props.searchParams

  const today = getTodayISOInKst()
  const selectedDate = normalizeDateParam(searchParams?.date, today)
  const view = normalizeView(searchParams?.view)

  const selectedDateObj = new Date(`${selectedDate}T00:00:00Z`)
  const weekRange = getWeekRange(selectedDateObj)
  const rangeStart = view === 'day' ? selectedDate : weekRange.start
  const rangeEnd = view === 'day' ? selectedDate : weekRange.end

  const supabase = await createClient()

  const [{ data: slotRows, error: slotError }, { data: questionRows, error: questionError }] = await Promise.all([
    supabase
      .from('counseling_slots')
      .select(
        `id,
         counseling_date,
         start_time,
         status,
         counseling_reservations (
           id,
           student_name,
           contact_phone,
           academic_record,
           target_university,
           question,
           additional_answers,
           status,
           memo,
           created_at
         )
        `
      )
      .gte('counseling_date', rangeStart)
      .lte('counseling_date', rangeEnd)
      .order('counseling_date', { ascending: true })
      .order('start_time', { ascending: true }),
    supabase.from('counseling_questions').select('field_key, prompt'),
  ])

  if (slotError) {
    console.error('[counseling] reservations slot fetch error', slotError)
  }

  if (questionError) {
    console.error('[counseling] question fetch error', questionError)
  }

  const reservations = []
  for (const slot of (slotRows ?? []) as SlotRow[]) {
    for (const reservation of slot.counseling_reservations ?? []) {
      reservations.push({
        id: reservation.id,
        student_name: reservation.student_name,
        contact_phone: reservation.contact_phone,
        academic_record: reservation.academic_record,
        target_university: reservation.target_university,
        question: reservation.question,
        additional_answers: reservation.additional_answers ?? {},
        status: reservation.status,
        memo: reservation.memo,
        created_at: reservation.created_at,
        slot: {
          id: slot.id,
          counseling_date: slot.counseling_date,
          start_time: slot.start_time,
          status: slot.status,
        },
      })
    }
  }

  reservations.sort((a, b) => {
    if (a.slot.counseling_date !== b.slot.counseling_date) {
      return a.slot.counseling_date < b.slot.counseling_date ? -1 : 1
    }
    return a.slot.start_time < b.slot.start_time ? -1 : 1
  })

  const questionDictionary = Object.fromEntries(
    (questionRows ?? []).map(({ field_key, prompt }) => [field_key, prompt])
  )

  return (
    <ManagerReservationBoard
      selectedDate={selectedDate}
      view={view}
      rangeStart={rangeStart}
      rangeEnd={rangeEnd}
      reservations={reservations}
      questionLabels={questionDictionary}
    />
  )
}
