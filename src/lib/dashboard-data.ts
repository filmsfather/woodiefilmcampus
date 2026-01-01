/**
 * 대시보드 Summary 카드용 데이터 fetching 함수들
 * 페이지 레벨에서 병렬로 호출하여 성능 최적화
 */

import type { SupabaseClient } from '@supabase/supabase-js'

import DateUtil from '@/lib/date-util'
import { fetchUnreadNotices, type NoticeSummaryItem } from '@/lib/notice-board'
import { resolveMonthRange } from '@/lib/work-logs'

// ============================================
// Types
// ============================================

export interface AnnualScheduleData {
  regularSchedule: {
    period_label: string
    start_date: string
    end_date: string
    memo: string | null
  } | null
  specialSchedule: {
    period_label: string
    start_date: string
    end_date: string
    memo: string | null
  } | null
}

export interface TimetableScheduleItem {
  periodName: string
  className: string | null
}

export interface TimetableData {
  timetableName: string | null
  schedule: TimetableScheduleItem[]
}

export interface WorkJournalData {
  totalHours: number
  monthLabel: string
}

export interface AssignedClass {
  id: string
  name: string
  isHomeroom: boolean
  students: Array<{
    id: string
    name: string
    email: string
    student_phone?: string | null
    parent_phone?: string | null
    academic_record?: string | null
  }>
}

// ============================================
// Fetch Functions
// ============================================

export async function fetchAnnualScheduleData(
  supabase: SupabaseClient
): Promise<AnnualScheduleData> {
  DateUtil.initServerClock()
  const today = DateUtil.nowUTC().toISOString().split('T')[0]

  const { data: schedules } = await supabase
    .from('learning_journal_annual_schedules')
    .select('*')
    .lte('start_date', today)
    .gte('end_date', today)
    .order('start_date', { ascending: true })

  const activeSchedules = schedules || []

  return {
    regularSchedule: activeSchedules.find(s => s.category === 'annual') ?? null,
    specialSchedule: activeSchedules.find(s => s.category === 'film_production') ?? null,
  }
}

export async function fetchNoticeData(
  supabase: SupabaseClient,
  profileId: string
): Promise<NoticeSummaryItem[]> {
  return fetchUnreadNotices(supabase, profileId)
}

export async function fetchTimetableData(
  supabase: SupabaseClient,
  profileId: string
): Promise<TimetableData> {
  // 1. Find timetables for this teacher
  const { data: teacherColumnsData } = await supabase
    .from('timetable_teachers')
    .select('id, timetable_id, timetables(id, name, created_at)')
    .eq('teacher_id', profileId)

  if (!teacherColumnsData || teacherColumnsData.length === 0) {
    return { timetableName: null, schedule: [] }
  }

  type TeacherColumn = {
    id: string
    timetable_id: string
    timetables: { id: string; name: string; created_at: string } | null
  }

  // Sort by created_at desc to get the latest
  const sortedColumns = (teacherColumnsData as unknown as TeacherColumn[]).sort((a, b) => {
    const dateA = a.timetables?.created_at ? new Date(a.timetables.created_at).getTime() : 0
    const dateB = b.timetables?.created_at ? new Date(b.timetables.created_at).getTime() : 0
    return dateB - dateA
  })

  const latestColumn = sortedColumns[0]
  const timetableId = latestColumn.timetable_id
  const teacherColumnId = latestColumn.id
  const timetableName = latestColumn.timetables?.name ?? '시간표'

  // 2. Fetch assignments and periods in parallel
  const [assignmentsResult, periodsResult] = await Promise.all([
    supabase
      .from('timetable_assignments')
      .select('period_id, class_id, classes(name)')
      .eq('teacher_column_id', teacherColumnId),
    supabase
      .from('timetable_periods')
      .select('id, name, position')
      .eq('timetable_id', timetableId)
      .order('position', { ascending: true }),
  ])

  const assignments = assignmentsResult.data ?? []
  const periods = periodsResult.data ?? []

  // 3. Map assignments to periods
  const schedule = periods.map((period) => {
    const periodAssignments = assignments.filter((a) => a.period_id === period.id)

    if (periodAssignments.length === 0) {
      return {
        periodName: period.name,
        className: null,
      }
    }

    const classNames = periodAssignments
      // @ts-ignore
      .map((a) => a.classes?.name)
      .filter((name): name is string => !!name)
      .sort((a, b) => a.localeCompare(b, 'ko'))
      .join(', ')

    return {
      periodName: period.name,
      className: classNames,
    }
  }).filter(item => item.className !== null)

  return { timetableName, schedule }
}

