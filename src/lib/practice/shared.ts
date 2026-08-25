import { createAdminClient } from '@/lib/supabase/admin'
import { getUniversityPreset } from '@/lib/university-policy/presets/universities'

export const PRACTICE_SLOT_MINUTES = 15
export const PRACTICE_START_HOUR = 8
export const PRACTICE_END_HOUR = 23
export const KST_OFFSET_MINUTES = 9 * 60

/** 원고 사진 업로드 시간을 고려한 제출 유예시간 */
export const PRACTICE_SUBMISSION_GRACE_MS = 3 * 60 * 1000

export const SIGNED_URL_TTL_SECONDS = 60 * 60

export type AssetRow = {
  id: string
  bucket: string | null
  path: string | null
}

export async function createSignedUrlMap(assetRows: AssetRow[]): Promise<Map<string, string>> {
  const admin = createAdminClient()
  const map = new Map<string, string>()

  const byBucket = new Map<string, AssetRow[]>()
  for (const row of assetRows) {
    if (!row.bucket || !row.path) continue
    const list = byBucket.get(row.bucket) ?? []
    list.push(row)
    byBucket.set(row.bucket, list)
  }

  for (const [bucket, rows] of byBucket) {
    const paths = rows.map((row) => row.path as string)
    const { data, error } = await admin.storage.from(bucket).createSignedUrls(paths, SIGNED_URL_TTL_SECONDS)
    if (error) {
      console.error('[practice] failed to create signed urls', error)
      continue
    }
    data?.forEach((entry, index) => {
      const row = rows[index]
      if (entry?.signedUrl && row) {
        map.set(row.id, entry.signedUrl)
      }
    })
  }

  return map
}

/**
 * practice_* 테이블의 university_id는 코드 프리셋의 slug다.
 * 프리셋에서 대학이 삭제/개명돼도 과거 기록이 깨지지 않도록 slug를 폴백으로 남긴다.
 */
export function resolveUniversityName(universityId: string | null | undefined): string {
  if (!universityId) {
    return '알 수 없는 대학'
  }
  return getUniversityPreset(universityId)?.name ?? universityId
}

export function normalizeMedia<T extends { id: string; bucket: string | null; path: string | null }>(
  value: T | T[] | null
): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null
  }
  return value
}

// 시간 유틸 ----------------------------------------------------------------------------
// 슬롯은 KST 기준 날짜(YYYY-MM-DD) + 시각(HH:MM)으로 다룬다.
// DB의 practice_slots.starts_at은 트리거가 KST를 UTC로 변환해 채운다.

export function parseTimeLabel(label: string): number {
  const match = label.match(/^(\d{1,2}):(\d{2})$/)
  if (!match) {
    throw new Error('잘못된 시간 형식입니다.')
  }
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (Number.isNaN(hours) || Number.isNaN(minutes) || hours > 23 || minutes > 59) {
    throw new Error('잘못된 시간 형식입니다.')
  }
  return hours * 60 + minutes
}

export function minutesToTimeLabel(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
}

export function toPgTime(label: string): string {
  return `${minutesToTimeLabel(parseTimeLabel(label))}:00`
}

/** PostgreSQL time("HH:MM:SS") -> "HH:MM" */
export function toTimeLabel(pgTime: string): string {
  const [hours, minutes] = pgTime.split(':')
  return `${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}`
}

/** start~end 구간을 slotMinutes 간격으로 쪼갠 시각 라벨 목록 */
export function buildSlotTimeLabels(startTime: string, endTime: string, slotMinutes: number): string[] {
  const start = parseTimeLabel(startTime)
  const end = parseTimeLabel(endTime)

  if (end <= start) {
    throw new Error('종료 시각은 시작 시각보다 뒤여야 합니다.')
  }
  if (slotMinutes <= 0) {
    throw new Error('슬롯 길이가 올바르지 않습니다.')
  }

  const labels: string[] = []
  for (let cursor = start; cursor + slotMinutes <= end; cursor += slotMinutes) {
    labels.push(minutesToTimeLabel(cursor))
  }
  return labels
}

/** 하루 전체 타임라인 (보드 행 라벨) */
export function buildDayTimeline(slotMinutes: number = PRACTICE_SLOT_MINUTES): string[] {
  return buildSlotTimeLabels(
    minutesToTimeLabel(PRACTICE_START_HOUR * 60),
    minutesToTimeLabel(PRACTICE_END_HOUR * 60),
    slotMinutes
  )
}

/** KST 날짜+시각을 UTC Date로 변환 */
export function kstToUtc(dateIso: string, timeLabel: string): Date {
  const minutes = parseTimeLabel(timeLabel)
  const base = Date.parse(`${dateIso}T00:00:00Z`)
  if (Number.isNaN(base)) {
    throw new Error('잘못된 날짜 형식입니다.')
  }
  return new Date(base + (minutes - KST_OFFSET_MINUTES) * 60_000)
}

