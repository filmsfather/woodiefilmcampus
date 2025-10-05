import { notFound } from 'next/navigation'

import { requireAuthForDashboard } from '@/lib/auth'
import DateUtil from '@/lib/date-util'
import { createClient as createServerSupabase } from '@/lib/supabase/server'
import { ClassDashboard } from '@/components/dashboard/teacher/ClassDashboard'

interface RawClassRow {
  class_id: string
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

interface RawAssignmentRow {
  id: string
  due_at: string | null
  created_at: string
  workbooks?:
    | {
        id: string
        title: string | null
        subject: string | null
        type: string | null
        week_label: string | null
      }
    | Array<{
        id: string
        title: string | null
        subject: string | null
        type: string | null
        week_label: string | null
      }>
  assignment_targets?: Array<{
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
  }>
  student_tasks?: Array<{
    id: string
    status: string
    completion_at: string | null
    updated_at: string
    student_id: string
    profiles?:
      | {
          id: string
          name: string | null
          email: string | null
          class_id: string | null
        }
      | Array<{
          id: string
          name: string | null
          email: string | null
          class_id: string | null
        }>
    student_task_items?: Array<{
      id: string
      completed_at: string | null
    }>
  }>
  print_requests?: Array<{
    id: string
    status: string
    student_task_id: string | null
    desired_date: string | null
    desired_period: string | null
    copies: number | null
    color_mode: string | null
    notes: string | null
    created_at: string
  }>
}

interface AssignmentForClass {
  id: string
  title: string
  subject: string
  type: string
  weekLabel: string | null
  dueAt: string | null
  totalStudents: number
  completedStudents: number
  outstandingStudents: number
  completionRate: number
  hasPendingPrint: boolean
  studentTasks: Array<{
    id: string
    status: string
    completionAt: string | null
    updatedAt: string
    student: {
      id: string
      name: string
      email: string | null
    }
    completedCount: number
    totalItems: number
    remainingCount: number
  }>
  printRequests: Array<{
    id: string
    status: string
    desiredDate: string | null
    desiredPeriod: string | null
    copies: number
    colorMode: string
    notes: string | null
    createdAt: string
  }>
}

interface ClassSummary {
  incompleteStudents: number
  overdueAssignments: number
  pendingPrintRequests: number
  upcomingAssignments: number
  nextDueAtLabel: string | null
}

const UPCOMING_WINDOW_DAYS = 3

export default async function TeacherClassReviewPage({
  params,
  searchParams,
}: {
  params: { classId: string }
  searchParams: Record<string, string | string[] | undefined>
}) {
  const { profile } = await requireAuthForDashboard('teacher')
  const supabase = createServerSupabase()
  const isPrincipal = profile.role === 'principal'

  let classInfo: { id: string; name: string } | null = null

  if (isPrincipal) {
    const { data: classRow, error: principalClassError } = await supabase
      .from('classes')
      .select('id, name')
      .eq('id', params.classId)
      .maybeSingle()

    if (principalClassError) {
      console.error('[principal] class review fetch error', principalClassError)
    }

    if (classRow?.id) {
      classInfo = {
        id: classRow.id,
        name: classRow.name ?? '이름 미정',
      }
    }
  } else {
    const { data: classRecord, error: classError } = await supabase
      .from('class_teachers')
      .select('class_id, classes(id, name)')
      .eq('teacher_id', profile.id)
      .eq('class_id', params.classId)
      .maybeSingle<RawClassRow>()

    if (classError) {
      console.error('[teacher] class review fetch error', classError)
    }

    if (classRecord) {
      const cls = Array.isArray(classRecord.classes) ? classRecord.classes[0] : classRecord.classes
      if (cls?.id) {
        classInfo = {
          id: cls.id,
          name: cls.name ?? '이름 미정',
        }
      }
    }
  }

  if (!classInfo) {
    notFound()
  }

  const assignmentQuery = supabase
    .from('assignments')
    .select(
      `id, due_at, created_at,
       workbooks(id, title, subject, type, week_label),
       assignment_targets(class_id, classes(id, name)),
       student_tasks(
         id,
         status,
         completion_at,
         updated_at,
         student_id,
         profiles!student_tasks_student_id_fkey(id, name, email, class_id),
         student_task_items(id, completed_at)
       ),
       print_requests(id, status, student_task_id, desired_date, desired_period, copies, color_mode, notes, created_at)
      `
    )
    .order('due_at', { ascending: true })

  if (!isPrincipal) {
    assignmentQuery.eq('assigned_by', profile.id)
  }

  const { data: assignmentRows, error: assignmentError } = await assignmentQuery.returns<RawAssignmentRow[]>()

  if (assignmentError) {
    console.error('[teacher] class assignment fetch error', assignmentError)
  }

  const assignments: AssignmentForClass[] = (assignmentRows ?? [])
    .map((row) => {
      const workbook = Array.isArray(row.workbooks) ? row.workbooks[0] : row.workbooks
      const targetClassIds = new Set(
        (row.assignment_targets ?? [])
          .map((target) => {
            const explicitId = target.class_id ?? null
            if (explicitId) {
              return explicitId
            }
            const cls = Array.isArray(target.classes) ? target.classes[0] : target.classes
            return cls?.id ?? null
          })
          .filter((value): value is string => Boolean(value))
      )
      const studentTasks = (row.student_tasks ?? []).map((task) => {
        const profileRecord = Array.isArray(task.profiles) ? task.profiles[0] : task.profiles
        const items = task.student_task_items ?? []
        const completedCount = items.filter((item) => Boolean(item.completed_at)).length
        const totalItems = items.length
        return {
          id: task.id,
          status: task.status,
          completionAt: task.completion_at,
          updatedAt: task.updated_at,
          student: {
            id: profileRecord?.id ?? task.student_id,
            name: profileRecord?.name ?? '이름 미정',
            email: profileRecord?.email ?? null,
          },
          classId: profileRecord?.class_id ?? null,
          completedCount,
          totalItems,
          remainingCount: Math.max(totalItems - completedCount, 0),
        }
      })

      const classTasks = studentTasks.filter((task) => {
        if (task.classId) {
          return task.classId === classInfo.id
        }
        return targetClassIds.has(classInfo.id)
      })

      if (
        classTasks.length === 0 &&
        !targetClassIds.has(classInfo.id)
      ) {
        return null
      }

      const totalStudents = classTasks.length
      const completedStudents = classTasks.filter((task) => task.status === 'completed').length
      const outstandingStudents = classTasks.filter((task) => task.status !== 'completed' && task.status !== 'canceled').length
      const completionRate = totalStudents === 0 ? 0 : Math.round((completedStudents / totalStudents) * 100)

      const printRequests = (row.print_requests ?? [])
        .filter((request) => {
          if (request.student_task_id) {
            return classTasks.some((task) => task.id === request.student_task_id)
          }
          return (row.assignment_targets ?? []).some((target) => target.class_id === classInfo.id)
        })
        .map((request) => ({
          id: request.id,
          status: request.status,
          desiredDate: request.desired_date,
          desiredPeriod: request.desired_period,
          copies: request.copies ?? 1,
          colorMode: request.color_mode ?? 'bw',
          notes: request.notes ?? null,
          createdAt: request.created_at,
        }))

      return {
        id: row.id,
        title: workbook?.title ?? '제목 미정',
        subject: workbook?.subject ?? '기타',
        type: workbook?.type ?? 'unknown',
        weekLabel: workbook?.week_label ?? null,
        dueAt: row.due_at,
        totalStudents,
        completedStudents,
        outstandingStudents,
        completionRate,
        hasPendingPrint: printRequests.some((request) => request.status === 'requested'),
        studentTasks: classTasks.map((task) => ({
          id: task.id,
          status: task.status,
          completionAt: task.completionAt,
          updatedAt: task.updatedAt,
          student: task.student,
          completedCount: task.completedCount,
          totalItems: task.totalItems,
          remainingCount: task.remainingCount,
        })),
        printRequests,
      }
    })
    .filter((value): value is AssignmentForClass => Boolean(value))

  const now = DateUtil.nowUTC()
  const upcomingThreshold = DateUtil.addDays(now, UPCOMING_WINDOW_DAYS).getTime()

  const summary: ClassSummary = assignments.reduce(
    (acc, assignment) => {
      const dueTime = assignment.dueAt ? new Date(assignment.dueAt).getTime() : null
      if (assignment.outstandingStudents > 0) {
        acc.incompleteStudents += assignment.outstandingStudents
      }

      const hasOutstanding = assignment.outstandingStudents > 0
      if (hasOutstanding && typeof dueTime === 'number') {
        if (dueTime < now.getTime()) {
          acc.overdueAssignments += 1
        } else if (dueTime >= now.getTime() && dueTime <= upcomingThreshold) {
          acc.upcomingAssignments += 1
        }

        if (!acc.nextDueAtLabel || dueTime < new Date(acc.nextDueAtLabel).getTime()) {
          acc.nextDueAtLabel = assignment.dueAt
        }
      }

      acc.pendingPrintRequests += assignment.printRequests.filter((request) => request.status === 'requested').length

      return acc
    },
    {
      incompleteStudents: 0,
      overdueAssignments: 0,
      pendingPrintRequests: 0,
      upcomingAssignments: 0,
      nextDueAtLabel: null as string | null,
    }
  )

  summary.nextDueAtLabel = summary.nextDueAtLabel
    ? DateUtil.formatForDisplay(summary.nextDueAtLabel, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null

  const initialAssignmentId = typeof searchParams.assignment === 'string' ? searchParams.assignment : null

  return (
    <ClassDashboard
      classId={classInfo.id}
      className={classInfo.name}
      assignments={assignments}
      summary={summary}
      initialAssignmentId={initialAssignmentId}
    />
  )
}
