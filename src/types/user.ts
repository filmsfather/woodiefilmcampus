export type UserRole = 'principal' | 'manager' | 'teacher' | 'student'

export interface UserProfile {
  id: string
  email: string
  role: UserRole
  name?: string
  class_id?: string
  created_at: string
  updated_at: string
}

export interface Class {
  id: string
  name: string
  description?: string
  teacher_id?: string
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