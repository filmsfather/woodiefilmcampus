/*
  중앙 시간 유틸. 서버와 클라이언트 모두 UTC 기준으로 계산하고, UI 표시는 로컬 포맷으로 변환한다.
*/

export type DateLike = string | number | Date

interface ServerClockState {
  baseTimeMs: number
  capturedAtMs: number
}

let serverClock: ServerClockState | null = null
let clientOffsetMs: number | null = null

const isBrowser = typeof window !== "undefined"

const MS_IN_DAY = 86_400_000

function toDate(value?: DateLike | null): Date {
  if (value instanceof Date) {
    return new Date(value.getTime())
  }

  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) {
      return parsed
    }
  }

  return new Date()
}

function getUtcDayTimestamp(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}

function getElapsedMs(fromMs: number): number {
  return Date.now() - fromMs
}

function normalizeUtcDate(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

function startOfWeekUTC(value: DateLike, weekStartsOn: number): Date {
  const date = normalizeUtcDate(toDate(value))
  const currentDow = date.getUTCDay()
  const diff = (currentDow - weekStartsOn + 7) % 7
  date.setUTCDate(date.getUTCDate() - diff)
  return date
}

export function initServerClock(serverNow?: DateLike) {
  const base = serverNow ? toDate(serverNow) : new Date()
  serverClock = {
    baseTimeMs: base.getTime(),
    capturedAtMs: Date.now(),
  }
}

export function initClientClock(serverNow: DateLike) {
  const serverTime = toDate(serverNow).getTime()
  clientOffsetMs = serverTime - Date.now()
}

export function getClientOffsetMs(): number {
  return clientOffsetMs ?? 0
}

export function nowUTC(): Date {
  if (isBrowser && clientOffsetMs !== null) {
    return new Date(Date.now() + clientOffsetMs)
  }

  if (!isBrowser && serverClock) {
    return new Date(serverClock.baseTimeMs + getElapsedMs(serverClock.capturedAtMs))
  }

  if (serverClock) {
    return new Date(serverClock.baseTimeMs + getElapsedMs(serverClock.capturedAtMs))
  }

  return new Date()
}

export function toUTCDate(value: DateLike): Date {
  return toDate(value)
}

export function toISOString(value: DateLike): string {
  return toDate(value).toISOString()
}

export interface FormatOptions extends Intl.DateTimeFormatOptions {
  locale?: string
}

export function formatForDisplay(value: DateLike, options?: FormatOptions): string {
  const { locale = "ko-KR", timeZone = "Asia/Seoul", ...rest } = options ?? {}
  
  // 시간 표시 시 서버/클라이언트 hydration 불일치 방지를 위해 24시간 형식 사용
  const hasHour = rest.hour !== undefined || rest.timeStyle !== undefined
  const normalizedOptions: Intl.DateTimeFormatOptions = {
    timeZone,
    ...rest,
    ...(hasHour && !rest.hourCycle && rest.hour12 === undefined ? { hourCycle: 'h23' } : {}),
  }
  
  return new Intl.DateTimeFormat(locale, normalizedOptions).format(toDate(value))
}

export function isSameUtcDay(a: DateLike, b: DateLike): boolean {
  const d1 = toDate(a)
  const d2 = toDate(b)
  return getUtcDayTimestamp(d1) === getUtcDayTimestamp(d2)
}

export function diffInMinutes(later: DateLike, earlier: DateLike): number {
  const diff = toDate(later).getTime() - toDate(earlier).getTime()
  return Math.round(diff / 60_000)
}

export function diffInDays(later: DateLike, earlier: DateLike): number {
  const diff = toDate(later).getTime() - toDate(earlier).getTime()
  return Math.floor(diff / MS_IN_DAY)
}

export function addMinutes(value: DateLike, minutes: number): Date {
  return new Date(toDate(value).getTime() + minutes * 60_000)
}

export function addDays(value: DateLike, days: number): Date {
  return new Date(toDate(value).getTime() + days * MS_IN_DAY)
}

export function startOfWeek(value: DateLike, weekStartsOn = 1): Date {
  return startOfWeekUTC(value, weekStartsOn)
}

export function endOfWeek(value: DateLike, weekStartsOn = 1): Date {
  const start = startOfWeekUTC(value, weekStartsOn)
  start.setUTCDate(start.getUTCDate() + 6)
  return start
}

export function formatISODate(value: DateLike): string {
  const date = normalizeUtcDate(toDate(value))
  const month = `${date.getUTCMonth() + 1}`.padStart(2, '0')
  const day = `${date.getUTCDate()}`.padStart(2, '0')
  return `${date.getUTCFullYear()}-${month}-${day}`
}

export function clearClientClock() {
  clientOffsetMs = null
}

export function clearServerClock() {
  serverClock = null
}

export const DateUtil = {
  initServerClock,
  initClientClock,
  getClientOffsetMs,
  nowUTC,
  toUTCDate,
  toISOString,
  formatForDisplay,
  isSameUtcDay,
  diffInMinutes,
  diffInDays,
  addMinutes,
  addDays,
  startOfWeek,
  endOfWeek,
  formatISODate,
  clearClientClock,
  clearServerClock,
}

export default DateUtil
