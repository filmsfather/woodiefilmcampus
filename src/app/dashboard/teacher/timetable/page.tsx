import { notFound } from 'next/navigation'

import { requireAuthForDashboard } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { TeacherTimetableViewer, type TeacherClassSummary, type TimetableForTeacher } from '@/components/dashboard/teacher/TeacherTimetableViewer'
import type { TimetableAssignment, TimetablePeriod, TimetableTeacherColumn } from '@/types/timetable'

interface ProfileOption {
  id: string
  name: string | null
  email: string | null
}

function toProfileOption(row: { id: string; name: string | null; email: string | null }): ProfileOption {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
  }
}

export default async function TeacherTimetablePage() {
  const { profile } = await requireAuthForDashboard(['teacher', 'manager'])

  if (!profile) {
    notFound()
  }

  const teacherId = profile.id
  const supabase = createClient()

  const { data: teacherColumnRows, error: teacherColumnError } = await supabase
    .from('timetable_teachers')
    .select('id, timetable_id, teacher_id, position')
    .eq('teacher_id', teacherId)

  if (teacherColumnError) {
    console.error('Failed to load teacher timetable columns', teacherColumnError)
  }

  const teacherColumns = teacherColumnRows ?? []
  const timetableIds = Array.from(new Set(teacherColumns.map((row) => row.timetable_id)))

  let timetables: TimetableForTeacher[] = []

  let timetableTeacherRows: Array<{ id: string; timetable_id: string; teacher_id: string; position: number }> = []
  let timetablePeriodRows: Array<{ id: string; timetable_id: string; name: string; position: number }> = []
  let timetableAssignmentRows: Array<{
    id: string
    timetable_id: string
    teacher_column_id: string
    period_id: string
    class_id: string
  }> = []
  let timetableRows: Array<{ id: string; name: string; created_at: string; updated_at: string }> = []

  if (timetableIds.length > 0) {
    const [timetableResult, teacherColumnsResult, periodResult, assignmentResult] = await Promise.all([
      supabase
        .from('timetables')
        .select('id, name, created_at, updated_at')
        .in('id', timetableIds)
        .order('created_at', { ascending: true }),
      supabase
        .from('timetable_teachers')
        .select('id, timetable_id, teacher_id, position')
        .in('timetable_id', timetableIds)
        .order('position', { ascending: true }),
      supabase
        .from('timetable_periods')
        .select('id, timetable_id, name, position')
        .in('timetable_id', timetableIds)
        .order('position', { ascending: true }),
      supabase
        .from('timetable_assignments')
        .select('id, timetable_id, teacher_column_id, period_id, class_id')
        .in('timetable_id', timetableIds),
    ])

    if (timetableResult.error) {
      console.error('Failed to load timetables for teacher', timetableResult.error)
    } else {
      timetableRows = timetableResult.data ?? []
    }

    if (teacherColumnsResult.error) {
      console.error('Failed to load timetable columns for viewer', teacherColumnsResult.error)
    } else {
      timetableTeacherRows = teacherColumnsResult.data ?? []
    }

    if (periodResult.error) {
      console.error('Failed to load timetable periods for viewer', periodResult.error)
    } else {
      timetablePeriodRows = periodResult.data ?? []
    }

    if (assignmentResult.error) {
      console.error('Failed to load timetable assignments for viewer', assignmentResult.error)
    } else {
      timetableAssignmentRows = assignmentResult.data ?? []
    }
  }

  const teacherColumnIdsByTimetable = new Map<string, string[]>()

  for (const row of teacherColumns) {
    const current = teacherColumnIdsByTimetable.get(row.timetable_id) ?? []
    current.push(row.id)
    teacherColumnIdsByTimetable.set(row.timetable_id, current)
  }

  const assignmentClassIds = new Set<string>()
  for (const row of timetableAssignmentRows) {
    if (row.class_id) {
      assignmentClassIds.add(row.class_id)
    }
  }

  const { data: classTeacherRows, error: classTeacherError } = await supabase
    .from('class_teachers')
    .select('class_id, teacher_id, is_homeroom')
    .eq('teacher_id', teacherId)

  if (classTeacherError) {
    console.error('Failed to load teacher class assignments', classTeacherError)
  }

  const teacherClassAssignments = classTeacherRows ?? []
  const teacherClassIds = new Set(teacherClassAssignments.map((row) => row.class_id))

  const allClassIds = new Set<string>([...assignmentClassIds, ...teacherClassIds])

  let classRows: Array<{ id: string; name: string; description: string | null; homeroom_teacher_id: string | null }> = []
  if (allClassIds.size > 0) {
    const { data, error } = await supabase
      .from('classes')
      .select('id, name, description, homeroom_teacher_id')
      .in('id', Array.from(allClassIds))

    if (error) {
      console.error('Failed to load classes for timetable viewer', error)
    } else {
      classRows = data ?? []
    }
  }

  const classNameMap = new Map(classRows.map((row) => [row.id, row.name]))

  let classStudentRows: Array<{ class_id: string; student_id: string }> = []
  if (teacherClassIds.size > 0) {
    const { data, error } = await supabase
      .from('class_students')
      .select('class_id, student_id')
      .in('class_id', Array.from(teacherClassIds))

    if (error) {
      console.error('Failed to load students for teacher classes', error)
    } else {
      classStudentRows = data ?? []
    }
  }

  const teacherProfileIds = new Set<string>()
  for (const row of timetableTeacherRows) {
    if (row.teacher_id) {
      teacherProfileIds.add(row.teacher_id)
    }
  }
  for (const row of classRows) {
    if (row.homeroom_teacher_id) {
      teacherProfileIds.add(row.homeroom_teacher_id)
    }
  }

  let teacherOptionMap = new Map<string, ProfileOption>()
  if (teacherProfileIds.size > 0) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, name, email')
      .in('id', Array.from(teacherProfileIds))

    if (error) {
      console.error('Failed to load teacher profiles for timetable viewer', error)
    } else {
      teacherOptionMap = new Map((data ?? []).map((row) => [row.id, toProfileOption(row)]))
    }
  }

  const studentIds = new Set(classStudentRows.map((row) => row.student_id))
  let studentOptionMap = new Map<string, ProfileOption>()
  if (studentIds.size > 0) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, name, email')
      .in('id', Array.from(studentIds))

    if (error) {
      console.error('Failed to load student profiles for timetable viewer', error)
    } else {
      studentOptionMap = new Map((data ?? []).map((row) => [row.id, toProfileOption(row)]))
    }
  }

  const teacherColumnsByTimetable = new Map<string, TimetableTeacherColumn[]>()
  for (const row of timetableTeacherRows) {
    const option = teacherOptionMap.get(row.teacher_id) ?? null
    const current = teacherColumnsByTimetable.get(row.timetable_id) ?? []
    current.push({
      id: row.id,
      timetableId: row.timetable_id,
      position: row.position,
      teacherId: row.teacher_id,
      teacherName: option?.name ?? null,
      teacherEmail: option?.email ?? null,
    })
    teacherColumnsByTimetable.set(row.timetable_id, current)
  }

  const periodsByTimetable = new Map<string, TimetablePeriod[]>()
  for (const row of timetablePeriodRows) {
    const current = periodsByTimetable.get(row.timetable_id) ?? []
    current.push({
      id: row.id,
      timetableId: row.timetable_id,
      position: row.position,
      name: row.name,
    })
    periodsByTimetable.set(row.timetable_id, current)
  }

  const assignmentsByTimetable = new Map<string, TimetableAssignment[]>()
  for (const row of timetableAssignmentRows) {
    const current = assignmentsByTimetable.get(row.timetable_id) ?? []
    current.push({
      id: row.id,
      timetableId: row.timetable_id,
      teacherColumnId: row.teacher_column_id,
      periodId: row.period_id,
      classId: row.class_id,
      className: classNameMap.get(row.class_id) ?? '이름 없는 반',
    })
    assignmentsByTimetable.set(row.timetable_id, current)
  }

  timetables = timetableRows
    .map((row) => {
      const columns = (teacherColumnsByTimetable.get(row.id) ?? []).sort((a, b) => a.position - b.position)
      const periods = (periodsByTimetable.get(row.id) ?? []).sort((a, b) => a.position - b.position)
      const assignments = assignmentsByTimetable.get(row.id) ?? []

      return {
        id: row.id,
        name: row.name,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        teacherColumns: columns,
        periods,
        assignments,
        teacherColumnIds: teacherColumnIdsByTimetable.get(row.id) ?? [],
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'))

  const classStudentsMap = new Map<string, Array<{ class_id: string; student_id: string }>>()
  for (const row of classStudentRows) {
    const current = classStudentsMap.get(row.class_id) ?? []
    current.push(row)
    classStudentsMap.set(row.class_id, current)
  }

  const teacherClasses: TeacherClassSummary[] = Array.from(teacherClassIds)
    .map((classId) => {
      const classRow = classRows.find((row) => row.id === classId)
      if (!classRow) {
        return null
      }

      const homeroom = classRow.homeroom_teacher_id
        ? teacherOptionMap.get(classRow.homeroom_teacher_id)
        : null

      const students = (classStudentsMap.get(classId) ?? []).map((assignment) => {
        const option = studentOptionMap.get(assignment.student_id)
        return {
          id: assignment.student_id,
          name: option?.name ?? null,
          email: option?.email ?? null,
        }
      })

      students.sort((a, b) => (a.name ?? a.email ?? '').localeCompare(b.name ?? b.email ?? '', 'ko'))

      return {
        id: classRow.id,
        name: classRow.name,
        description: classRow.description ?? null,
        homeroomTeacherName: homeroom?.name ?? homeroom?.email ?? null,
        students,
      }
    })
    .filter((item): item is TeacherClassSummary => item !== null)
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'))

  return (
    <section className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-6 lg:px-0">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-slate-900">시간표 확인</h1>
        <p className="text-sm text-slate-600">담당 시간표와 소속 반 정보를 한 곳에서 확인할 수 있습니다.</p>
      </header>

      <TeacherTimetableViewer timetables={timetables} classes={teacherClasses} />
    </section>
  )
}
