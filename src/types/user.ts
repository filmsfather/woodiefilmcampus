export type UserRole = 'principal' | 'manager' | 'teacher' | 'student'

export type ProfileStatus = 'pending' | 'approved' | 'rejected'

export interface UserProfile {
  id: string
  email: string
  role: UserRole
  status: ProfileStatus
  name?: string
  student_phone?: string | null
  parent_phone?: string | null
  academic_record?: string | null
  class_id?: string
  created_at: string
  updated_at: string
}

export interface Class {
  id: string
  name: string
  description?: string
  homeroom_teacher_id?: string
  created_at: string
  updated_at: string
}

export interface Student {
  id: string
  name: string
  email: string
  class_id?: string
  created_at: string
}
