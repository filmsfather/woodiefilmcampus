import { notFound } from 'next/navigation'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { requireAuthForDashboard } from '@/lib/auth'
import DateUtil from '@/lib/date-util'
import { createClient as createServerSupabase } from '@/lib/supabase/server'
import { ClassDashboard } from '@/components/dashboard/teacher/ClassDashboard'
import { createAssetSignedUrlMap } from '@/lib/assignment-assets'
import {
  transformAssignmentRow,
  applySignedAssetUrls,
  filterAssignmentForClass,
  computeAssignmentSummary,
  type AssignmentDetail,
  type RawAssignmentRow,
  type MediaAssetRecord,
} from '@/lib/assignment-evaluation'

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

interface ClassAssignmentSummary {
  id: string
  title: string
  subject: string
  type: string
  weekLabel: string | null
  publishedAt: string | null
  dueAt: string | null
  totalStudents: number
  completedStudents: number
  outstandingStudents: number
  completionRate: number
  hasPendingPrint: boolean
  detail: AssignmentDetail
  assignedBy: {
    id: string
    name: string | null
    email: string | null
  } | null
}

interface ClassSummary {
  incompleteStudents: number
  overdueAssignments: number
  pendingPrintRequests: number
  upcomingAssignments: number
  nextDueAtLabel: string | null
}

const UPCOMING_WINDOW_DAYS = 3
const RECENT_DAYS = 30

interface RawPrincipalClassRow {
  id: string
  name: string | null
}

interface ManagedClass {
  id: string
  name: string
}

