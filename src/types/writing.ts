export interface WritingQuestionAsset {
  id: string
  mediaAssetId: string
  orderIndex: number
  url: string | null
}

export interface WritingQuestion {
  id: string
  orderIndex: number
  prompt: string
  assets: WritingQuestionAsset[]
}

export interface WritingReviewQuestion {
  /** workbook_items.id */
  id: string
  position: number
  prompt: string
}

export interface WritingSetSummary {
  id: string
  title: string
  description: string | null
  timeLimitMinutes: number
  createdAt: string
  createdByName: string | null
  questionCount: number
  reviewQuestionCount: number
  sessionCount: number
}

export interface WritingSessionSummary {
  id: string
  setId: string
  setTitle: string
  timeLimitMinutes: number
  status: 'open' | 'closed'
  createdAt: string
  createdByName: string | null
  targetLabels: string[]
  totalStudents: number
  submittedCount: number
}

export interface WritingSetDetail {
  id: string
  title: string
  description: string | null
  timeLimitMinutes: number
  createdAt: string
  workbookId: string | null
  questions: WritingQuestion[]
  reviewQuestions: WritingReviewQuestion[]
  sessions: WritingSessionSummary[]
}

export type WritingAttemptStatus = 'assigned' | 'in_progress' | 'submitted' | 'task_created'

export type WritingOcrStatus = 'pending' | 'processing' | 'done' | 'failed'

export interface WritingReviewItem {
  /** workbook_items.id */
  itemId: string
  position: number
  prompt: string
  /** 학생이 제출한 최신 답변 (없으면 null) */
  answer: string | null
  answeredAt: string | null
}

export interface WritingSubmissionImage {
  id: string
  mediaAssetId: string
  orderIndex: number
  url: string | null
}

export interface WritingAttemptRow {
  attemptId: string
  studentId: string
  studentName: string
  className: string | null
  status: WritingAttemptStatus
  startedAt: string | null
  deadlineAt: string | null
  submittedAt: string | null
  ocrText: string | null
  ocrStatus: WritingOcrStatus
  submissionImages: WritingSubmissionImage[]
  studentTaskId: string | null
  assignmentId: string | null
  taskStatus: string | null
  reviewItems: WritingReviewItem[]
}

export interface WritingSessionDetail {
  session: WritingSessionSummary
  set: {
    id: string
    title: string
    description: string | null
    timeLimitMinutes: number
    workbookId: string | null
    questions: WritingQuestion[]
    reviewQuestions: WritingReviewQuestion[]
  }
  rows: WritingAttemptRow[]
}

export interface StudentWritingListItem {
  sessionId: string
  setTitle: string
  setDescription: string | null
  timeLimitMinutes: number
  createdAt: string
  sessionStatus: 'open' | 'closed'
  attemptStatus: WritingAttemptStatus
  deadlineAt: string | null
  submittedAt: string | null
  studentTaskId: string | null
}

export interface StudentWritingExamData {
  sessionId: string
  attemptId: string
  setTitle: string
  setDescription: string | null
  timeLimitMinutes: number
  sessionStatus: 'open' | 'closed'
  attemptStatus: WritingAttemptStatus
  startedAt: string | null
  deadlineAt: string | null
  submittedAt: string | null
  ocrText: string | null
  ocrStatus: WritingOcrStatus
  /** 시작 전에는 빈 배열 */
  questions: WritingQuestion[]
  submissionImages: WritingSubmissionImage[]
  studentTaskId: string | null
}
