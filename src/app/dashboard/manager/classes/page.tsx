import { ClassesManager } from '@/components/dashboard/manager/classes/ClassesManager'
import { createClient } from '@/lib/supabase/server'
import { requireAuthForDashboard } from '@/lib/auth'
import type { ClassSummary, ProfileOption } from '@/types/class'

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

  const { data: classRows = [], error: classError } = await supabase
    .from('classes')
    .select('id, name, description, homeroom_teacher_id, created_at, updated_at')
    .order('name', { ascending: true })

  if (classError) {
    console.error('Failed to load classes', classError)
  }

  const classIds = classRows.map((row) => row.id)

  let classTeacherRows: Array<{ class_id: string; teacher_id: string; is_homeroom: boolean | null }> = []

  if (classIds.length > 0) {
    const { data: teacherRows = [], error: classTeacherError } = await supabase
      .from('class_teachers')
      .select('class_id, teacher_id, is_homeroom')
      .in('class_id', classIds)

    if (classTeacherError) {
      console.error('Failed to load class teacher assignments', classTeacherError)
    }

    classTeacherRows = teacherRows
  }

  let classStudentRows: Array<{ class_id: string; student_id: string }> = []

  if (classIds.length > 0) {
    const { data: studentRows = [], error: classStudentError } = await supabase
      .from('class_students')
      .select('class_id, student_id')
      .in('class_id', classIds)

    if (classStudentError) {
      console.error('Failed to load class student assignments', classStudentError)
    }

    classStudentRows = studentRows
  }

  const [teacherProfilesResult, studentProfilesResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, name, email')
      .eq('role', 'teacher')
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
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-slate-900">반 관리</h1>
        <p className="text-slate-600">
          승인된 교사와 학생을 기반으로 반을 생성하고 담당 교사·학생 배정을 관리할 수 있습니다.
        </p>
      </div>

      <ClassesManager
        classes={filteredClasses}
        teacherOptions={teacherOptions}
        studentOptions={studentOptions}
        searchTerm={searchValue}
      />
    </section>
  )
}

