/**
 * 모집단위 프리셋(`presets/programs.ts`)의 `details.schedule` 텍스트를
 * 달력에 표기하기 위한 구조화된 이벤트로 변환한다.
 *
 * 일정 텍스트는 예) "2026. 9. 8.(화) 10:00 ~ 9. 11.(금) 18:00" 형태이며
 * 단일 날짜 또는 두 날짜 범위(`~`)로 구성된다.
 */

import { PROGRAM_PRESETS } from '@/lib/university-policy/presets/programs'
import { UNIVERSITY_PRESETS } from '@/lib/university-policy/presets/universities'

export type ScheduleCategory =
  | 'application' // 원서접수·서류제출
  | 'exam' // 실기·면접·시험
  | 'announcement' // 합격자 발표·결과
  | 'enrollment' // 등록·납부·충원
  | 'other' // 기타

export interface ScheduleEvent {
  id: string
  programKey: string
  universityId: string
  universityName: string
  universityShortName: string
  region: string | null
  programName: string
  year: number
  admissionTrack: string
  label: string
  rawValue: string
  category: ScheduleCategory
  startISO: string // YYYY-MM-DD (Asia/Seoul)
  endISO: string // YYYY-MM-DD (Asia/Seoul)
}

export const SCHEDULE_CATEGORY_META: Record<
  ScheduleCategory,
  { label: string; color: string; chip: string; dot: string }
> = {
  application: {
    label: '원서·서류',
    color: 'bg-sky-50 text-sky-700 border-sky-200',
    chip: 'bg-sky-100 text-sky-800 border-sky-200',
    dot: 'bg-sky-500',
  },
  exam: {
    label: '실기·면접',
    color: 'bg-rose-50 text-rose-700 border-rose-200',
    chip: 'bg-rose-100 text-rose-800 border-rose-200',
    dot: 'bg-rose-500',
  },
  announcement: {
    label: '발표',
    color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    chip: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    dot: 'bg-emerald-500',
  },
  enrollment: {
    label: '등록·납부',
    color: 'bg-violet-50 text-violet-700 border-violet-200',
    chip: 'bg-violet-100 text-violet-800 border-violet-200',
    dot: 'bg-violet-500',
  },
  other: {
    label: '기타',
    color: 'bg-slate-50 text-slate-600 border-slate-200',
    chip: 'bg-slate-100 text-slate-700 border-slate-200',
    dot: 'bg-slate-400',
  },
}

const SEOUL_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

function toISO(date: Date): string {
  return SEOUL_FORMATTER.format(date)
}

function categorize(label: string): ScheduleCategory {
  if (/접수|서류|제출|업로드|예약|지원|모집요강/.test(label)) return 'application'
  if (/실기|면접|고사|시험|구술|논술|평가/.test(label)) return 'exam'
  if (/발표|합격|결과|확인|공지|안내|예비심사/.test(label)) return 'announcement'
  if (/등록|납부|충원|이월|예치/.test(label)) return 'enrollment'
  return 'other'
}

interface ParsedDate {
  idx: number
  date: Date
}

/**
 * "YYYY. M. D." (year optional) 패턴을 추출한다.
 * 끝에는 점/괄호/공백/물결표/문자 종료가 와야 하고,
 * 직후 숫자(`100점`, `1.99` 같은 노이즈)는 매치되지 않도록 lookahead를 강제한다.
 */
const DATE_REGEX =
  /(?:(\d{4})\s*\.\s*)?(\d{1,2})\s*\.\s*(\d{1,2})\s*\.?(?=\s*\(|\s*~|\s|$|[가-힣])/g

function findDates(value: string, defaultYear: number): ParsedDate[] {
  const out: ParsedDate[] = []
  let lastYear = defaultYear

  DATE_REGEX.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = DATE_REGEX.exec(value)) !== null) {
    const year = m[1] ? Number.parseInt(m[1], 10) : lastYear
    const month = Number.parseInt(m[2], 10)
    const day = Number.parseInt(m[3], 10)

    if (m[1]) lastYear = year
    if (!Number.isFinite(year) || year < 2000 || year > 2100) continue
    if (month < 1 || month > 12) continue
    if (day < 1 || day > 31) continue

    const date = new Date(year, month - 1, day)
    if (Number.isNaN(date.getTime())) continue
    if (date.getMonth() !== month - 1 || date.getDate() !== day) continue

    out.push({ idx: m.index, date })
  }
  return out
}

