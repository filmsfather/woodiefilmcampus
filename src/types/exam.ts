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
  /** 개별 출제 대상 학생 이름 목록 */
  studentNames: string[]
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

/**
 * 참고자료로 저장된 다른 학생의 답안.
 * 학생 화면에 그대로 노출되므로 작성자 식별자(source_student_id)는 담지 않는다.
 */
export interface ExamReviewReferenceAnswerView {
  id: string
  studentName: string
  prompt: string
  content: string
  label: string | null
  note: string | null
  createdAt: string
}

export interface ExamReviewItemView {
  id: string
  examQuestionId: string | null
  /** 참고자료 풀을 묶는 오답노트 문항 템플릿 id */
  reviewQuestionId: string | null
  orderIndex: number
  prompt: string
  requiresImage: boolean
  answerContent: string | null
  result: ExamAttemptResult
  feedback: string | null
  assets: ExamReviewItemAssetView[]
  /** 원본 시험 문항 정보 (원장이 직접 추가한 문항 등은 null) */
  examQuestion: ExamReviewItemQuestionContext | null
  /** 이 문항에 붙여준 참고자료 */
  references: ExamReviewReferenceAnswerView[]
  /** 이 문항의 답안이 이미 참고자료로 저장되어 있는지 (원장 화면 전용) */
  savedAsReference: boolean
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

/**
 * 원장 채점 화면의 참고자료 선택 목록. 학생 화면과 달리 출처 학생 id를 포함해
 * 본인 답안을 걸러내고 실명 공개 여부를 보여준다.
 */
export interface ExamReviewReferenceAnswerPoolItem {
  id: string
  reviewQuestionId: string
  sourceItemId: string | null
  sourceStudentId: string | null
  studentName: string
  showStudentName: boolean
  prompt: string
  content: string
  label: string | null
  note: string | null
  createdAt: string
}

export interface ReviewTaskDetailForPrincipal {
  task: ExamReviewTaskView
  examTitle: string
  sessionId: string
  studentId: string
  studentName: string
}

export interface StudentReviewTaskDetail {
  task: ExamReviewTaskView
  examTitle: string
}
