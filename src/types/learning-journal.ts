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

export const LEARNING_JOURNAL_SUBJECTS = [
  'directing',
  'screenwriting',
  'film_research',
  'integrated_theory',
  'karts',
] as const

export type LearningJournalSubject = (typeof LEARNING_JOURNAL_SUBJECTS)[number]

export const LEARNING_JOURNAL_SUBJECT_INFO: Record<LearningJournalSubject, {
  label: string
  description: string
}> = {
  directing: {
    label: '연출론',
    description: '장면 구성과 연출 기획을 중심으로 학습합니다.',
  },
  screenwriting: {
    label: '작법론',
    description: '시나리오 작성과 스토리 구조를 다룹니다.',
  },
  film_research: {
    label: '영화연구',
    description: '영화 분석과 이론 학습에 집중합니다.',
  },
  integrated_theory: {
    label: '통합이론',
    description: '융합적 시각으로 이론과 실습을 연결합니다.',
  },
  karts: {
    label: '한예종',
    description: '한국예술종합학교 대비를 위한 심화 학습입니다.',
  },
}

export interface LearningJournalGreeting {
  monthToken: string
  message: string
  principalId: string
  publishedAt: string | null
  createdAt: string
  updatedAt: string
}

export type LearningJournalAnnualScheduleCategory = 'annual' | 'film_production'

export interface LearningJournalAnnualSchedule {
  id: string
  periodLabel: string
  startDate: string
  endDate: string
  tuitionDueDate: string | null
  tuitionAmount: number | null
  memo: string | null
  category: LearningJournalAnnualScheduleCategory
  displayOrder: number
  createdBy: string | null
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

export interface LearningJournalWeeklyMaterialHydrated {
  templateId: string | null
  title: string
  note: string | null
  sourceType: 'class_material' | 'custom'
  sourceId: string | null
}

export interface LearningJournalWeeklySubjectData {
  materials: LearningJournalWeeklyMaterialHydrated[]
  assignments: LearningJournalWeekAssignmentItem[]
  summaryNote?: string | null
}

export interface LearningJournalWeeklyData {
  weekIndex: number
  startDate: string
  endDate: string
  subjects: Record<LearningJournalSubject, LearningJournalWeeklySubjectData>
}

export interface LearningJournalWeekTemplate {
  id: string
  classId: string
  periodId: string
  weekIndex: number
  subject: LearningJournalSubject
  materialIds: string[]
  materialTitles: string[]
  materialNotes: string | null
  updatedAt: string
}

export interface LearningJournalWeekMaterialItem {
  id: string | null
  title: string
  note: string | null
  sourceType: 'class_material' | 'custom'
  sourceId: string | null
}

export interface LearningJournalWeekAssignmentItem {
  id: string
  title: string
  status: 'completed' | 'in_progress' | 'not_started' | 'pending'
  dueDate: string | null
  submittedAt: string | null
  submittedLate: boolean
  score: number | null
  note: string | null
}

export interface SharedLearningJournalSnapshot {
  entry: LearningJournalEntryDetail
  student: {
    id: string
    name: string | null
    email: string | null
    parentPhone?: string | null
  }
  period: {
    id: string
    classId: string
    className: string | null
    startDate: string
    endDate: string
    label: string | null
    status: LearningJournalPeriodStatus
  }
  greeting: LearningJournalGreeting | null
  academicEvents: LearningJournalAcademicEvent[]
  comments: LearningJournalComment[]
  annualSchedules: LearningJournalAnnualSchedule[]
}

export interface LearningJournalWeekSubjectSnapshot {
  materials: LearningJournalWeekMaterialItem[]
  assignments: LearningJournalWeekAssignmentItem[]
  summaryNote?: string | null
}

export interface LearningJournalWeekSnapshot {
  weekIndex: number
  startDate: string
  endDate: string
  subjects: Record<LearningJournalSubject, LearningJournalWeekSubjectSnapshot>
}

export interface ClassLearningJournalTemplate {
  classId: string
  periodId: string
  weeks: Array<{
    weekIndex: number
    subjects: Record<LearningJournalSubject, {
      templateId: string | null
      materialIds: string[]
      materialTitles: string[]
      materialNotes: string | null
    }>
  }>
}
