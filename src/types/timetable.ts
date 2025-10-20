export interface TimetableTeacherColumn {
  id: string
  timetableId: string
  position: number
  teacherId: string
  teacherName: string | null
  teacherEmail: string | null
}

export interface TimetablePeriod {
  id: string
  timetableId: string
  position: number
  name: string
}

export interface TimetableAssignment {
  id: string
  timetableId: string
  teacherColumnId: string
  periodId: string
  classId: string
  className: string
}

export interface TimetableSummary {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  teacherColumns: TimetableTeacherColumn[]
  periods: TimetablePeriod[]
  assignments: TimetableAssignment[]
}
