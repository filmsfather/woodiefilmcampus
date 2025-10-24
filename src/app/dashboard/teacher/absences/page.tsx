import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { AbsenceManagerClient, type ClassWithStudents } from '@/components/dashboard/absences/AbsenceManagerClient'
import { WeekNavigator } from '@/components/dashboard/WeekNavigator'
import { createAbsenceReport, deleteAbsenceReport, updateAbsenceReport } from '@/app/dashboard/absences/actions'
import { requireAuthForDashboard } from '@/lib/auth'
import DateUtil from '@/lib/date-util'
import { createClient as createServerSupabase } from '@/lib/supabase/server'
import { buildWeekHref, resolveWeekRange } from '@/lib/week-range'
import { mapAbsenceReportRow, sortAbsenceReports, type AbsenceReportRow } from '@/lib/absences'

interface ClassTeacherRow {
  class_id: string | null
  classes?:
    | {
        id: string | null
        name: string | null
      }
    | Array<{
        id: string | null
        name: string | null
      }>
}

interface ClassStudentRow {
  class_id: string | null
  student_id: string | null
  profiles?:
    | {
        id: string
        name: string | null
        email: string | null
      }
    | Array<{
        id: string
        name: string | null
        email: string | null
      }>
}

export default async function TeacherAbsencesPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>
}) {
  const { profile } = await requireAuthForDashboard('teacher')
  const supabase = createServerSupabase()
  const weekRange = resolveWeekRange(searchParams?.week ?? null)
  const weekStart = DateUtil.formatISODate(weekRange.start)
  const weekEndExclusive = DateUtil.formatISODate(weekRange.endExclusive)
  const previousHref = buildWeekHref('/dashboard/teacher/absences', searchParams ?? {}, weekRange.previousStart)
  const nextHref = buildWeekHref('/dashboard/teacher/absences', searchParams ?? {}, weekRange.nextStart)

  const { data: classRows, error: classError } = await supabase
    .from('class_teachers')
    .select('class_id, classes(id, name)')
    .eq('teacher_id', profile.id)

  if (classError) {
    console.error('[teacher-absences] failed to load classes', classError)
  }

  const managedClasses = (classRows ?? [])
    .map((row: ClassTeacherRow) => {
      const classRecord = Array.isArray(row.classes) ? row.classes[0] : row.classes
      if (!row.class_id || !classRecord?.id) {
        return null
      }
      return {
        id: classRecord.id,
        name: classRecord.name ?? '이름 미정',
      }
    })
    .filter((value): value is { id: string; name: string } => Boolean(value))

  const classIds = managedClasses.map((cls) => cls.id)

  let studentsByClass = new Map<string, ClassWithStudents['students']>()

  if (classIds.length > 0) {
    const { data: studentRows, error: studentError } = await supabase
      .from('class_students')
      .select('class_id, student_id, profiles:profiles!class_students_student_id_fkey(id, name, email)')
      .in('class_id', classIds)

    if (studentError) {
      console.error('[teacher-absences] failed to load students', studentError)
    }

    const map = new Map<string, ClassWithStudents['students']>()

    for (const row of (studentRows ?? []) as ClassStudentRow[]) {
      if (!row.class_id || !row.student_id) {
        continue
      }
      const profileRecord = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles
      if (!profileRecord) {
        continue
      }
      const students = map.get(row.class_id) ?? []
      students.push({
        id: profileRecord.id,
        name: profileRecord.name ?? null,
        email: profileRecord.email ?? null,
      })
      map.set(row.class_id, students)
    }

    for (const [classId, students] of map) {
      students.sort((a, b) => {
        const left = (a.name ?? a.email ?? '').toLowerCase()
        const right = (b.name ?? b.email ?? '').toLowerCase()
        return left.localeCompare(right, 'ko')
      })
      map.set(classId, students)
    }

    studentsByClass = map
  }

  let reportRows: AbsenceReportRow[] = []

  if (classIds.length > 0) {
    const { data, error: reportError } = await supabase
      .from('absence_reports')
      .select(
        `id,
         class_id,
         student_id,
         absence_date,
         reason_type,
         detail_reason,
         teacher_action,
         manager_action,
         created_by,
         created_at,
         updated_at,
         classes:classes(id, name),
         students:profiles!absence_reports_student_id_fkey(id, name, email),
         created_by_profile:profiles!absence_reports_created_by_fkey(id, name, email, role)`
      )
      .in('class_id', classIds)
      .gte('absence_date', weekStart)
      .lt('absence_date', weekEndExclusive)
      .order('absence_date', { ascending: true })
      .order('class_id', { ascending: true })

    if (reportError) {
      console.error('[teacher-absences] failed to load reports', reportError)
    }

    reportRows = (data as AbsenceReportRow[] | null | undefined) ?? []
  }

  const classesWithStudents: ClassWithStudents[] = managedClasses.map((cls) => ({
    id: cls.id,
    name: cls.name,
    students: studentsByClass.get(cls.id) ?? [],
  }))

  const reports = sortAbsenceReports(reportRows.map(mapAbsenceReportRow))

  return (
    <section className="space-y-6">
      <DashboardBackLink fallbackHref="/dashboard/teacher" label="교사 대시보드로 돌아가기" />

      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-slate-900">결석계 관리</h1>
          <p className="text-sm text-slate-600">담당 반의 결석계를 작성하고 주간 현황을 확인하세요.</p>
        </div>
        <WeekNavigator label={weekRange.label} previousHref={previousHref} nextHref={nextHref} />
      </div>

      <AbsenceManagerClient
        role="teacher"
        classes={classesWithStudents}
        reports={reports}
        onCreate={createAbsenceReport}
        onUpdate={updateAbsenceReport}
        onDelete={deleteAbsenceReport}
      />
    </section>
  )
}
