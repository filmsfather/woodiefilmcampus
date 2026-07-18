export type ExamAttemptResult = 'pending' | 'pass' | 'nonpass'

export type ExamSessionStatus = 'open' | 'closed'

export type ExamReviewTaskStatus = 'assigned' | 'submitted' | 'partial' | 'pass'

export interface ExamQuestionAsset {
  id: string
  mediaAssetId: string
  orderIndex: number
  url: string | null
}

export interface ExamReviewQuestionTemplate {
  id: string
  orderIndex: number
  prompt: string
  requiresImage: boolean
}

export interface ExamQuestion {
  id: string
  orderIndex: number
  prompt: string
  assets: ExamQuestionAsset[]
  reviewQuestions: ExamReviewQuestionTemplate[]
}

export interface ExamSummary {
  id: string
  title: string
  description: string | null
  createdAt: string
  questionCount: number
  sessionCount: number
  openSessionCount: number
}

export interface ExamSessionSummary {
  id: string
  examId: string
  examTitle: string
  durationMinutes: number
  opensAt: string
  closesAt: string
  status: ExamSessionStatus
  classNames: string[]
  totalStudents: number
  submittedCount: number
  pendingEvaluationCount: number
  createdAt: string
}

export interface ExamDetail {
  id: string
  title: string
  description: string | null
  createdAt: string
  questions: ExamQuestion[]
  sessions: ExamSessionSummary[]
}

export interface ExamAnswerView {
  questionId: string
  content: string | null
}

export interface ExamReviewItemAssetView {
  id: string
  mediaAssetId: string
  orderIndex: number
  caption: string | null
  url: string | null
}

export interface ExamReviewItemQuestionContext {
  orderIndex: number
  prompt: string
  assets: ExamQuestionAsset[]
  /** 학생이 시험 응시 당시 제출한 답안 */
  originalAnswer: string | null
}

export interface ExamReviewItemView {
  id: string
  examQuestionId: string | null
  orderIndex: number
  prompt: string
  requiresImage: boolean
  answerContent: string | null
  result: ExamAttemptResult
  feedback: string | null
  assets: ExamReviewItemAssetView[]
  /** 원본 시험 문항 정보 (원장이 직접 추가한 문항 등은 null) */
  examQuestion: ExamReviewItemQuestionContext | null
}

export interface ExamReviewTaskView {
  id: string
  attemptId: string
  status: ExamReviewTaskStatus
  assignedAt: string
  submittedAt: string | null
  evaluatedAt: string | null
  items: ExamReviewItemView[]
}

export interface SessionAttemptRow {
  attemptId: string | null
  studentId: string
  studentName: string
  className: string | null
  startedAt: string | null
  submittedAt: string | null
  result: ExamAttemptResult
  answers: ExamAnswerView[]
  reviewTask: {
    id: string
    status: ExamReviewTaskStatus
    submittedAt: string | null
  } | null
}

export interface ExamSessionDetail {
  session: ExamSessionSummary
  exam: {
    id: string
    title: string
    description: string | null
    questions: ExamQuestion[]
  }
  rows: SessionAttemptRow[]
}

export interface StudentExamListItem {
  sessionId: string
  examTitle: string
  examDescription: string | null
  durationMinutes: number
  opensAt: string
  closesAt: string
  sessionStatus: ExamSessionStatus
  attempt: {
    id: string
    startedAt: string | null
    submittedAt: string | null
    result: ExamAttemptResult
  } | null
}

export interface StudentReviewTaskListItem {
  reviewTaskId: string
  examTitle: string
  status: ExamReviewTaskStatus
  assignedAt: string
  submittedAt: string | null
  itemCount: number
  nonpassCount: number
}

export interface StudentExamRunnerData {
  sessionId: string
  examTitle: string
  examDescription: string | null
  durationMinutes: number
  opensAt: string
  closesAt: string
  sessionStatus: ExamSessionStatus
  questions: ExamQuestion[]
  attempt: {
    id: string
    startedAt: string | null
    submittedAt: string | null
    result: ExamAttemptResult
    answers: ExamAnswerView[]
  } | null
  serverNow: string
}

export interface PrincipalReviewTaskListItem {
  reviewTaskId: string
  examId: string
  examTitle: string
  sessionId: string
  studentId: string
  studentName: string
  status: ExamReviewTaskStatus
  assignedAt: string
  submittedAt: string | null
  itemCount: number
}

export interface ReviewTaskDetailForPrincipal {
  task: ExamReviewTaskView
  examTitle: string
  sessionId: string
  studentName: string
}

export interface StudentReviewTaskDetail {
  task: ExamReviewTaskView
  examTitle: string
}
