export interface ClassTeacherSummary {
  id: string
  name: string | null
  email: string | null
  isHomeroom: boolean
}

export interface ClassStudentSummary {
  id: string
  name: string | null
  email: string | null
}

export interface ClassSummary {
  id: string
  name: string
  description: string | null
  homeroomTeacherId: string | null
  teachers: ClassTeacherSummary[]
  students: ClassStudentSummary[]
  createdAt: string
  updatedAt: string
}

export interface ProfileOption {
  id: string
  name: string | null
  email: string | null
}

