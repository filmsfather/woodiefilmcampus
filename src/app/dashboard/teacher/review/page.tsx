import { requireAuthForDashboard } from '@/lib/auth'
import { createClient as createServerSupabase } from '@/lib/supabase/server'
import { TeacherDashboard } from '@/components/dashboard/teacher/TeacherDashboard'

export default async function TeacherReviewDashboardPage() {
  const { profile } = await requireAuthForDashboard('teacher')
  const supabase = createServerSupabase()

  const [{ data: assignmentRows, error: assignmentError }, { data: classRows, error: classError }] =
    await Promise.all([
      supabase
        .from('assignments')
        .select(
          `id, due_at, created_at, target_scope,
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
           print_requests(id, status, student_task_id, desired_date, desired_period, copies, color_mode, created_at)
          `
        )
        .eq('assigned_by', profile.id)
        .order('due_at', { ascending: true }),
      supabase
        .from('class_teachers')
        .select('class_id, classes(id, name)')
        .eq('teacher_id', profile.id),
    ])

  if (assignmentError) {
    console.error('[teacher] review assignments error', assignmentError)
  }

  if (classError) {
    console.error('[teacher] review class error', classError)
  }

  const assignments = (assignmentRows ?? []).map((row) => {
    const workbook = Array.isArray(row.workbooks) ? row.workbooks[0] : row.workbooks
    const classTargets = (row.assignment_targets ?? [])
      .map((target) => {
        const cls = Array.isArray(target.classes) ? target.classes[0] : target.classes
        return cls?.id
          ? {
              id: cls.id,
              name: cls.name ?? '이름 미정',
            }
          : null
      })
      .filter((value): value is { id: string; name: string } => Boolean(value))

    const studentTasks = (row.student_tasks ?? []).map((task) => {
      const studentProfile = Array.isArray(task.profiles) ? task.profiles[0] : task.profiles
      const completedCount = task.student_task_items?.filter((item) => item.completed_at).length ?? 0
      const totalItems = task.student_task_items?.length ?? 0

      return {
        id: task.id,
        status: task.status,
        completionAt: task.completion_at,
        updatedAt: task.updated_at,
        studentId: task.student_id,
        student: {
          id: studentProfile?.id ?? task.student_id,
          name: studentProfile?.name ?? '이름 미정',
          email: studentProfile?.email ?? null,
          classId: studentProfile?.class_id ?? null,
        },
        completedCount,
        totalItems,
      }
    })

    return {
      id: row.id,
      dueAt: row.due_at,
      createdAt: row.created_at,
      targetScope: row.target_scope,
      title: workbook?.title ?? '제목 미정',
      subject: workbook?.subject ?? '기타',
      type: workbook?.type ?? 'unknown',
      weekLabel: workbook?.week_label ?? null,
      classes: classTargets,
      studentTasks,
      printRequests: (row.print_requests ?? []).map((request) => ({
        id: request.id,
        status: request.status,
        studentTaskId: request.student_task_id,
        desiredDate: request.desired_date,
        desiredPeriod: request.desired_period,
        copies: request.copies ?? 1,
        colorMode: request.color_mode ?? 'bw',
        createdAt: request.created_at,
      })),
    }
  })

  const managedClasses = (classRows ?? [])
    .map((row) => {
      const cls = Array.isArray(row.classes) ? row.classes[0] : row.classes
      if (!cls?.id) {
        return null
      }
      return { id: cls.id, name: cls.name ?? '이름 미정' }
    })
    .filter((value): value is { id: string; name: string } => Boolean(value))

  const subjects = Array.from(new Set(assignments.map((assignment) => assignment.subject))).sort(
    (a, b) => a.localeCompare(b, 'ko')
  )
  const workbookTypes = Array.from(new Set(assignments.map((assignment) => assignment.type))).sort(
    (a, b) => a.localeCompare(b)
  )

  return (
    <TeacherDashboard
      teacherName={profile.name ?? profile.email ?? null}
      assignments={assignments}
      classes={managedClasses}
      subjects={subjects}
      workbookTypes={workbookTypes}
    />
  )
}
