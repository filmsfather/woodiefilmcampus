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
import { buildWeekHref, resolveWeekRange } from '@/lib/week-range'
import { WeekNavigator } from '@/components/dashboard/WeekNavigator'

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
  const supabase = createServerSupabase()
  const isPrincipal = profile.role === 'principal'
  const weekRange = resolveWeekRange(resolvedSearchParams.week ?? null)

  let classRows: RawPrincipalClassRow[] | RawClassRow[] | null = null

  if (isPrincipal) {
    const { data, error } = await supabase
      .from('classes')
      .select('id, name')
      .order('name', { ascending: true })

    if (error) {
      console.error('[principal] class review fetch error', error)
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

    if (isPrincipal) {
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

  const assignmentQuery = supabase
    .from('assignments')
    .select(
      `id, due_at, created_at, target_scope,
       assigned_by,
       assigned_teacher:profiles!assignments_assigned_by_fkey(id, name, email),
       workbooks(id, title, subject, type, week_label, config),
       assignment_targets(class_id, classes(id, name)),
       student_tasks(
       id,
       status,
        status_override,
        submitted_late,
        completion_at,
        updated_at,
        student_id,
          class_id,
         profiles!student_tasks_student_id_fkey(id, name, email, class_id),
         student_task_items(
           id,
           item_id,
           streak,
           next_review_at,
           completed_at,
           last_result,
           workbook_items(
             id,
             position,
             prompt,
             answer_type,
             explanation,
             workbook_item_short_fields(id, label, answer, position),
             workbook_item_choices(id, label, content, is_correct)
           )
         ),
           task_submissions(
            id,
            item_id,
            submission_type,
            content,
            media_asset_id,
            score,
            feedback,
            created_at,
            updated_at,
            task_submission_assets(
              media_asset:media_assets(id, bucket, path, mime_type, metadata)
            )
          )
       ),
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
    .order('due_at', { ascending: true })

  assignmentQuery
    .gte('due_at', DateUtil.toISOString(weekRange.start))
    .lt('due_at', DateUtil.toISOString(weekRange.endExclusive))

  if (!isPrincipal) {
    assignmentQuery.eq('assigned_by', profile.id)
  }

  const { data: rawAssignmentRows, error: assignmentError } = await assignmentQuery.returns<RawAssignmentRow[]>()

  if (assignmentError) {
    console.error('[teacher] class assignment fetch error', assignmentError)
  }

  const transformResults = (rawAssignmentRows ?? []).map(transformAssignmentRow)

  const combinedAssets = new Map<string, MediaAssetRecord>()
  transformResults.forEach(({ mediaAssets }) => {
    mediaAssets.forEach((value, key) => {
      combinedAssets.set(key, value)
    })
  })

  const signedMap = combinedAssets.size > 0 ? await createAssetSignedUrlMap(combinedAssets) : new Map()

  const detailedAssignments: AssignmentDetail[] = transformResults
    .map(({ assignment }) => applySignedAssetUrls(assignment, signedMap))
    .map((assignment) => filterAssignmentForClass(assignment, classInfo.id))
    .filter((assignment): assignment is AssignmentDetail => Boolean(assignment))

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
  const previousWeekHref = buildWeekHref(
    `/dashboard/teacher/review/${classInfo.id}`,
    resolvedSearchParams,
    weekRange.previousStart
  )
  const nextWeekHref = buildWeekHref(
    `/dashboard/teacher/review/${classInfo.id}`,
    resolvedSearchParams,
    weekRange.nextStart
  )

  return (
    <div className="space-y-4">
      <DashboardBackLink fallbackHref="/dashboard/teacher/review" label="반 개요로 돌아가기" />
      <div className="flex justify-center md:justify-start">
        <WeekNavigator
          label={weekRange.label}
          previousHref={previousWeekHref}
          nextHref={nextWeekHref}
          className="w-full max-w-xs md:w-auto"
        />
      </div>
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
