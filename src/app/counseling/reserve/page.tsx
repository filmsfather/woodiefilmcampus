
import { PublicCounselingReservation } from '@/components/counseling/PublicCounselingReservation'
import {
  CounselingSlotStatus,
  getMonthRange,
  getTodayISOInKst,
} from '@/lib/counseling'
import { createClient } from '@/lib/supabase/server'

interface SearchParams {
  date?: string
}

interface SlotRow {
  id: string
  counseling_date: string
  start_time: string
  status: CounselingSlotStatus
}

interface QuestionRow {
  id: string
  field_key: string
  prompt: string
  field_type: 'text' | 'textarea' | 'select'
  is_required: boolean
  position: number
  select_options: string[]
}

function normalizeDate(value: string | undefined, fallback: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    return fallback
  }
  return value < fallback ? fallback : value
}

export default async function CounselingReservePage({ searchParams }: { searchParams?: SearchParams }) {
  const today = getTodayISOInKst()
  const selectedDate = normalizeDate(searchParams?.date, today)
  const [yearStr, monthStr] = selectedDate.split('-')
  const year = Number(yearStr)
  const month = Number(monthStr)
  const { start, end } = getMonthRange(year, month)

  const supabase = createClient()

  const [{ data: slotRows, error: slotError }, { data: questionRows, error: questionError }] = await Promise.all([
    supabase
      .from('counseling_slots')
      .select('id, counseling_date, start_time, status')
      .in('status', ['open', 'booked'])
      .gte('counseling_date', start)
      .lte('counseling_date', end)
      .order('counseling_date', { ascending: true })
      .order('start_time', { ascending: true }),
    supabase
      .from('counseling_questions')
      .select('id, field_key, prompt, field_type, is_required, position, select_options')
      .eq('is_active', true)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true }),
  ])

  if (slotError) {
    console.error('[counseling] public slot fetch error', slotError)
  }

  if (questionError) {
    console.error('[counseling] public question fetch error', questionError)
  }

  const slots = (slotRows ?? []) as SlotRow[]
  const monthSummaryMap = new Map<string, number>()

  for (const slot of slots) {
    if (!monthSummaryMap.has(slot.counseling_date)) {
      monthSummaryMap.set(slot.counseling_date, 0)
    }

    if (slot.status === 'open') {
      const count = monthSummaryMap.get(slot.counseling_date) ?? 0
      monthSummaryMap.set(slot.counseling_date, count + 1)
    }
  }

  const monthSummary = Array.from(monthSummaryMap.entries()).map(([date, open]) => ({ date, open }))

  const daySlots = slots
    .filter((slot) => slot.counseling_date === selectedDate)
    .map((slot) => ({ id: slot.id, start_time: slot.start_time, status: slot.status }))

  const questions = (questionRows ?? []).map((question: QuestionRow) => ({
    id: question.id,
    field_key: question.field_key,
    prompt: question.prompt,
    field_type: question.field_type,
    is_required: question.is_required,
    select_options: question.select_options ?? [],
  }))

  return (
    <PublicCounselingReservation
      today={today}
      selectedDate={selectedDate}
      daySlots={daySlots}
      monthSummary={monthSummary}
      questions={questions}
    />
  )
}
