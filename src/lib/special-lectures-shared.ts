export const SPECIAL_LECTURE_VIDEOS_BUCKET = 'special-lecture-videos'

export const SPECIAL_LECTURE_MAX_VIDEO_SIZE = 1024 * 1024 * 1024 // 1GB

export const SPECIAL_LECTURE_SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 // 24시간

export const SPECIAL_LECTURE_DEFAULT_GRANT_HOURS = 24

export const SPECIAL_LECTURE_MAX_GRANT_HOURS = 24 * 30 // 최대 30일

/** 공개 기간을 빠르게 지정할 때 쓰는 프리셋. 공개/승인/구간 변경 다이얼로그가 공유합니다. */
export const SPECIAL_LECTURE_GRANT_PRESETS: ReadonlyArray<{ label: string; hours: number }> = [
  { label: '2시간', hours: 2 },
  { label: '3시간', hours: 3 },
  { label: '6시간', hours: 6 },
  { label: '12시간', hours: 12 },
  { label: '하루', hours: 24 },
  { label: '2일', hours: 24 * 2 },
]

export const SPECIAL_LECTURE_MANAGE_ROLES = ['manager', 'principal'] as const

export type SpecialLectureManageRole = (typeof SPECIAL_LECTURE_MANAGE_ROLES)[number]

export function isSpecialLectureManageRole(
  role: string | null | undefined
): role is SpecialLectureManageRole {
  if (!role) {
    return false
  }
  return (SPECIAL_LECTURE_MANAGE_ROLES as readonly string[]).includes(role)
}

export const SPECIAL_LECTURE_AUDIENCE_MODES = ['all_students', 'class', 'student'] as const

export type SpecialLectureAudienceMode = (typeof SPECIAL_LECTURE_AUDIENCE_MODES)[number]

export function isSpecialLectureAudienceMode(
  value: string | null | undefined
): value is SpecialLectureAudienceMode {
  if (!value) {
    return false
  }
  return (SPECIAL_LECTURE_AUDIENCE_MODES as readonly string[]).includes(value)
}

export const SPECIAL_LECTURE_AUDIENCE_LABELS: Record<SpecialLectureAudienceMode, string> = {
  all_students: '전체 학생',
  class: '특정 반',
  student: '특정 학생',
}

export const SPECIAL_LECTURE_REQUEST_STATUSES = [
  'requested',
  'approved',
  'rejected',
  'cancelled',
] as const

export type SpecialLectureRequestStatus = (typeof SPECIAL_LECTURE_REQUEST_STATUSES)[number]

export function isSpecialLectureRequestStatus(
  value: string | null | undefined
): value is SpecialLectureRequestStatus {
  if (!value) {
    return false
  }
  return (SPECIAL_LECTURE_REQUEST_STATUSES as readonly string[]).includes(value)
}

export const SPECIAL_LECTURE_REQUEST_STATUS_LABELS: Record<SpecialLectureRequestStatus, string> = {
  requested: '승인 대기',
  approved: '승인됨',
  rejected: '반려됨',
  cancelled: '취소됨',
}

/** datetime-local 입력에 넣을 수 있는 로컬 시각 문자열(YYYY-MM-DDTHH:mm)로 변환합니다. */
export function toLocalDatetimeInputValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** datetime-local 입력값을 Date로 변환합니다. 형식이 잘못되면 null을 반환합니다. */
export function parseLocalDatetimeInputValue(value: string): Date | null {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}
