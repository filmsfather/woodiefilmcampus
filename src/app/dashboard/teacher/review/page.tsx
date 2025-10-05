import { requireAuthForDashboard } from '@/lib/auth'
import DateUtil from '@/lib/date-util'
import { createClient as createServerSupabase } from '@/lib/supabase/server'
import { ClassOverviewGrid, ClassOverviewItem, ClassOverviewSummary } from '@/components/dashboard/teacher/ClassOverview'

interface RawTeacherClassRow {
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

interface RawPrincipalClassRow {
  id: string
  name: string | null
}

interface RawAssignmentRow {
  id: string
  due_at: string | null
  created_at: string
  target_scope: string | null
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
  }>
  print_requests?: Array<{
    id: string
    status: string
    student_task_id: string | null
    desired_date: string | null
    desired_period: string | null
    copies: number | null
    color_mode: string | null
    created_at: string
  }>
}

interface AssignmentSummary {
  id: string
  dueAt: string | null
  classes: Array<{ id: string; name: string }>
  studentTasks: Array<{
    id: string
    status: string
    studentId: string
    classId: string | null
  }>
  printRequests: Array<{
    id: string
    status: string
    studentTaskId: string | null
  }>
}

interface ManagedClass {
  id: string
  name: string
}

const UPCOMING_WINDOW_DAYS = 3

export default async function TeacherReviewOverviewPage() {
  const { profile } = await requireAuthForDashboard('teacher')
  const supabase = createServerSupabase()
  const isPrincipal = profile.role === 'principal'

  const classQuery = isPrincipal
    ? supabase
        .from('classes')
        .select('id, name')
        .order('name', { ascending: true })
    : supabase
        .from('class_teachers')
        .select('classes(id, name)')
        .eq('teacher_id', profile.id)

  const assignmentQuery = supabase
    .from('assignments')
    .select(
      `id, due_at, created_at, target_scope,
       assignment_targets(class_id, classes(id, name)),
       student_tasks(
         id,
         status,
         student_id,
         profiles!student_tasks_student_id_fkey(id, name, email, class_id)
       ),
       print_requests(id, status, student_task_id, created_at)
      `
    )
    .order('due_at', { ascending: true })

  if (!isPrincipal) {
    assignmentQuery.eq('assigned_by', profile.id)
  }

  const [{ data: classRows, error: classError }, { data: assignmentRows, error: assignmentError }] = await Promise.all([
    classQuery,
    assignmentQuery,
  ])

  if (classError) {
    console.error('[teacher] class overview fetch error', classError)
  }

  if (assignmentError) {
    console.error('[teacher] assignment overview fetch error', assignmentError)
  }

  const managedClasses: ManagedClass[] = isPrincipal
    ? ((classRows as RawPrincipalClassRow[] | null | undefined)?.map((row) =>
        row.id
          ? {
              id: row.id,
              name: row.name ?? '이름 미정',
            }
          : null
      )
        .filter((value): value is ManagedClass => Boolean(value)) ?? [])
    : ((classRows as RawTeacherClassRow[] | null | undefined)?.map((row) => {
        const cls = Array.isArray(row.classes) ? row.classes[0] : row.classes
        if (!cls?.id) {
          return null
        }
        return {
          id: cls.id,
          name: cls.name ?? '이름 미정',
        }
      })
        .filter((value): value is ManagedClass => Boolean(value)) ?? [])

  const assignments: AssignmentSummary[] = (assignmentRows as RawAssignmentRow[] | null | undefined)?.map((row) => {
    const classes = (row.assignment_targets ?? [])
      .map((target) => {
        const cls = Array.isArray(target.classes) ? target.classes[0] : target.classes
        if (!cls?.id) {
          return null
        }
        return {
          id: cls.id,
          name: cls.name ?? '이름 미정',
        }
      })
      .filter((value): value is { id: string; name: string } => Boolean(value))

    const studentTasks = (row.student_tasks ?? []).map((task) => {
      const profileRecord = Array.isArray(task.profiles) ? task.profiles[0] : task.profiles
      return {
        id: task.id,
        status: task.status,
        studentId: task.student_id,
        classId: profileRecord?.class_id ?? null,
      }
    })

    const printRequests = (row.print_requests ?? []).map((request) => ({
      id: request.id,
      status: request.status,
      studentTaskId: request.student_task_id,
    }))

    return {
      id: row.id,
      dueAt: row.due_at,
      classes,
      studentTasks,
      printRequests,
    }
  }) ?? []

  const now = DateUtil.nowUTC()
  const upcomingThreshold = DateUtil.addDays(now, UPCOMING_WINDOW_DAYS).getTime()

  const overviewItems: ClassOverviewItem[] = managedClasses.map((managedClass) => {
    let incompleteStudents = 0
    let overdueAssignments = 0
    let upcomingAssignments = 0
    let pendingPrintRequests = 0
    let nextDueAt: string | null = null

    assignments.forEach((assignment) => {
      const belongsToClass =
        assignment.classes.some((cls) => cls.id === managedClass.id) ||
        assignment.studentTasks.some((task) => task.classId === managedClass.id)

      if (!belongsToClass) {
        return
      }

      const classTasks = assignment.studentTasks.filter((task) => task.classId === managedClass.id)
      const outstandingTasks = classTasks.filter((task) => task.status !== 'completed' && task.status !== 'canceled')

      incompleteStudents += outstandingTasks.length

      if (assignment.dueAt) {
        const dueTime = new Date(assignment.dueAt).getTime()
        const isOverdue = dueTime < now.getTime() && outstandingTasks.length > 0
        const isUpcoming = dueTime >= now.getTime() && dueTime <= upcomingThreshold && outstandingTasks.length > 0

        if (isOverdue) {
          overdueAssignments += 1
        }

        if (isUpcoming) {
          upcomingAssignments += 1
        }

        if (outstandingTasks.length > 0) {
          if (!nextDueAt || dueTime < new Date(nextDueAt).getTime()) {
            nextDueAt = assignment.dueAt
          }
        }
      }

      if (assignment.printRequests.length > 0) {
        const classTaskIds = new Set(classTasks.map((task) => task.id))
        const pendingForClass = assignment.printRequests.filter((request) => {
          if (request.status !== 'requested') {
            return false
          }
          if (request.studentTaskId) {
            return classTaskIds.has(request.studentTaskId)
          }
          return assignment.classes.some((cls) => cls.id === managedClass.id)
        })
        pendingPrintRequests += pendingForClass.length
      }
    })

    const nextDueAtLabel = nextDueAt
      ? DateUtil.formatForDisplay(nextDueAt, {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : null

    return {
      id: managedClass.id,
      name: managedClass.name,
      incompleteStudents,
      overdueAssignments,
      pendingPrintRequests,
      upcomingAssignments,
      nextDueAtLabel,
    }
  })

  const overviewSummary: ClassOverviewSummary = overviewItems.reduce(
    (acc, item) => {
      acc.totalIncompleteStudents += item.incompleteStudents
      acc.totalOverdueAssignments += item.overdueAssignments
      acc.totalPendingPrintRequests += item.pendingPrintRequests
      acc.totalUpcomingAssignments += item.upcomingAssignments
      return acc
    },
    {
      totalIncompleteStudents: 0,
      totalOverdueAssignments: 0,
      totalPendingPrintRequests: 0,
      totalUpcomingAssignments: 0,
    }
  )

  return <ClassOverviewGrid summary={overviewSummary} items={overviewItems} />
}
