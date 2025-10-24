import Link from 'next/link'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { ClassesManager } from '@/components/dashboard/manager/classes/ClassesManager'
import { TimetableManager } from '@/components/dashboard/manager/classes/TimetableManager'
import { createClient } from '@/lib/supabase/server'
import { requireAuthForDashboard } from '@/lib/auth'
import type { ClassSummary, ProfileOption } from '@/types/class'
import type { TimetableSummary } from '@/types/timetable'
import { Button } from '@/components/ui/button'

type SearchParams = Record<string, string | string[] | undefined>

function toProfileOption(row: { id: string; name: string | null; email: string | null }): ProfileOption {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
  }
}

function compareProfileOption(a: ProfileOption, b: ProfileOption) {
  const left = (a.name ?? a.email ?? '').toLowerCase()
  const right = (b.name ?? b.email ?? '').toLowerCase()
  return left.localeCompare(right, 'ko')
}

function normalizeSearchValue(raw: string) {
  return raw.trim().toLowerCase()
}

function matchesSearchTerm(classItem: ClassSummary, normalizedTerm: string) {
  if (!normalizedTerm) {
    return true
  }

  const valuesToCheck = [
    classItem.name,
    classItem.description ?? '',
    classItem.teachers.map((teacher) => teacher.name ?? teacher.email ?? '').join(' '),
    classItem.students.map((student) => student.name ?? student.email ?? '').join(' '),
  ]

  return valuesToCheck.some((value) => value.toLowerCase().includes(normalizedTerm))
}

