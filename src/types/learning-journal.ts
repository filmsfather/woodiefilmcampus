export type LearningJournalPeriodStatus = 'draft' | 'in_progress' | 'completed'

export const LEARNING_JOURNAL_PERIOD_STATUSES: LearningJournalPeriodStatus[] = [
  'draft',
  'in_progress',
  'completed',
]

export interface LearningJournalPeriod {
  id: string
  classId: string
  startDate: string
  endDate: string
  label: string | null
  status: LearningJournalPeriodStatus
  createdBy: string
  lockedAt: string | null
  createdAt: string
  updatedAt: string
}

export type LearningJournalEntryStatus = 'draft' | 'submitted' | 'published' | 'archived'

export const LEARNING_JOURNAL_ENTRY_STATUSES: LearningJournalEntryStatus[] = [
  'draft',
  'submitted',
  'published',
  'archived',
]

export interface LearningJournalEntrySummary {
  id: string
  periodId: string
  studentId: string
  status: LearningJournalEntryStatus
  completionRate: number | null
  lastGeneratedAt: string | null
  submittedAt: string | null
  publishedAt: string | null
  archivedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface LearningJournalEntryDetail extends LearningJournalEntrySummary {
  summary: unknown
  weekly: unknown
}

export type LearningJournalCommentScope = 'homeroom' | 'subject'

export const LEARNING_JOURNAL_COMMENT_SCOPES: LearningJournalCommentScope[] = [
  'homeroom',
  'subject',
]

export interface LearningJournalComment {
  id: string
  entryId: string
  roleScope: LearningJournalCommentScope
  subject: LearningJournalSubject | null
  teacherId: string | null
  body: string | null
  createdAt: string
  updatedAt: string
}

export const LEARNING_JOURNAL_SUBJECTS = ['directing', 'screenwriting', 'film_research'] as const

export type LearningJournalSubject = (typeof LEARNING_JOURNAL_SUBJECTS)[number]

export interface LearningJournalGreeting {
  monthToken: string
  message: string
  principalId: string
  publishedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface LearningJournalAcademicEvent {
  id: string
  monthToken: string
  title: string
  startDate: string
  endDate: string | null
  memo: string | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

export interface LearningJournalEntryLog {
  id: string
  entryId: string
  previousStatus: LearningJournalEntryStatus | null
  nextStatus: LearningJournalEntryStatus
  changedBy: string | null
  note: string | null
  createdAt: string
}

export interface LearningJournalPeriodWithClass extends LearningJournalPeriod {
  className: string
  studentCount: number
}

export interface LearningJournalStudentSnapshot {
  entryId: string | null
  studentId: string
  name: string | null
  email: string | null
  completionRate: number | null
  status: LearningJournalEntryStatus
  submittedAt: string | null
  publishedAt: string | null
}
