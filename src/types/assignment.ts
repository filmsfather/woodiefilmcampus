export interface AssignmentWorkbookSummary {
  id: string
  title: string
  subject: string
  type: string
  weekLabel: string | null
  tags: string[]
  updatedAt: string
  itemCount: number
  authorId: string | null
  authorName: string | null
  /** 담당 교사(문제집 목록의 작성자 열과 동일한 `teacher_id`) */
  teacherId: string | null
  teacherName: string | null
}

/** 학생-반 소속 단위 레코드. 한 학생이 여러 반에 속하면 반별로 항목이 생긴다. */
export interface AssignmentStudentSummary {
  id: string
  name: string | null
  email: string | null
  classId: string | null
  className: string | null
}

export interface AssignmentClassSummary {
  id: string
  name: string
  description: string | null
  studentCount: number
  students: AssignmentStudentSummary[]
}

export interface RecentAssignmentSummary {
  id: string
  workbookTitle: string
  workbookSubject: string | null
  createdAt: string
  targetClassIds: string[]
}

export interface AssignmentFormBootstrapData {
  teacherId: string
  serverNowIso: string
  workbooks: AssignmentWorkbookSummary[]
  classes: AssignmentClassSummary[]
  students: AssignmentStudentSummary[]
}
