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
  /** 온라인반 여부. 온라인반 학생은 온라인 전용 모의실기만 예약할 수 있다. */
  isOnline: boolean
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

