import { notFound } from 'next/navigation'

import { requireAuthForDashboard } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { TeacherTimetableViewer, type TeacherClassSummary } from '@/components/dashboard/teacher/TeacherTimetableViewer'
import type { ClassScheduleEntry } from '@/types/timetable'

interface ProfileOption {
  id: string
  name: string | null
  email: string | null
}

type ProfileDisplayNameRow = { id: string; display_name: string | null }

function toProfileOption(row: { id: string; display_name: string | null }): ProfileOption {
  return {
    id: row.id,
    name: row.display_name,
    email: null,
  }
}

export default async function TeacherTimetablePage() {
  const { profile } = await requireAuthForDashboard(['teacher', 'manager'])

  if (!profile) {
    notFound()
  }

  const teacherId = profile.id
  const supabase = await createClient()

  const [{ data: scheduleRowsData, error: scheduleError }, { data: classTeacherRows, error: classTeacherError }] =
    await Promise.all([
      supabase
        .from('class_schedule_entries')
        .select('id, class_id, day_of_week, period, start_time, end_time, teacher_id')
        .eq('teacher_id', teacherId),
      supabase
        .from('class_teachers')
        .select('class_id, teacher_id, is_homeroom')
        .eq('teacher_id', teacherId),
    ])

  if (scheduleError) {
    console.error('Failed to load schedule entries for teacher', scheduleError)
  }

  if (classTeacherError) {
    console.error('Failed to load teacher class assignments', classTeacherError)
  }

  const scheduleRows = scheduleRowsData ?? []
  const teacherClassAssignments = classTeacherRows ?? []
  const teacherClassIds = new Set(teacherClassAssignments.map((row) => row.class_id))

  const scheduleClassIds = new Set(scheduleRows.map((row) => row.class_id))
  const allClassIds = new Set<string>([...scheduleClassIds, ...teacherClassIds])

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

  const homeroomTeacherIds = new Set<string>()
  for (const row of classRows) {
    if (row.homeroom_teacher_id) {
      homeroomTeacherIds.add(row.homeroom_teacher_id)
    }
  }

  let teacherOptionMap = new Map<string, ProfileOption>()
  if (homeroomTeacherIds.size > 0) {
    const { data, error } = await supabase.rpc('get_profile_display_names', {
      target_ids: Array.from(homeroomTeacherIds),
    })

    if (error) {
      console.error('Failed to load teacher names for timetable viewer', error)
    } else {
      const rows = (data as ProfileDisplayNameRow[] | null) ?? []
      teacherOptionMap = new Map(rows.map((row) => [row.id, toProfileOption(row)]))
    }
  }

  const studentIds = new Set(classStudentRows.map((row) => row.student_id))
  let studentOptionMap = new Map<string, ProfileOption>()
  if (studentIds.size > 0) {
    const { data, error } = await supabase.rpc('get_profile_display_names', {
      target_ids: Array.from(studentIds),
    })

    if (error) {
      console.error('Failed to load student names for timetable viewer', error)
    } else {
      const rows = (data as ProfileDisplayNameRow[] | null) ?? []
      studentOptionMap = new Map(rows.map((row) => [row.id, toProfileOption(row)]))
    }
  }

  const entries: ClassScheduleEntry[] = scheduleRows.map((row) => ({
    id: row.id,
    classId: row.class_id,
    className: classNameMap.get(row.class_id) ?? '이름 없는 반',
    dayOfWeek: row.day_of_week,
    period: row.period,
    startTime: row.start_time,
    endTime: row.end_time,
    teacherId: row.teacher_id ?? null,
    teacherName: profile.name ?? null,
  }))

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

      <TeacherTimetableViewer entries={entries} classes={teacherClasses} />
    </section>
  )
}