export default async function TeacherClassReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ classId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { profile } = await requireAuthForDashboard(['teacher', 'manager'])
  const { classId } = await params
  const resolvedSearchParams = await searchParams
  const supabase = await createServerSupabase()
  const canSeeAllClasses = profile.role === 'principal' || profile.role === 'manager'

  let classRows: RawPrincipalClassRow[] | RawClassRow[] | null = null

  if (canSeeAllClasses) {
    const { data, error } = await supabase
      .from('classes')
      .select('id, name')
      .order('name', { ascending: true })

    if (error) {
      console.error('[principal/manager] class review fetch error', error)
    }

    classRows = data ?? null
  } else {
    const { data, error } = await supabase
      .from('class_teachers')
      .select('class_id, classes(id, name)')
      .eq('teacher_id', profile.id)

    if (error) {
      console.error('[teacher] class review fetch error', error)
    }

    classRows = (data as RawClassRow[] | null) ?? null
  }

  const managedClasses: ManagedClass[] = (() => {
    if (!classRows) {
      return []
    }

    if (canSeeAllClasses) {
      return (classRows as RawPrincipalClassRow[]).reduce<ManagedClass[]>((acc, row) => {
        if (!row.id) {
          return acc
        }
        acc.push({ id: row.id, name: row.name ?? '이름 미정' })
        return acc
      }, [])
    }

    const unique = new Map<string, ManagedClass>()
      ; (classRows as RawClassRow[]).forEach((row) => {
        const cls = Array.isArray(row.classes) ? row.classes[0] : row.classes
        const id = cls?.id ?? row.class_id
        if (!id) {
          return
        }
        const name = cls?.name ?? '이름 미정'
        if (!unique.has(id)) {
          unique.set(id, { id, name })
        }
      })
    return Array.from(unique.values()).sort((a, b) => a.name.localeCompare(b.name))
  })()

  const classInfo = managedClasses.find((cls) => cls.id === classId)

  if (!classInfo) {
    notFound()
  }

  const thirtyDaysAgo = DateUtil.addDays(DateUtil.nowUTC(), -RECENT_DAYS)

  // Query 1: 과제 메타 + workbook_items (한 번만 로드)
  const assignmentMetaQuery = supabase
    .from('assignments')
    .select(
      `id, due_at, published_at, created_at, target_scope,
       assigned_by,
       assigned_teacher:profiles!assignments_assigned_by_fkey(id, name, email),
       workbooks(id, title, subject, type, week_label, config,
         workbook_items(id, position, prompt, answer_type, explanation,
           workbook_item_short_fields(id, label, answer, position),
           workbook_item_choices(id, label, content, is_correct)
         )
       ),
       assignment_targets!inner(class_id, classes(id, name)),
       print_requests(
         id,
         status,
         student_task_id,
         desired_date,
         desired_period,
         copies,
         color_mode,
         notes,
         bundle_mode,
         bundle_status,
         compiled_asset_id,
         bundle_ready_at,
         bundle_error,
         created_at,
         updated_at,
         print_request_items(id, student_task_id, submission_id, media_asset_id, asset_filename, asset_metadata)
       )
      `
    )
    .eq('assignment_targets.class_id', classId)
    .order('due_at', { ascending: false })
    .gte('due_at', DateUtil.toISOString(thirtyDaysAgo))

  const { data: assignmentMetaRows, error: assignmentMetaError } = await assignmentMetaQuery

  if (assignmentMetaError) {
    console.error('[teacher] class assignment meta fetch error', assignmentMetaError)
  }

  const assignmentIds = (assignmentMetaRows ?? []).map((r: { id: string }) => r.id)

  // workbook_items 룩업 맵 구축 (item_id → workbook_item)
  type WbItem = Record<string, unknown>
  const workbookItemMap = new Map<string, WbItem>()
  for (const row of (assignmentMetaRows ?? []) as Array<Record<string, unknown>>) {
    const wb = Array.isArray(row.workbooks) ? row.workbooks[0] : row.workbooks
    if (wb && typeof wb === 'object' && 'workbook_items' in (wb as Record<string, unknown>)) {
      const items = ((wb as Record<string, unknown>).workbook_items ?? []) as WbItem[]
      for (const item of items) {
        if (item.id) workbookItemMap.set(item.id as string, item)
      }
    }
  }

  // Query 2a/2b: student_tasks를 두 병렬 쿼리로 분할
  let studentTaskRows: Array<Record<string, unknown>> = []
  let taskError: { message: string; code: string } | null = null

  if (assignmentIds.length > 0) {
    const baseFilter = { assignmentIds, classId }

    // Q2a: 과제 상태 + 아이템 (제출물 제외)
    const q2a = supabase
      .from('student_tasks')
      .select(
        `id, assignment_id, status, status_override, submitted_late,
         completion_at, updated_at, student_id, class_id,
         profiles!student_tasks_student_id_fkey(id, name, email, class_id),
         student_task_items(id, item_id, streak, next_review_at, completed_at, last_result)`
      )
      .in('assignment_id', baseFilter.assignmentIds)
      .eq('class_id', baseFilter.classId)

    // Q2b: 제출물 + 에셋 (상태/아이템 제외)
    const q2b = supabase
      .from('student_tasks')
      .select(
        `id,
         task_submissions(
           id, item_id, submission_type, content, media_asset_id,
           score, feedback, created_at, updated_at,
           task_submission_assets(
             media_asset:media_assets(id, bucket, path, mime_type, metadata)
           )
         )`
      )
      .in('assignment_id', baseFilter.assignmentIds)
      .eq('class_id', baseFilter.classId)

    const [result2a, result2b] = await Promise.all([q2a, q2b])

    if (result2a.error) {
      taskError = result2a.error as { message: string; code: string }
    }
    if (result2b.error) {
      taskError = taskError ?? (result2b.error as { message: string; code: string })
    }

    // Q2b 결과를 task id → submissions 맵으로 변환
    const submissionsByTaskId = new Map<string, unknown[]>()
    for (const row of (result2b.data ?? []) as Array<Record<string, unknown>>) {
      if (row.id && row.task_submissions) {
        submissionsByTaskId.set(row.id as string, row.task_submissions as unknown[])
      }
    }

    // Q2a + Q2b 병합
    studentTaskRows = ((result2a.data ?? []) as Array<Record<string, unknown>>).map((task) => ({
      ...task,
      task_submissions: submissionsByTaskId.get(task.id as string) ?? [],
    }))
  }

  if (taskError) {
    console.error('[teacher] student tasks fetch error', taskError)
  }

  // student_task_items에 workbook_items 주입 (Q1에서 가져온 데이터)
  for (const task of studentTaskRows) {
    const items = (task.student_task_items ?? []) as Array<Record<string, unknown>>
    for (const item of items) {
      const wbItem = workbookItemMap.get(item.item_id as string)
      if (wbItem) item.workbook_items = wbItem
    }
  }

  // 쿼리 결과를 RawAssignmentRow 형태로 병합
  const tasksByAssignment = new Map<string, Array<Record<string, unknown>>>()
  for (const task of studentTaskRows) {
    const aId = task.assignment_id as string
    if (!tasksByAssignment.has(aId)) tasksByAssignment.set(aId, [])
    tasksByAssignment.get(aId)!.push(task)
  }

  const rawAssignmentRows: RawAssignmentRow[] = (assignmentMetaRows ?? []).map(
    (row: Record<string, unknown>) => ({
      ...row,
      student_tasks: tasksByAssignment.get(row.id as string) ?? [],
    })
  ) as unknown as RawAssignmentRow[]

  const assignmentError = assignmentMetaError || taskError

  const transformResults = (rawAssignmentRows ?? []).map(transformAssignmentRow)

  const filteredTransforms = transformResults
    .map(({ assignment, mediaAssets }) => {
      const filtered = filterAssignmentForClass(assignment, classInfo.id)
      return filtered ? { assignment: filtered, mediaAssets } : null
    })
    .filter((r): r is { assignment: AssignmentDetail; mediaAssets: Map<string, MediaAssetRecord> } => Boolean(r))

  const neededAssetIds = new Set<string>()
  filteredTransforms.forEach(({ assignment }) => {
    assignment.studentTasks.forEach((task) => {
      task.submissions.forEach((sub) => {
        if (sub.mediaAssetId) neededAssetIds.add(sub.mediaAssetId)
        sub._tempAssetIds?.forEach((id) => neededAssetIds.add(id))
      })
    })
  })

  const combinedAssets = new Map<string, MediaAssetRecord>()
  filteredTransforms.forEach(({ mediaAssets }) => {
    mediaAssets.forEach((value, key) => {
      if (neededAssetIds.has(key)) {
        combinedAssets.set(key, value)
      }
    })
  })

  const signedMap = combinedAssets.size > 0 ? await createAssetSignedUrlMap(combinedAssets) : new Map()

  const detailedAssignments: AssignmentDetail[] = filteredTransforms
    .map(({ assignment }) => applySignedAssetUrls(assignment, signedMap))

  const assignments: ClassAssignmentSummary[] = detailedAssignments.map(mapAssignmentForClass)

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

      acc.pendingPrintRequests += assignment.detail.printRequests.filter((request) => request.status === 'requested').length

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

  const initialAssignmentId = typeof resolvedSearchParams.assignment === 'string' ? resolvedSearchParams.assignment : null

  return (
    <div className="space-y-4">
      <DashboardBackLink fallbackHref="/dashboard/teacher/review" label="반 개요로 돌아가기" />
      <ClassDashboard
        classId={classInfo.id}
        className={classInfo.name}
        managedClasses={managedClasses}
        teacherName={profile.name ?? profile.email ?? null}
        assignments={assignments}
        summary={summary}
        initialAssignmentId={initialAssignmentId}
      />
    </div>
  )
}

function mapAssignmentForClass(assignment: AssignmentDetail): ClassAssignmentSummary {
  const summary = computeAssignmentSummary(assignment)
  return {
    id: assignment.id,
    title: assignment.title,
    subject: assignment.subject,
    type: assignment.type,
    weekLabel: assignment.weekLabel,
    publishedAt: assignment.publishedAt,
    dueAt: assignment.dueAt,
    totalStudents: summary.totalStudents,
    completedStudents: summary.completedStudents,
    outstandingStudents: summary.outstandingStudents,
    completionRate: summary.completionRate,
    hasPendingPrint: assignment.printRequests.some((request) => request.status === 'requested'),
    detail: assignment,
    assignedBy: assignment.assignedBy,
  }
}