// 예약 창 -----------------------------------------------------------------------------
// 예약 창은 슬롯이 속한 주 단위로 정해진다. 같은 주의 슬롯은 같은 시각에 함께 열리고 닫힌다.
//   1차: 2주 전 금요일 20:00 ~ 직전주 금요일 20:00 - 하루 1타임
//   2차: 직전주 금요일 20:00 ~ 슬롯 주 월요일 00:00 - 하루 3타임(누적)
// 마감(= 직전 일요일 자정) 이후에는 학생이 직접 예약/취소할 수 없고 교직원 배정만 가능하다.

export const PRACTICE_PHASE_OPEN_TIME = '20:00'
export const PRACTICE_BOOKING_CLOSE_TIME = '00:00'
export const PRACTICE_PHASE1_DAILY_LIMIT = 1
export const PRACTICE_PHASE2_DAILY_LIMIT = 3

const DAY_MS = 86_400_000

/** 슬롯 날짜가 속한 주의 월요일 날짜(YYYY-MM-DD). 주 단위 그룹핑 키로 쓴다. */
export function getWeekStartDate(dateIso: string): string {
  return getWeekMonday(dateIso).toISOString().slice(0, 10)
}

/** 슬롯 날짜가 속한 주의 월요일(KST 달력 기준) */
function getWeekMonday(dateIso: string): Date {
  const date = new Date(`${dateIso}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) {
    throw new Error('잘못된 날짜 형식입니다.')
  }
  const dayOffset = (date.getUTCDay() + 6) % 7
  return new Date(date.getTime() - dayOffset * DAY_MS)
}

export interface PracticeBookingWindow {
  phase1OpensAt: string
  phase2OpensAt: string
  /** 학생 자유 예약 마감. 슬롯 주 월요일 00:00 KST = 직전 일요일 자정 */
  closesAt: string
}

/** 슬롯 날짜 -> 학생 자유 예약 창(1차/2차 오픈 + 마감) UTC ISO */
export function getPracticeBookingWindow(dateIso: string): PracticeBookingWindow {
  const monday = getWeekMonday(dateIso)
  const toDateIso = (value: Date) => value.toISOString().slice(0, 10)
  const mondayIso = toDateIso(monday)

  return {
    phase1OpensAt: kstToUtc(
      toDateIso(new Date(monday.getTime() - 10 * DAY_MS)),
      PRACTICE_PHASE_OPEN_TIME
    ).toISOString(),
    phase2OpensAt: kstToUtc(
      toDateIso(new Date(monday.getTime() - 3 * DAY_MS)),
      PRACTICE_PHASE_OPEN_TIME
    ).toISOString(),
    closesAt: kstToUtc(mondayIso, PRACTICE_BOOKING_CLOSE_TIME).toISOString(),
  }
}

/** 학생이 직접 예약/취소할 수 있는 기간이 지났는지 */
export function isPracticeBookingClosed(
  closesAt: string | null | undefined,
  now: Date = new Date()
): boolean {
  if (!closesAt) {
    return false
  }
  const parsed = Date.parse(closesAt)
  if (Number.isNaN(parsed)) {
    return false
  }
  return parsed <= now.getTime()
}

/** 2차 오픈 전이면 하루 1타임, 이후면 하루 3타임(누적) */
export function getPracticeDailyLimit(phase2OpensAt: string | null | undefined, now: Date = new Date()): number {
  if (!phase2OpensAt) {
    return PRACTICE_PHASE1_DAILY_LIMIT
  }
  const parsed = Date.parse(phase2OpensAt)
  if (Number.isNaN(parsed)) {
    return PRACTICE_PHASE1_DAILY_LIMIT
  }
  return parsed <= now.getTime() ? PRACTICE_PHASE2_DAILY_LIMIT : PRACTICE_PHASE1_DAILY_LIMIT
}

export function formatKstDateTime(value: string | null | undefined): string {
  if (!value) {
    return '-'
  }
  const parsed = Date.parse(value)
  if (Number.isNaN(parsed)) {
    return '-'
  }
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    dateStyle: 'medium',
    timeStyle: 'short',
    hourCycle: 'h23',
  }).format(new Date(parsed))
}

export function formatKstTime(value: string | null | undefined): string {
  if (!value) {
    return '-'
  }
  const parsed = Date.parse(value)
  if (Number.isNaN(parsed)) {
    return '-'
  }
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    timeStyle: 'short',
    hourCycle: 'h23',
  }).format(new Date(parsed))
}

/** 학생 화면용 고사장 라벨. 과거 데이터(고사장 미배정)는 이름을 숨기고 미지정으로 표시한다. */
export function formatPracticeRoomLabel(roomNo: number | null | undefined): string {
  return roomNo ? `${roomNo}고사장` : '고사장 미지정'
}

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토']

export function formatSlotDateLabel(dateIso: string): string {
  const date = new Date(`${dateIso}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) {
    return dateIso
  }
  const month = date.getUTCMonth() + 1
  const day = date.getUTCDate()
  return `${month}월 ${day}일 (${WEEKDAY_LABELS[date.getUTCDay()]})`
}
