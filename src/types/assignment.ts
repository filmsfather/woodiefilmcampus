export interface AssignmentWorkbookSummary {
  id: string
  title: string
  subject: string
  type: string
  weekLabel: string | null
  tags: string[]
  updatedAt: string
  itemCount: number
}

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

export interface AssignmentFormBootstrapData {
  teacherId: string
  serverNowIso: string
  workbooks: AssignmentWorkbookSummary[]
  classes: AssignmentClassSummary[]
  students: AssignmentStudentSummary[]
}
