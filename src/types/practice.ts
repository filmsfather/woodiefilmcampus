export type PracticeType = 'writing' | 'interview'

export type PracticeSlotStatus = 'open' | 'booked' | 'closed' | 'break'

export type PracticeBookingType = 'homeroom' | 'free'

export type PracticeBookingStatus = 'reserved' | 'canceled' | 'completed' | 'no_show'

export type PracticeAttemptStatus = 'scheduled' | 'open' | 'submitted' | 'feedback_done' | 'missed'

export type PracticeOcrStatus = 'pending' | 'processing' | 'done' | 'failed'

export const PRACTICE_TYPE_LABELS: Record<PracticeType, string> = {
  writing: '작법형',
  interview: '면접형',
}

export const PRACTICE_BOOKING_TYPE_LABELS: Record<PracticeBookingType, string> = {
  homeroom: '담임 배정',
  free: '자유 예약',
}

export const PRACTICE_ATTEMPT_STATUS_LABELS: Record<PracticeAttemptStatus, string> = {
  scheduled: '대기',
  open: '응시 중',
  submitted: '제출 완료',
  feedback_done: '피드백 완료',
  missed: '미제출',
}

export interface PracticeProblemAsset {
  id: string
  mediaAssetId: string
  orderIndex: number
  url: string | null
}

export interface PracticeProblemItem {
  id: string
  orderIndex: number
  prompt: string
}

export interface PracticeRubricItem {
  id: string
  orderIndex: number
  label: string
  maxScore: number
  description: string | null
}

export interface PracticeProblemSummary {
  id: string
  universityId: string
  universityName: string
  practiceType: PracticeType
  title: string
  description: string | null
  timeLimitMinutes: number
  orderIndex: number
  isActive: boolean
  createdAt: string
  createdByName: string | null
  itemCount: number
  rubricCount: number
  /** 예약에 배정된 횟수. 0이면 안전하게 삭제할 수 있다. */
  usageCount: number
}

export interface PracticeProblemDetail {
  id: string
  universityId: string
  universityName: string
  practiceType: PracticeType
  title: string
  description: string | null
  timeLimitMinutes: number
  orderIndex: number
  isActive: boolean
  items: PracticeProblemItem[]
  assets: PracticeProblemAsset[]
  rubricItems: PracticeRubricItem[]
  usageCount: number
}

export interface PracticeUniversityOption {
  id: string
  name: string
  writingProblemCount: number
  interviewProblemCount: number
}

export interface PracticeSlotBlockTeacherSummary {
  teacherId: string
  name: string
  /** 배정된 고사장 번호(1~7). 과거 데이터는 null일 수 있다. */
  roomNo: number | null
  /** 쉬는 시간 시작 시각(HH:MM) 목록 */
  breakTimes: string[]
}

export interface PracticeSlotBlockSummary {
  id: string
  blockDate: string
  startTime: string
  endTime: string
  slotMinutes: number
  /** 1차 예약 오픈 시각 */
  freeBookingOpensAt: string | null
  /** 2차 예약 오픈 시각. 이후 일일 한도가 3타임으로 늘어난다. */
  phase2OpensAt: string | null
  /** 학생 자유 예약 마감 시각. 이후에는 교직원 배정만 가능하다. */
  bookingClosesAt: string | null
  notes: string | null
  teachers: PracticeSlotBlockTeacherSummary[]
  slotCount: number
}

export interface PracticeSlotBooking {
  id: string
  studentId: string
  studentName: string
  className: string | null
  universityId: string
  universityName: string
  problemId: string
  problemTitle: string
  practiceType: PracticeType
  bookingType: PracticeBookingType
  status: PracticeBookingStatus
  attemptId: string | null
  attemptStatus: PracticeAttemptStatus | null
  opensAt: string | null
  deadlineAt: string | null
  submittedAt: string | null
  hasFeedback: boolean
}

