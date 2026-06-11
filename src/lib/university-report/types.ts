/**
 * 학교생활기록부(성적증명서) 파싱 결과 및 정규화 도메인 타입.
 * snapshot/courses/assets 3개 테이블과 1:1로 매핑됩니다.
 * 대학별 정책(반영 교과·산식)은 알지 않는 순수 데이터 표현입니다.
 */

export type SubjectArea =
  | '국어'
  | '수학'
  | '영어'
  | '한국사'
  | '사회'
  | '과학'
  | '체육'
  | '예술'
  | '기술가정'
  | '제2외국어'
  | '한문'
  | '교양'
  | '전문교과'
  | '기타'

export const SUBJECT_AREAS: readonly SubjectArea[] = [
  '국어',
  '수학',
  '영어',
  '한국사',
  '사회',
  '과학',
  '체육',
  '예술',
  '기술가정',
  '제2외국어',
  '한문',
  '교양',
  '전문교과',
  '기타',
] as const

export type CourseType =
  | '공통'
  | '일반선택'
  | '진로선택'
  | '융합선택'
  | '전문교과I'
  | '전문교과II'
  | '체육·예술'
  | '교양'
  | '기타'

export const COURSE_TYPES: readonly CourseType[] = [
  '공통',
  '일반선택',
  '진로선택',
  '융합선택',
  '전문교과I',
  '전문교과II',
  '체육·예술',
  '교양',
  '기타',
] as const

export type Achievement = 'A' | 'B' | 'C' | 'P' | 'F' | '우수' | '보통' | '미흡'

export const ACHIEVEMENTS: readonly Achievement[] = [
  'A',
  'B',
  'C',
  'P',
  'F',
  '우수',
  '보통',
  '미흡',
] as const

export type ParserConfidence = 'high' | 'low'

export type SnapshotStatus = 'pending' | 'parsing' | 'parsed' | 'failed' | 'archived'

/**
 * Gemini가 반환할 과목 1행. snapshot_id/position 등 DB가 채워주는 필드는 빠져 있습니다.
 */
export interface ParsedCourse {
  grade: 1 | 2 | 3
  semester: 1 | 2
  rawSubjectName: string
  subjectArea: SubjectArea
  courseType: CourseType
  isPassFail: boolean
  credits: number | null
  rank: number | null
  achievement: Achievement | null
  rawScore: number | null
  subjectMean: number | null
  stdDev: number | null
  studentCount: number | null
  parserConfidence: ParserConfidence
}

/**
 * 학생증명서 상단 메타 영역에서 추출되는 발급 식별 정보.
 */
export interface ParsedSnapshotMeta {
  studentNameOnDoc: string | null
  schoolName: string | null
  docSerial: string | null
  docVerifyCode: string | null
}

export interface ParsedTranscript {
  meta: ParsedSnapshotMeta
  courses: ParsedCourse[]
  warnings: string[]
}

/**
 * 성적증명서 업로드 전 학생 사전 조사 결과.
 * 검정고시 응시자는 성적증명서 업로드가 필요 없으며,
 * 농어촌/차상위 해당 여부는 원장 페이지에서 확인한다.
 */
export interface ReportEligibility {
  studentId: string
  isGed: boolean
  ruralEligible: boolean
  lowIncomeEligible: boolean
  surveyedAt: string
  updatedAt: string
}

/**
 * UI/server action 간에 주고받는 스냅샷 요약 페이로드.
 */
export interface SnapshotSummary {
  id: string
  studentId: string
  uploadedBy: string
  status: SnapshotStatus
  studentNameOnDoc: string | null
  schoolName: string | null
  docSerial: string | null
  docVerifyCode: string | null
  parsedAt: string | null
  parseError: string | null
  parserModel: string | null
  parserWarnings: string[] | null
  createdAt: string
  updatedAt: string
  courseCount: number
}
