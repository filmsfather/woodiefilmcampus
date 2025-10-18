import { createHash, randomUUID } from 'crypto'

export type CounselingSlotStatus = 'open' | 'booked' | 'closed'
export type CounselingReservationStatus = 'confirmed' | 'completed' | 'canceled'
export type CounselingQuestionFieldType = 'text' | 'textarea'

export interface CounselingSlot {
  id: string
  counseling_date: string
  start_time: string
  duration_minutes: number
  status: CounselingSlotStatus
  notes: string | null
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

export interface CounselingReservation {
  id: string
  slot_id: string
  student_name: string
  contact_phone: string
  academic_record: string | null
  target_university: string | null
  question: string | null
  additional_answers: Record<string, unknown>
  status: CounselingReservationStatus
  managed_by: string | null
  managed_at: string | null
  memo: string | null
  created_at: string
  updated_at: string
}

export interface CounselingQuestion {
  id: string
  field_key: string
  prompt: string
  field_type: CounselingQuestionFieldType
  is_required: boolean
  is_active: boolean
  position: number
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

export const COUNSELING_SLOT_INTERVAL_MINUTES = 30
export const COUNSELING_START_HOUR = 8
export const COUNSELING_END_HOUR = 12
export const KST_OFFSET_MINUTES = 9 * 60

export function getKstDate(now: Date = new Date()): Date {
  const offset = KST_OFFSET_MINUTES + now.getTimezoneOffset()
  return new Date(now.getTime() + offset * 60_000)
}

export function formatDateToISO(date: Date): string {
  const year = date.getUTCFullYear()
  const month = `${date.getUTCMonth() + 1}`.padStart(2, '0')
  const day = `${date.getUTCDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function getTodayISOInKst(): string {
  const kstNow = getKstDate()
  const utc = new Date(Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate()))
  return formatDateToISO(utc)
}

export interface MonthRange {
  start: string
  end: string
}

export interface CalendarCell {
  date: string
  label: number
  inCurrentMonth: boolean
}

export function getMonthRange(year: number, month: number): MonthRange {
  const startUtc = new Date(Date.UTC(year, month - 1, 1))
  const endUtc = new Date(Date.UTC(year, month, 0))
  return {
    start: formatDateToISO(startUtc),
    end: formatDateToISO(endUtc),
  }
}

export function shiftIsoDate(date: string, days: number): string {
  const base = new Date(`${date}T00:00:00Z`)
  base.setUTCDate(base.getUTCDate() + days)
  return formatDateToISO(base)
}

export function buildCalendarCells(year: number, month: number): CalendarCell[] {
  const firstDay = new Date(Date.UTC(year, month - 1, 1))
  const startOffset = firstDay.getUTCDay()
  const startDate = new Date(Date.UTC(year, month - 1, 1 - startOffset))
  const cells: CalendarCell[] = []

  for (let index = 0; index < 42; index += 1) {
    const cellDate = new Date(startDate.getTime() + index * 86_400_000)
    cells.push({
      date: formatDateToISO(cellDate),
      label: cellDate.getUTCDate(),
      inCurrentMonth: cellDate.getUTCMonth() === month - 1,
    })
  }

  return cells
}

export function ensureValidSlotTime(timeLabel: string) {
  const match = timeLabel.match(/^(\d{1,2}):(\d{2})$/)
  if (!match) {
    throw new Error('잘못된 시간 형식입니다.')
  }
  const hours = Number(match[1])
  const minutes = Number(match[2])
  const isEdgeHour = hours === COUNSELING_END_HOUR
  if (
    Number.isNaN(hours) ||
    Number.isNaN(minutes) ||
    minutes % COUNSELING_SLOT_INTERVAL_MINUTES !== 0 ||
    hours < COUNSELING_START_HOUR ||
    hours > COUNSELING_END_HOUR ||
    (isEdgeHour && minutes > 0) ||
    (isEdgeHour && minutes === 0)
  ) {
    throw new Error('허용되지 않은 시간 범위입니다.')
  }
}

export function toPgTime(timeLabel: string) {
  ensureValidSlotTime(timeLabel)
  const [h, m] = timeLabel.split(':')
  return `${h.padStart(2, '0')}:${m.padStart(2, '0')}:00`
}

export interface DayTimeSlot {
  label: string
  pgTime: string
}

export function buildDailyTimeline(): DayTimeSlot[] {
  const slots: DayTimeSlot[] = []
  for (let hour = COUNSELING_START_HOUR; hour < COUNSELING_END_HOUR; hour += 1) {
    const base = `${hour}`.padStart(2, '0')
    slots.push({ label: `${base}:00`, pgTime: `${base}:00:00` })
    slots.push({ label: `${base}:30`, pgTime: `${base}:30:00` })
  }
  slots.push({ label: `${COUNSELING_END_HOUR}:00`, pgTime: `${COUNSELING_END_HOUR.toString().padStart(2, '0')}:00:00` })
  return slots.slice(0, -1)
}

export function comparePgTime(a: string, b: string) {
  return a.localeCompare(b)
}

export function hashQuestionPrompt(prompt: string) {
  return createHash('sha256').update(prompt).digest('hex').slice(0, 12)
}

export function generateQuestionFieldKey(prefix = 'custom') {
  const raw = randomUUID().replace(/-/g, '')
  return `${prefix}_${raw.slice(0, 10)}`
}

export interface PublicSlotAvailability {
  date: string
  slots: Array<{
    id: string
    time: string
    status: CounselingSlotStatus
  }>
}

export function groupSlotsByDate(slots: Array<{ counseling_date: string; start_time: string; status: CounselingSlotStatus; id: string }>): Record<string, { id: string; start_time: string; status: CounselingSlotStatus }[]> {
  return slots.reduce<Record<string, { id: string; start_time: string; status: CounselingSlotStatus }[]>>((acc, slot) => {
    const list = acc[slot.counseling_date] ?? []
    list.push({ id: slot.id, start_time: slot.start_time, status: slot.status })
    acc[slot.counseling_date] = list
    return acc
  }, {})
}

export function toDisplayTime(pgTime: string) {
  const [hours, minutes] = pgTime.split(':')
  return `${hours}:${minutes}`
}

export function addMinutesToTime(pgTime: string, minutes: number) {
  const [h, m] = pgTime.split(':').map((value) => Number(value))
  const totalMinutes = h * 60 + m + minutes
  const nextHours = Math.floor(totalMinutes / 60)
  const nextMinutes = totalMinutes % 60
  return `${nextHours.toString().padStart(2, '0')}:${nextMinutes.toString().padStart(2, '0')}:00`
}

export function getWeekRange(date: Date): MonthRange {
  const dayOfWeek = date.getUTCDay() === 0 ? 7 : date.getUTCDay()
  const monday = new Date(date)
  monday.setUTCDate(date.getUTCDate() - dayOfWeek + 1)
  const sunday = new Date(monday)
  sunday.setUTCDate(monday.getUTCDate() + 6)
  return {
    start: formatDateToISO(monday),
    end: formatDateToISO(sunday),
  }
}
