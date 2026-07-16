export interface InterviewQuestionAsset {
  id: string
  mediaAssetId: string
  orderIndex: number
  url: string | null
}

export interface InterviewQuestion {
  id: string
  orderIndex: number
  prompt: string
  assets: InterviewQuestionAsset[]
}

export interface InterviewReviewQuestion {
  /** workbook_items.id */
  id: string
  position: number
  prompt: string
}

export interface InterviewSetSummary {
  id: string
  title: string
  description: string | null
  createdAt: string
  createdByName: string | null
  questionCount: number
  reviewQuestionCount: number
  sessionCount: number
}

export interface InterviewSessionSummary {
  id: string
  setId: string
  setTitle: string
  status: 'open' | 'closed'
  createdAt: string
  createdByName: string | null
  targetLabels: string[]
  totalStudents: number
  recordedCount: number
}

export interface InterviewSetDetail {
  id: string
  title: string
  description: string | null
  createdAt: string
  workbookId: string | null
  questions: InterviewQuestion[]
  reviewQuestions: InterviewReviewQuestion[]
  sessions: InterviewSessionSummary[]
}

export type InterviewAttemptStatus = 'assigned' | 'task_created'

export interface InterviewReviewItem {
  /** workbook_items.id */
  itemId: string
  position: number
  prompt: string
  /** 학생이 제출한 최신 답변 (없으면 null) */
  answer: string | null
  answeredAt: string | null
}

export interface InterviewAttemptRow {
  attemptId: string
  studentId: string
  studentName: string
  className: string | null
  status: InterviewAttemptStatus
  recordedAt: string | null
  studentTaskId: string | null
  assignmentId: string | null
  taskStatus: string | null
  videoUrl: string | null
  reviewItems: InterviewReviewItem[]
  /** 스냅샷 방식으로 생성돼 개별 문항 추가가 가능한지 */
  canAddQuestion: boolean
}

export interface InterviewSessionDetail {
  session: InterviewSessionSummary
  set: {
    id: string
    title: string
    description: string | null
    questions: InterviewQuestion[]
  }
  rows: InterviewAttemptRow[]
}

export interface StudentInterviewListItem {
  sessionId: string
  setTitle: string
  setDescription: string | null
  createdAt: string
  sessionStatus: 'open' | 'closed'
  attemptStatus: InterviewAttemptStatus
  recordedAt: string | null
  studentTaskId: string | null
}

export interface StudentInterviewDetail {
  sessionId: string
  setTitle: string
  setDescription: string | null
  sessionStatus: 'open' | 'closed'
  questions: InterviewQuestion[]
  attemptStatus: InterviewAttemptStatus
  recordedAt: string | null
  studentTaskId: string | null
  videoUrl: string | null
}

export interface InterviewTaskVideoInfo {
  attemptId: string
  setTitle: string
  recordedAt: string | null
  videoUrl: string | null
}

export interface InterviewAssignmentVideo {
  attemptId: string
  studentTaskId: string
  studentName: string
  setTitle: string
  recordedAt: string | null
  videoUrl: string | null
}