export async function fetchWorkJournalData(
  supabase: SupabaseClient,
  profileId: string
): Promise<WorkJournalData> {
  DateUtil.initServerClock()
  const monthRange = resolveMonthRange(null)

  const { data: entries } = await supabase
    .from('work_log_entries')
    .select('work_hours')
    .eq('teacher_id', profileId)
    .gte('work_date', monthRange.startDate)
    .lt('work_date', monthRange.endExclusiveDate)

  const totalHours = (entries ?? []).reduce((sum, entry) => sum + (entry.work_hours ?? 0), 0)

  return {
    totalHours,
    monthLabel: monthRange.label,
  }
}

export async function fetchAssignedClasses(
  supabase: SupabaseClient,
  profileId: string
): Promise<AssignedClass[]> {
  // 1. Fetch classes where user is homeroom teacher
  const { data: homeroomClasses } = await supabase
    .from('classes')
    .select('id, name')
    .eq('homeroom_teacher_id', profileId)

  // 2. Fetch classes where user is a subject teacher
  const { data: subjectClassesRel } = await supabase
    .from('class_teachers')
    .select('class_id, classes(id, name)')
    .eq('teacher_id', profileId)

  // Merge and deduplicate classes
  const classMap = new Map<string, { id: string; name: string; isHomeroom: boolean }>()

  homeroomClasses?.forEach((c) => {
    classMap.set(c.id, { id: c.id, name: c.name, isHomeroom: true })
  })

  subjectClassesRel?.forEach((rel) => {
    const c = Array.isArray(rel.classes) ? rel.classes[0] : rel.classes
    if (c && !classMap.has(c.id)) {
      classMap.set(c.id, { id: c.id, name: c.name, isHomeroom: false })
    }
  })

  const classes = Array.from(classMap.values())

  if (classes.length === 0) {
    return []
  }

  // 3. Fetch students for each class
  const classIds = classes.map((c) => c.id)
  const { data: classStudentsData } = await supabase
    .from('class_students')
    .select('class_id, student_id, profiles!class_students_student_id_fkey(id, name, email, student_phone, parent_phone, academic_record)')
    .in('class_id', classIds)

  const studentsByClass = new Map<string, Array<{
    id: string
    name: string
    email: string
    student_phone?: string | null
    parent_phone?: string | null
    academic_record?: string | null
  }>>()

  classStudentsData?.forEach((row) => {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles
    if (profile && profile.name) {
      const list = studentsByClass.get(row.class_id) || []
      list.push({
        id: profile.id,
        name: profile.name,
        email: profile.email,
        student_phone: profile.student_phone,
        parent_phone: profile.parent_phone,
        academic_record: profile.academic_record,
      })
      studentsByClass.set(row.class_id, list)
    }
  })

  const classesWithStudents = classes.map((c) => {
    const students = studentsByClass.get(c.id) || []
    students.sort((a, b) => a.name.localeCompare(b.name, 'ko'))
    return {
      ...c,
      students,
    }
  })

  classesWithStudents.sort((a, b) => a.name.localeCompare(b.name, 'ko'))

  return classesWithStudents
}

// ============================================
// Combined Fetch for Teacher Dashboard
// ============================================

export interface TeacherDashboardData {
  annualSchedule: AnnualScheduleData
  notices: NoticeSummaryItem[]
  timetable: TimetableData
  workJournal: WorkJournalData
  assignedClasses: AssignedClass[]
}

export async function fetchTeacherDashboardData(
  supabase: SupabaseClient,
  profileId: string
): Promise<TeacherDashboardData> {
  const [annualSchedule, notices, timetable, workJournal, assignedClasses] = await Promise.all([
    fetchAnnualScheduleData(supabase),
    fetchNoticeData(supabase, profileId),
    fetchTimetableData(supabase, profileId),
    fetchWorkJournalData(supabase, profileId),
    fetchAssignedClasses(supabase, profileId),
  ])

  return {
    annualSchedule,
    notices,
    timetable,
    workJournal,
    assignedClasses,
  }
}