export interface PracticeSlotView {
  id: string
  teacherId: string
  teacherName: string
  roomNo: number | null
  slotDate: string
  startTime: string
  durationMinutes: number
  startsAt: string
  status: PracticeSlotStatus
  freeBookingOpensAt: string | null
  phase2OpensAt: string | null
  bookingClosesAt: string | null
  booking: PracticeSlotBooking | null
}

export interface PracticeDayBoard {
  slotDate: string
  teachers: Array<{ id: string; name: string }>
  /** HH:MM 라벨 오름차순 */
  timeLabels: string[]
  /** `${teacherId}|${HH:MM}` -> 슬롯 */
  slots: PracticeSlotView[]
}

export interface PracticeStudentOption {
  id: string
  name: string
  className: string | null
  isHomeroomStudent: boolean
}

export interface PracticeAttemptSubmissionImage {
  id: string
  mediaAssetId: string
  orderIndex: number
  url: string | null
}

export interface PracticeFeedbackScore {
  rubricItemId: string
  score: number
  note: string | null
}

export interface PracticeFeedbackView {
  id: string
  teacherId: string | null
  teacherName: string | null
  feedbackText: string | null
  comment: string | null
  totalScore: number | null
  createdAt: string
  updatedAt: string
  scores: PracticeFeedbackScore[]
}

/** 교사 피드백 화면 / 학생 아카이브 공용 상세 */
export interface PracticeAttemptDetail {
  attemptId: string
  bookingId: string
  studentId: string
  studentName: string
  className: string | null
  teacherId: string
  teacherName: string
  roomNo: number | null
  practiceType: PracticeType
  universityName: string
  problem: {
    id: string
    title: string
    description: string | null
    timeLimitMinutes: number
    items: PracticeProblemItem[]
    assets: PracticeProblemAsset[]
    rubricItems: PracticeRubricItem[]
  }
  slotDate: string
  startTime: string
  startsAt: string
  opensAt: string
  deadlineAt: string
  startedAt: string | null
  submittedAt: string | null
  status: PracticeAttemptStatus
  bookingStatus: PracticeBookingStatus
  ocrText: string | null
  ocrStatus: PracticeOcrStatus
  typedAnswers: Record<string, string>
  submissionImages: PracticeAttemptSubmissionImage[]
  videoUrl: string | null
  recordedAt: string | null
  feedback: PracticeFeedbackView | null
}

/** 학생 예약 목록 / 아카이브 행 / 교사 일정 행 공용 */
export interface PracticeStudentBookingRow {
  bookingId: string
  attemptId: string | null
  studentId: string
  studentName: string
  className: string | null
  practiceType: PracticeType
  universityName: string
  problemTitle: string | null
  teacherName: string
  roomNo: number | null
  slotDate: string
  startTime: string
  startsAt: string
  opensAt: string | null
  deadlineAt: string | null
  submittedAt: string | null
  attemptStatus: PracticeAttemptStatus | null
  bookingStatus: PracticeBookingStatus
  bookingType: PracticeBookingType
  hasFeedback: boolean
}

/** 교사용 학생별 누적 이력 */
export interface PracticeStudentHistory {
  studentId: string
  studentName: string
  className: string | null
  totalCount: number
  submittedCount: number
  feedbackCount: number
  rows: PracticeStudentBookingRow[]
}

/** 학생 자유 예약 화면의 빈 슬롯 */
/** 다음으로 열리는 학생 자유 예약 창 (카운트다운용) */
export interface PracticeBookingOpening {
  /** 1차 = 2주 전 금요일, 2차 = 직전주 금요일 */
  phase: 1 | 2
  opensAt: string
  /** 오픈 대상이 되는 주의 슬롯 날짜 */
  slotDate: string
}

export interface PracticeFreeSlotOption {
  id: string
  teacherId: string
  teacherName: string
  roomNo: number | null
  slotDate: string
  startTime: string
  startsAt: string
  /** 2차 예약 오픈 시각. 이 시각 전후로 일일 예약 한도가 달라진다. */
  phase2OpensAt: string | null
  /** 학생 자유 예약 마감 시각 */
  bookingClosesAt: string | null
}
