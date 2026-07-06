import type { WeekdayPreference } from '@/lib/university-confirmation/constants'
import type { WishlistCategory } from '@/lib/university-policy/yedae'

export type ClassFormationPlanStatus = 'draft' | 'finalized'

export interface ClassFormationPlan {
  id: string
  name: string
  status: ClassFormationPlanStatus
  createdBy: string
  createdAt: string
  updatedAt: string
}

/** 편성 대상 학생이 확정(/confirm)한 지원 대학 1건. */
export interface FormationStudentUniversity {
  key: string
  universityId: string | null
  universityName: string
  shortName: string | null
  programName: string
  category: WishlistCategory
  region: string | null
}

/** /confirm 폼 제출을 완료한 편성 대상 학생. */
export interface FormationStudent {
  studentId: string
  studentName: string
  email: string
  /** 현재(기존) 소속 반 이름. */
  className: string | null
  weekdayPreferences: WeekdayPreference[]
  kartsApply: boolean
  universities: FormationStudentUniversity[]
}

export interface ClassFormationGroup {
  id: string
  planId: string
  name: string
  weekday: WeekdayPreference | null
  homeroomTeacherId: string | null
  materializedClassId: string | null
  sortOrder: number
  note: string | null
  /** 이 반에 배치된 학생 ID 목록. */
  memberIds: string[]
}

/** 워크스페이스 렌더에 필요한 전체 상태. */
export interface ClassFormationBoard {
  plan: ClassFormationPlan
  groups: ClassFormationGroup[]
  /** 편성 대상 학생 풀(확정 완료 학생 전체). */
  students: FormationStudent[]
  /** studentId → groupId (배치 조회 편의). */
  assignments: Record<string, string>
}

export interface TeacherOption {
  id: string
  name: string | null
  email: string | null
}
