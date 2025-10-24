import type { UserProfile } from '@/lib/supabase'

export type AbsenceReasonType = 'unexcused' | 'event' | 'sick' | 'other'

export const ABSENCE_REASON_OPTIONS: Array<{ value: AbsenceReasonType; label: string }> = [
  { value: 'unexcused', label: '무단' },
  { value: 'event', label: '경조사' },
  { value: 'sick', label: '병결' },
  { value: 'other', label: '기타' },
]

export const ABSENCE_REASON_LABEL_MAP: Record<AbsenceReasonType, string> = ABSENCE_REASON_OPTIONS.reduce(
  (acc, option) => {
    acc[option.value] = option.label
    return acc
  },
  {} as Record<AbsenceReasonType, string>
)

export interface AbsenceReportRow {
  id: string
  class_id: string
  student_id: string
  absence_date: string
  reason_type: AbsenceReasonType
  detail_reason: string | null
  teacher_action: string | null
  manager_action: string | null
  created_by: string
  created_at: string
  updated_at: string
  classes?: { id: string; name: string | null } | null
  students?: { id: string; name: string | null; email: string | null } | null
  created_by_profile?: { id: string; name: string | null; email: string | null; role: UserProfile['role'] } | null
}

export interface AbsenceReport {
  id: string
  classId: string
  className: string | null
  studentId: string
  studentName: string | null
  studentEmail: string | null
  absenceDate: string
  reasonType: AbsenceReasonType
  reasonLabel: string
  detailReason: string | null
  teacherAction: string | null
  managerAction: string | null
  createdBy: string
  createdByName: string | null
  createdByEmail: string | null
  createdByRole: UserProfile['role'] | null
  createdAt: string
  updatedAt: string
}

export function mapAbsenceReportRow(row: AbsenceReportRow): AbsenceReport {
  const classRecord = row.classes ?? null
  const studentRecord = row.students ?? null
  const creator = row.created_by_profile ?? null

  return {
    id: row.id,
    classId: row.class_id,
    className: classRecord?.name ?? null,
    studentId: row.student_id,
    studentName: studentRecord?.name ?? null,
    studentEmail: studentRecord?.email ?? null,
    absenceDate: row.absence_date,
    reasonType: row.reason_type,
    reasonLabel: ABSENCE_REASON_LABEL_MAP[row.reason_type] ?? row.reason_type,
    detailReason: row.detail_reason,
    teacherAction: row.teacher_action,
    managerAction: row.manager_action,
    createdBy: row.created_by,
    createdByName: creator?.name ?? null,
    createdByEmail: creator?.email ?? null,
    createdByRole: creator?.role ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function sortAbsenceReports(reports: AbsenceReport[]): AbsenceReport[] {
  return [...reports].sort((a, b) => {
    const dateDiff = new Date(a.absenceDate).getTime() - new Date(b.absenceDate).getTime()

    if (dateDiff !== 0) {
      return dateDiff
    }

    const classA = a.className ?? ''
    const classB = b.className ?? ''

    const classCompare = classA.localeCompare(classB, 'ko')

    if (classCompare !== 0) {
      return classCompare
    }

    const studentA = a.studentName ?? a.studentEmail ?? ''
    const studentB = b.studentName ?? b.studentEmail ?? ''

    return studentA.localeCompare(studentB, 'ko')
  })
}

export function isAdminRole(profile: UserProfile | null | undefined): boolean {
  if (!profile) {
    return false
  }
  return profile.role === 'manager' || profile.role === 'principal'
}

export function isTeacherRole(profile: UserProfile | null | undefined): boolean {
  if (!profile) {
    return false
  }
  return profile.role === 'teacher'
}
