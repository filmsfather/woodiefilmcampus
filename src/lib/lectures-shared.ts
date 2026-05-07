export const LECTURE_ASSETS_BUCKET = 'lecture-assets'

export const LECTURE_MAX_UPLOAD_SIZE = 50 * 1024 * 1024 // 50MB

export const LECTURE_MANAGE_ROLES = ['teacher', 'manager', 'principal'] as const

export type LectureManageRole = (typeof LECTURE_MANAGE_ROLES)[number]

export function isLectureManageRole(
  role: string | null | undefined
): role is LectureManageRole {
  if (!role) {
    return false
  }
  return (LECTURE_MANAGE_ROLES as readonly string[]).includes(role)
}