export default async function ManagerClassesPage({
  searchParams,
}: {
  searchParams?: SearchParams
}) {
  await requireAuthForDashboard('manager')

  const supabase = createClient()
  const searchParam = searchParams?.search
  const searchValue = Array.isArray(searchParam) ? searchParam[0] ?? '' : searchParam ?? ''
  const normalizedSearch = normalizeSearchValue(searchValue)

  const { data: classRowsData, error: classError } = await supabase
    .from('classes')
    .select('id, name, description, homeroom_teacher_id, created_at, updated_at')
    .order('name', { ascending: true })

  if (classError) {
    console.error('Failed to load classes', classError)
  }

  const classRows = classRowsData ?? []
  const classIds = classRows.map((row) => row.id)

  let classTeacherRows: Array<{ class_id: string; teacher_id: string; is_homeroom: boolean | null }> = []

  if (classIds.length > 0) {
    const { data: teacherRowsData, error: classTeacherError } = await supabase
      .from('class_teachers')
      .select('class_id, teacher_id, is_homeroom')
      .in('class_id', classIds)

    if (classTeacherError) {
      console.error('Failed to load class teacher assignments', classTeacherError)
    }

    classTeacherRows = teacherRowsData ?? []
  }

  let classStudentRows: Array<{ class_id: string; student_id: string }> = []

  if (classIds.length > 0) {
    const { data: studentRowsData, error: classStudentError } = await supabase
      .from('class_students')
      .select('class_id, student_id')
      .in('class_id', classIds)

    if (classStudentError) {
      console.error('Failed to load class student assignments', classStudentError)
    }

    classStudentRows = studentRowsData ?? []
  }

  const [teacherProfilesResult, studentProfilesResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, name, email')
      .in('role', ['teacher', 'principal'])
      .eq('status', 'approved')
      .order('name', { ascending: true, nullsFirst: false }),
    supabase
      .from('profiles')
      .select('id, name, email')
      .eq('role', 'student')
      .eq('status', 'approved')
      .order('name', { ascending: true, nullsFirst: false }),
  ])

  if (teacherProfilesResult.error) {
    console.error('Failed to load teacher profiles', teacherProfilesResult.error)
  }

  if (studentProfilesResult.error) {
    console.error('Failed to load student profiles', studentProfilesResult.error)
  }

  const teacherOptions = (teacherProfilesResult.data ?? [])
    .map(toProfileOption)
    .sort(compareProfileOption)

  const studentOptions = (studentProfilesResult.data ?? [])
    .map(toProfileOption)
    .sort(compareProfileOption)

  const teacherOptionMap = new Map(teacherOptions.map((option) => [option.id, option]))
  const studentOptionMap = new Map(studentOptions.map((option) => [option.id, option]))
  const classNameMap = new Map(classRows.map((row) => [row.id, row.name]))

  const { data: timetableRowsData, error: timetableError } = await supabase
    .from('timetables')
    .select('id, name, created_at, updated_at')
    .order('created_at', { ascending: true })

  if (timetableError) {
    console.error('Failed to load timetables', timetableError)
  }

  const timetableRows = timetableRowsData ?? []
  const timetableIds = timetableRows.map((row) => row.id)

  let timetableTeacherRows: Array<{ id: string; timetable_id: string; teacher_id: string; position: number }> = []
  let timetablePeriodRows: Array<{ id: string; timetable_id: string; name: string; position: number }> = []
  let timetableAssignmentRows: Array<{
    id: string
    timetable_id: string
    teacher_column_id: string
    period_id: string
    class_id: string
  }> = []

  if (timetableIds.length > 0) {
    const [{ data: teacherRowsData, error: teacherRowsError }, { data: periodRowsData, error: periodRowsError }, { data: assignmentRowsData, error: assignmentRowsError }] =
      await Promise.all([
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

    if (teacherRowsError) {
      console.error('Failed to load timetable teacher columns', teacherRowsError)
    }

    if (periodRowsError) {
      console.error('Failed to load timetable periods', periodRowsError)
    }

    if (assignmentRowsError) {
      console.error('Failed to load timetable assignments', assignmentRowsError)
    }

    timetableTeacherRows = teacherRowsData ?? []
    timetablePeriodRows = periodRowsData ?? []
    timetableAssignmentRows = assignmentRowsData ?? []
  }

  const timetableTeacherGroups = new Map<string, typeof timetableTeacherRows>()
  const timetablePeriodGroups = new Map<string, typeof timetablePeriodRows>()
  const timetableAssignmentGroups = new Map<string, typeof timetableAssignmentRows>()

  for (const row of timetableTeacherRows) {
    const current = timetableTeacherGroups.get(row.timetable_id) ?? []
    current.push(row)
    timetableTeacherGroups.set(row.timetable_id, current)
  }

  for (const row of timetablePeriodRows) {
    const current = timetablePeriodGroups.get(row.timetable_id) ?? []
    current.push(row)
    timetablePeriodGroups.set(row.timetable_id, current)
  }

  for (const row of timetableAssignmentRows) {
    const current = timetableAssignmentGroups.get(row.timetable_id) ?? []
    current.push(row)
    timetableAssignmentGroups.set(row.timetable_id, current)
  }

  const timetables: TimetableSummary[] = timetableRows.map((row) => {
    const teacherColumns = (timetableTeacherGroups.get(row.id) ?? []).map((teacherRow) => {
      const profile = teacherOptionMap.get(teacherRow.teacher_id)
      return {
        id: teacherRow.id,
        timetableId: teacherRow.timetable_id,
        position: teacherRow.position,
        teacherId: teacherRow.teacher_id,
        teacherName: profile?.name ?? null,
        teacherEmail: profile?.email ?? null,
      }
    })

    const periods = (timetablePeriodGroups.get(row.id) ?? []).map((periodRow) => ({
      id: periodRow.id,
      timetableId: periodRow.timetable_id,
      position: periodRow.position,
      name: periodRow.name,
    }))

    const assignments = (timetableAssignmentGroups.get(row.id) ?? []).map((assignmentRow) => ({
      id: assignmentRow.id,
      timetableId: assignmentRow.timetable_id,
      teacherColumnId: assignmentRow.teacher_column_id,
      periodId: assignmentRow.period_id,
      classId: assignmentRow.class_id,
      className: classNameMap.get(assignmentRow.class_id) ?? '이름 없는 반',
    }))

    return {
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      teacherColumns,
      periods,
      assignments,
    }
  })

  const classTeachersMap = new Map<string, Array<{ teacher_id: string; is_homeroom: boolean | null }>>()
  const classStudentsMap = new Map<string, Array<{ student_id: string }>>()

  for (const row of classTeacherRows) {
    const current = classTeachersMap.get(row.class_id) ?? []
    current.push(row)
    classTeachersMap.set(row.class_id, current)
  }

  for (const row of classStudentRows) {
    const current = classStudentsMap.get(row.class_id) ?? []
    current.push(row)
    classStudentsMap.set(row.class_id, current)
  }

  const classSummaries: ClassSummary[] = classRows.map((row) => {
    const teacherAssignments = classTeachersMap.get(row.id) ?? []
    const teachers = teacherAssignments.map((assignment) => {
      const option = teacherOptionMap.get(assignment.teacher_id)
      return {
        id: assignment.teacher_id,
        name: option?.name ?? null,
        email: option?.email ?? null,
        isHomeroom: assignment.is_homeroom ?? assignment.teacher_id === row.homeroom_teacher_id,
      }
    })

    if (row.homeroom_teacher_id && !teachers.some((teacher) => teacher.id === row.homeroom_teacher_id)) {
      const option = teacherOptionMap.get(row.homeroom_teacher_id)
      teachers.unshift({
        id: row.homeroom_teacher_id,
        name: option?.name ?? null,
        email: option?.email ?? null,
        isHomeroom: true,
      })
    } else {
      for (const teacher of teachers) {
        if (teacher.id === row.homeroom_teacher_id) {
          teacher.isHomeroom = true
        }
      }
    }

    const studentAssignments = classStudentsMap.get(row.id) ?? []
    const students = studentAssignments.map((assignment) => {
      const option = studentOptionMap.get(assignment.student_id)
      return {
        id: assignment.student_id,
        name: option?.name ?? null,
        email: option?.email ?? null,
      }
    })

    return {
      id: row.id,
      name: row.name,
      description: row.description ?? null,
      homeroomTeacherId: row.homeroom_teacher_id ?? null,
      teachers,
      students,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  })

  const filteredClasses = normalizedSearch
    ? classSummaries.filter((item) => matchesSearchTerm(item, normalizedSearch))
    : classSummaries

  return (
    <section className="space-y-6">
      <div className="space-y-3">
        <DashboardBackLink fallbackHref="/dashboard/manager" label="실장 허브로 돌아가기" />
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold text-slate-900">반 관리</h1>
            <p className="text-slate-600">
              승인된 교사와 학생을 기반으로 반을 생성하고 담당 교사·학생 배정을 관리할 수 있습니다.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/dashboard/manager/absences">결석확인</Link>
          </Button>
        </div>
      </div>

      <TimetableManager
        timetables={timetables}
        classes={classSummaries}
        teacherOptions={teacherOptions}
      />

      <ClassesManager
        classes={filteredClasses}
        teacherOptions={teacherOptions}
        studentOptions={studentOptions}
        searchTerm={searchValue}
      />
    </section>
  )
}
