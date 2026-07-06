/**
 * 반편성(class formation) 워크스페이스 조회 헬퍼.
 *
 * 편성 대상 풀은 /confirm 폼 제출을 완료한(status='confirmed') 학생이며,
 * `fetchConfirmedFinalSummaries()`를 단일 출처로 재사용한다.
 * 모든 조회는 admin(service role)로 수행하고 접근 제어는 호출 페이지의 역할 검증에 맡긴다.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import {
  fetchConfirmedFinalSummaries,
  type ConfirmedFinalSummary,
} from '@/lib/university-confirmation/data'
import {
  isWeekdayPreference,
  type WeekdayPreference,
} from '@/lib/university-confirmation/constants'
import type {
  ClassFormationBoard,
  ClassFormationGroup,
  ClassFormationPlan,
  ClassFormationPlanStatus,
  FormationStudent,
  FormationStudentUniversity,
  TeacherOption,
} from '@/types/class-formation'

const KARTS_UNIVERSITY_NAME = '한국예술종합학교'

interface PlanRow {
  id: string
  name: string
  status: ClassFormationPlanStatus
  created_by: string
  created_at: string
  updated_at: string
}

interface GroupRow {
  id: string
  plan_id: string
  name: string
  weekday: string | null
  homeroom_teacher_id: string | null
  materialized_class_id: string | null
  sort_order: number
  note: string | null
}

interface MemberRow {
  group_id: string
  student_id: string
}

function toPlan(row: PlanRow): ClassFormationPlan {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function normalizeWeekdays(values: string[]): WeekdayPreference[] {
  return values.filter((value): value is WeekdayPreference => isWeekdayPreference(value))
}

/** 확정 요약(ConfirmedFinalSummary)을 편성용 FormationStudent로 변환한다. */
export function mapFormationStudent(summary: ConfirmedFinalSummary): FormationStudent {
  const universities: FormationStudentUniversity[] = []

  for (const item of [...summary.generalItems, ...summary.specializedItems]) {
    universities.push({
      key: item.id,
      universityId: item.universityId,
      universityName: item.universityName,
      shortName: item.shortName,
      programName: item.programName,
      category: item.category,
      region: item.region,
    })
  }

  if (summary.kartsApply) {
    universities.push({
      key: `${summary.studentId}-karts`,
      universityId: 'karts',
      universityName: KARTS_UNIVERSITY_NAME,
      shortName: '한예종',
      programName: '지원',
      category: 'karts',
      region: '서울',
    })
  }

  return {
    studentId: summary.studentId,
    studentName: summary.studentName,
    email: summary.email,
    className: summary.className,
    weekdayPreferences: normalizeWeekdays(summary.weekdayPreferences),
    kartsApply: summary.kartsApply,
    universities,
  }
}

export async function fetchFormationStudents(): Promise<FormationStudent[]> {
  const summaries = await fetchConfirmedFinalSummaries()
  return summaries.map(mapFormationStudent)
}

export async function fetchClassFormationPlans(): Promise<ClassFormationPlan[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('class_formation_plans')
    .select('id, name, status, created_by, created_at, updated_at')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[class-formation] fetchClassFormationPlans error', error)
    return []
  }

  return (data as PlanRow[] | null)?.map(toPlan) ?? []
}

/** 편성 반 담임 후보(교사/원장) 옵션 목록. */
export async function fetchTeacherOptions(): Promise<TeacherOption[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, email')
    .in('role', ['teacher', 'principal'])
    .eq('status', 'approved')
    .order('name', { ascending: true, nullsFirst: false })

  if (error) {
    console.error('[class-formation] fetchTeacherOptions error', error)
    return []
  }

  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: (row.name as string | null) ?? null,
    email: (row.email as string | null) ?? null,
  }))
}

/**
 * 특정 반편성안의 보드 상태(plan + groups + members + 편성 대상 학생)를 조립한다.
 * planId가 없거나 존재하지 않으면 null을 반환한다.
 */
export async function fetchClassFormationBoard(
  planId: string
): Promise<ClassFormationBoard | null> {
  const supabase = createAdminClient()

  const { data: planData, error: planError } = await supabase
    .from('class_formation_plans')
    .select('id, name, status, created_by, created_at, updated_at')
    .eq('id', planId)
    .maybeSingle()

  if (planError) {
    console.error('[class-formation] fetchClassFormationBoard plan error', planError)
    return null
  }
  if (!planData) return null

  const [groupsResult, membersResult, students] = await Promise.all([
    supabase
      .from('class_formation_groups')
      .select('id, plan_id, name, weekday, homeroom_teacher_id, materialized_class_id, sort_order, note')
      .eq('plan_id', planId)
      .order('sort_order', { ascending: true }),
    supabase
      .from('class_formation_members')
      .select('group_id, student_id')
      .eq('plan_id', planId),
    fetchFormationStudents(),
  ])

  if (groupsResult.error) {
    console.error('[class-formation] fetchClassFormationBoard groups error', groupsResult.error)
  }
  if (membersResult.error) {
    console.error('[class-formation] fetchClassFormationBoard members error', membersResult.error)
  }

  const memberRows = (membersResult.data as MemberRow[] | null) ?? []

  const membersByGroup = new Map<string, string[]>()
  const assignments: Record<string, string> = {}
  for (const row of memberRows) {
    const list = membersByGroup.get(row.group_id) ?? []
    list.push(row.student_id)
    membersByGroup.set(row.group_id, list)
    assignments[row.student_id] = row.group_id
  }

  const groups: ClassFormationGroup[] = ((groupsResult.data as GroupRow[] | null) ?? []).map(
    (row) => ({
      id: row.id,
      planId: row.plan_id,
      name: row.name,
      weekday: row.weekday && isWeekdayPreference(row.weekday) ? row.weekday : null,
      homeroomTeacherId: row.homeroom_teacher_id,
      materializedClassId: row.materialized_class_id,
      sortOrder: row.sort_order,
      note: row.note,
      memberIds: membersByGroup.get(row.id) ?? [],
    })
  )

  return {
    plan: toPlan(planData as PlanRow),
    groups,
    students,
    assignments,
  }
}