interface ParsedRange {
  start: Date
  end: Date
}

function parseScheduleValue(value: string, defaultYear: number): ParsedRange[] {
  const dates = findDates(value, defaultYear)
  if (dates.length === 0) return []

  const ranges: ParsedRange[] = []
  const isWithinExistingRange = (date: Date) =>
    ranges.some(
      (r) =>
        date.getTime() >= r.start.getTime() && date.getTime() <= r.end.getTime()
    )

  let i = 0
  while (i < dates.length) {
    const cur = dates[i]
    const next = dates[i + 1]
    if (next) {
      const between = value.substring(cur.idx, next.idx)
      if (between.includes('~') && next.date.getTime() >= cur.date.getTime()) {
        ranges.push({ start: cur.date, end: next.date })
        i += 2
        continue
      }
    }
    if (!isWithinExistingRange(cur.date)) {
      ranges.push({ start: cur.date, end: cur.date })
    }
    i += 1
  }
  return ranges
}

function dedupKey(parts: Array<string | number>): string {
  return parts.join('|')
}

/**
 * 모든 모집단위의 일정 항목을 평탄화하여 달력에서 사용할 이벤트 배열을 반환한다.
 * 동일 (대학, 라벨, 날짜 범위, 카테고리) 조합은 1개로 합쳐 중복을 제거한다.
 */
export function buildScheduleEvents(): ScheduleEvent[] {
  const universityById = new Map<string, (typeof UNIVERSITY_PRESETS)[number]>()
  for (const u of UNIVERSITY_PRESETS) universityById.set(u.id, u)

  const seen = new Set<string>()
  const events: ScheduleEvent[] = []

  for (const program of PROGRAM_PRESETS) {
    const items = program.details?.schedule
    if (!items || items.length === 0) continue

    const university = universityById.get(program.universityId)
    const fallbackYear = program.year - 1 // 2027학년도 → 2026년도 일정

    for (const item of items) {
      const ranges = parseScheduleValue(item.value, fallbackYear)
      if (ranges.length === 0) continue

      const category = categorize(item.label)
      for (const range of ranges) {
        const startISO = toISO(range.start)
        const endISO = toISO(range.end)
        const key = dedupKey([
          program.universityId,
          item.label,
          startISO,
          endISO,
          category,
        ])
        if (seen.has(key)) continue
        seen.add(key)

        events.push({
          id: `${program.key}::${item.label}::${startISO}::${endISO}`,
          programKey: program.key,
          universityId: program.universityId,
          universityName: university?.name ?? program.universityId,
          universityShortName: university?.shortName ?? university?.name ?? program.universityId,
          region: university?.region ?? null,
          programName: program.name,
          year: program.year,
          admissionTrack: program.admissionTrack,
          label: item.label,
          rawValue: item.value,
          category,
          startISO,
          endISO,
        })
      }
    }
  }

  events.sort((a, b) => {
    if (a.startISO !== b.startISO) return a.startISO < b.startISO ? -1 : 1
    if (a.endISO !== b.endISO) return a.endISO < b.endISO ? -1 : 1
    return a.universityName.localeCompare(b.universityName, 'ko')
  })

  return events
}

/**
 * ISO(YYYY-MM-DD) 시작/종료 사이에 포함된 모든 날짜 키를 반환한다.
 */
export function expandISORange(startISO: string, endISO: string): string[] {
  const start = parseISODate(startISO)
  const end = parseISODate(endISO)
  if (!start || !end) return []

  const dates: string[] = []
  const cursor = new Date(start)
  while (cursor.getTime() <= end.getTime()) {
    dates.push(toISO(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return dates
}

export function parseISODate(iso: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!match) return null
  const year = Number.parseInt(match[1], 10)
  const month = Number.parseInt(match[2], 10)
  const day = Number.parseInt(match[3], 10)
  const date = new Date(year, month - 1, day)
  return Number.isNaN(date.getTime()) ? null : date
}
