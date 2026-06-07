export const SPECIAL_LECTURE_VIDEOS_BUCKET = 'special-lecture-videos'

export const SPECIAL_LECTURE_MAX_VIDEO_SIZE = 1024 * 1024 * 1024 // 1GB

export const SPECIAL_LECTURE_SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 // 24시간

export const SPECIAL_LECTURE_DEFAULT_GRANT_HOURS = 24

export const SPECIAL_LECTURE_MAX_GRANT_HOURS = 24 * 30 // 최대 30일

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
