import type { Metadata } from 'next'

import AssignmentForm from '@/components/dashboard/assignments/AssignmentForm'
import DateUtil from '@/lib/date-util'
import { requireAuthForDashboard } from '@/lib/auth'
import { createClient as createServerSupabase } from '@/lib/supabase/server'
import type {
  AssignmentClassSummary,
  AssignmentStudentSummary,
  AssignmentWorkbookSummary,
} from '@/types/assignment'

export const metadata: Metadata = {
  title: '과제 출제 | Woodie Film Campus',
  description: '담당 반과 학생에게 문제집 기반 과제를 배정하세요.',
}

type WorkbookRow = {
  id: string
  title: string
  subject: string
  type: string
  week_label: string | null
  tags: string[] | null
  updated_at: string
  workbook_items: Array<{ count: number }>
}

type ClassTeacherRow = {
  class_id: string | null
  classes:
    | {
        id: string
        name: string
        description: string | null
      }
    | Array<{
        id: string
        name: string
        description: string | null
      }>
    | null
}

type ClassStudentRow = {
  class_id: string | null
  student_id: string | null
  profiles:
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
    | null
}

function compareStudents(a: AssignmentStudentSummary, b: AssignmentStudentSummary) {
  const left = (a.name ?? a.email ?? '').toLowerCase()
  const right = (b.name ?? b.email ?? '').toLowerCase()
  return left.localeCompare(right, 'ko')
}

function compareClasses(a: AssignmentClassSummary, b: AssignmentClassSummary) {
  return a.name.localeCompare(b.name, 'ko')
}

export default async function AssignmentCreatePage() {
  const { profile } = await requireAuthForDashboard('teacher')
  const supabase = createServerSupabase()

  DateUtil.clearServerClock()
  DateUtil.initServerClock()
  const serverNowIso = DateUtil.nowUTC().toISOString()

  if (!profile) {
    return null
  }

  const teacherId = profile.id
  const isPrincipal = profile.role === 'principal'

  const { data: workbookData, error: workbookError } = await supabase
    .from('workbooks')
    .select('id, title, subject, type, week_label, tags, updated_at, workbook_items(count)')
    .eq('teacher_id', teacherId)
    .order('updated_at', { ascending: false })

  if (workbookError) {
    console.error('[assignments/new] failed to load workbooks', workbookError)
  }

  const workbookRows = (workbookData ?? []) as WorkbookRow[]
  const workbookSummaries: AssignmentWorkbookSummary[] = workbookRows.map((row) => ({
    id: row.id,
    title: row.title,
    subject: row.subject,
    type: row.type,
    weekLabel: row.week_label ?? null,
    tags: Array.isArray(row.tags) ? row.tags.filter((tag): tag is string => typeof tag === 'string') : [],
    updatedAt: row.updated_at,
    itemCount: row.workbook_items?.[0]?.count ?? 0,
  }))

  const classInfoMap = new Map<string, { name: string; description: string | null }>()
  const classIdSet = new Set<string>()

  if (isPrincipal) {
    const { data: classRows, error: classesError } = await supabase
      .from('classes')
      .select('id, name, description')
      .order('name', { ascending: true })

    if (classesError) {
      console.error('[assignments/new] failed to load classes for principal', classesError)
    }

    classRows?.forEach((row) => {
      if (!row?.id) {
        return
      }
      classIdSet.add(row.id)
      if (!classInfoMap.has(row.id)) {
        classInfoMap.set(row.id, {
          name: row.name ?? '이름 미정',
          description: row.description ?? null,
        })
      }
    })
  } else {
    const { data: classTeacherData, error: classTeacherError } = await supabase
      .from('class_teachers')
      .select('class_id, classes(id, name, description)')
      .eq('teacher_id', teacherId)

    if (classTeacherError) {
      console.error('[assignments/new] failed to load class assignments', classTeacherError)
    }

    const classTeacherRows = (classTeacherData ?? []) as ClassTeacherRow[]
    for (const row of classTeacherRows) {
      const classRecord = Array.isArray(row.classes) ? row.classes[0] : row.classes
      const classId =
        typeof row.class_id === 'string' && row.class_id.length > 0 ? row.class_id : classRecord?.id
      if (!classId) {
        continue
      }
      classIdSet.add(classId)
      if (!classInfoMap.has(classId)) {
        classInfoMap.set(classId, {
          name: classRecord?.name ?? '이름 미정',
          description: classRecord?.description ?? null,
        })
      }
    }
  }

  const classIds = Array.from(classIdSet)

  let classStudentRows: ClassStudentRow[] = []
  if (classIds.length > 0) {
    const { data, error } = await supabase
      .from('class_students')
      .select('class_id, student_id, profiles!class_students_student_id_fkey(id, name, email)')
      .in('class_id', classIds)

    if (error) {
      console.error('[assignments/new] failed to load class students', error)
    } else if (data) {
      classStudentRows = data as ClassStudentRow[]
    }
  }

  const studentMap = new Map<string, AssignmentStudentSummary>()
  const classStudentsMap = new Map<string, AssignmentStudentSummary[]>()

  for (const row of classStudentRows) {
    if (!row.class_id) {
      continue
    }

    const studentProfile = row.profiles
    const profileRecord = Array.isArray(studentProfile) ? studentProfile[0] : studentProfile

    if (!profileRecord) {
      continue
    }

    if (!classInfoMap.has(row.class_id)) {
      classInfoMap.set(row.class_id, {
        name: '이름 미정',
        description: null,
      })
      classIdSet.add(row.class_id)
    }

    const classInfo = classInfoMap.get(row.class_id)
    const studentId =
      typeof row.student_id === 'string' && row.student_id.length > 0 ? row.student_id : profileRecord.id

    if (!studentId) {
      continue
    }
    const summary: AssignmentStudentSummary = {
      id: studentId,
      name: profileRecord.name,
      email: profileRecord.email,
      classId: row.class_id,
      className: classInfo?.name ?? null,
    }

    const existing = classStudentsMap.get(row.class_id) ?? []
    existing.push(summary)
    classStudentsMap.set(row.class_id, existing)

    if (!studentMap.has(summary.id)) {
      studentMap.set(summary.id, summary)
    }
  }

  const classSummaries: AssignmentClassSummary[] = Array.from(classIdSet)
    .map((classId) => {
      const classInfo = classInfoMap.get(classId)
      const studentsForClass = (classStudentsMap.get(classId) ?? []).slice().sort(compareStudents)
      return {
        id: classId,
        name: classInfo?.name ?? '이름 미정',
        description: classInfo?.description ?? null,
        studentCount: studentsForClass.length,
        students: studentsForClass,
      }
    })
    .sort(compareClasses)

  const students = Array.from(studentMap.values()).sort(compareStudents)

  const teacherName = profile.name ?? profile.email ?? null
  const showWorkbookHint = workbookSummaries.length === 0

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-slate-900">과제 출제</h1>
        <p className="text-sm text-slate-600">
          준비된 문제집을 선택하고 담당 반 또는 개별 학생에게 과제를 배정하세요.
        </p>
      </div>

      {showWorkbookHint && (
        <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          아직 생성한 문제집이 없습니다. 먼저 문제집을 만든 뒤 과제를 배정할 수 있습니다.
        </div>
      )}

      <AssignmentForm
        teacherName={teacherName}
        workbooks={workbookSummaries}
        classes={classSummaries}
        students={students}
        serverNowIso={serverNowIso}
      />
    </section>
  )
}
