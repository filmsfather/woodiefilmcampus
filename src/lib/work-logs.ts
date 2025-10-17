export type WorkLogStatus = 'work' | 'substitute' | 'absence' | 'tardy'
export type WorkLogReviewStatus = 'pending' | 'approved' | 'rejected'
export type WorkLogSubstituteType = 'internal' | 'external'
export type ExternalTeacherPayStatus = 'pending' | 'completed'

export interface WorkLogEntry {
  id: string
  teacherId: string
  workDate: string
  status: WorkLogStatus
  workHours: number | null
  substituteType: WorkLogSubstituteType | null
  substituteTeacherId: string | null
  externalTeacherName: string | null
  externalTeacherPhone: string | null
  externalTeacherBank: string | null
  externalTeacherAccount: string | null
  externalTeacherHours: number | null
  notes: string | null
  reviewStatus: WorkLogReviewStatus
  reviewNote: string | null
  reviewedBy: string | null
  reviewedAt: string | null
  createdAt: string
  updatedAt: string
  externalTeacherPayStatus: ExternalTeacherPayStatus
}

export interface WorkLogEntryWithTeacher extends WorkLogEntry {
  teacher?: TeacherProfileSummary | null
}

export interface WorkLogEntryRow {
  id: string
  teacher_id: string
  work_date: string
  status: WorkLogStatus
  work_hours: number | null
  substitute_type: WorkLogSubstituteType | null
  substitute_teacher_id: string | null
  external_teacher_name: string | null
  external_teacher_phone: string | null
  external_teacher_bank: string | null
  external_teacher_account: string | null
  external_teacher_hours: number | null
  notes: string | null
  review_status: WorkLogReviewStatus
  review_note: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
  external_teacher_pay_status: ExternalTeacherPayStatus
}

export const WORK_LOG_ENTRY_SELECT_FIELDS = `
  id,
  teacher_id,
  work_date,
  status,
  work_hours,
  substitute_type,
  substitute_teacher_id,
  external_teacher_name,
  external_teacher_phone,
  external_teacher_bank,
  external_teacher_account,
  external_teacher_hours,
  notes,
  review_status,
  review_note,
  reviewed_by,
  reviewed_at,
  created_at,
  updated_at,
  external_teacher_pay_status
`

export const WORK_LOG_STATUS_OPTIONS: Array<{
  value: WorkLogStatus
  label: string
  description: string
}> = [
  {
    value: 'work',
    label: '근무',
    description: '정상 근무 시간을 기록합니다.',
  },
  {
    value: 'substitute',
    label: '대타',
    description: '대타 선생님 정보를 입력하고 기록합니다.',
  },
  {
    value: 'absence',
    label: '결근',
    description: '결근 사유를 기록합니다.',
  },
  {
    value: 'tardy',
    label: '지각',
    description: '지각으로 근무 시간을 조정합니다.',
  },
]

export const WORK_LOG_REVIEW_STATUS_LABEL: Record<WorkLogReviewStatus, string> = {
  pending: '승인 대기',
  approved: '승인 완료',
  rejected: '반려',
}

export const WORK_LOG_HOUR_STATUSES: WorkLogStatus[] = ['work', 'tardy']

export function requiresWorkHours(status: WorkLogStatus): boolean {
  return WORK_LOG_HOUR_STATUSES.includes(status)
}

export function mapWorkLogRow(row: WorkLogEntryRow): WorkLogEntry {
  return {
    id: row.id,
    teacherId: row.teacher_id,
    workDate: row.work_date,
    status: row.status,
    workHours: row.work_hours,
    substituteType: row.substitute_type,
    substituteTeacherId: row.substitute_teacher_id,
    externalTeacherName: row.external_teacher_name,
    externalTeacherPhone: row.external_teacher_phone,
    externalTeacherBank: row.external_teacher_bank,
    externalTeacherAccount: row.external_teacher_account,
    externalTeacherHours: row.external_teacher_hours,
    notes: row.notes,
    reviewStatus: row.review_status,
    reviewNote: row.review_note,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    externalTeacherPayStatus: row.external_teacher_pay_status,
  }
}

export interface MonthRange {
  start: string
  endExclusive: string
  startDate: string
  endExclusiveDate: string
  label: string
}

function formatDateToken(date: Date): string {
  const month = `${date.getUTCMonth() + 1}`.padStart(2, '0')
  const day = `${date.getUTCDate()}`.padStart(2, '0')
  return `${date.getUTCFullYear()}-${month}-${day}`
}

export function resolveMonthRange(monthToken: string | null | undefined, timeZone = 'Asia/Seoul'): MonthRange {
  const base = new Date()
  const [yearToken, monthTokenPart] = typeof monthToken === 'string' ? monthToken.split('-') : []
  const year = yearToken ? Number.parseInt(yearToken, 10) : base.getFullYear()
  const monthIndex = monthTokenPart ? Number.parseInt(monthTokenPart, 10) - 1 : base.getMonth()
  const initial = new Date(Date.UTC(year, monthIndex, 1))

  const startDate = new Date(initial.getTime())
  const nextMonth = new Date(Date.UTC(initial.getUTCFullYear(), initial.getUTCMonth() + 1, 1))

  const monthLabel = new Intl.DateTimeFormat('ko-KR', {
    timeZone,
    year: 'numeric',
    month: 'long',
  }).format(new Date(Date.UTC(initial.getUTCFullYear(), initial.getUTCMonth(), 1)))

  return {
    start: startDate.toISOString(),
    endExclusive: nextMonth.toISOString(),
    startDate: formatDateToken(startDate),
    endExclusiveDate: formatDateToken(nextMonth),
    label: monthLabel,
  }
}

export interface TeacherProfileSummary {
  id: string
  name: string | null
  email: string | null
}

export function summarizeTeacherProfile(profile: { id: string; name?: string | null; email?: string | null }): TeacherProfileSummary {
  return {
    id: profile.id,
    name: profile.name ?? null,
    email: profile.email ?? null,
  }
}

export function attachTeacherToEntry(
  entry: WorkLogEntry,
  teacher: { id: string | null; name: string | null; email: string | null } | null | undefined
): WorkLogEntryWithTeacher {
  if (!teacher || !teacher.id) {
    return { ...entry, teacher: null }
  }
  const teacherId = teacher.id
  return {
    ...entry,
    teacher: summarizeTeacherProfile({
      id: teacherId,
      name: teacher.name ?? null,
      email: teacher.email ?? null,
    }),
  }
}
