import DateUtil from '@/lib/date-util'

export interface RawAssignmentRow {
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
        config?: Record<string, unknown> | null
      }
    | Array<{
        id: string
        title: string | null
        subject: string | null
        type: string | null
        week_label: string | null
        config?: Record<string, unknown> | null
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
      item_id: string | null
      streak?: number | null
      next_review_at?: string | null
      completed_at: string | null
      last_result?: string | null
      workbook_items?:
        | {
            id: string
            position: number
            prompt: string
            answer_type: string
            explanation: string | null
            workbook_item_short_fields?: Array<{
              id: string
              label: string | null
              answer: string
              position?: number | null
            }>
            workbook_item_choices?: Array<{
              id: string
              label: string | null
              content: string
              is_correct: boolean | null
            }>
          }
        | Array<{
            id: string
            position: number
            prompt: string
            answer_type: string
            explanation: string | null
            workbook_item_short_fields?: Array<{
              id: string
              label: string | null
              answer: string
              position?: number | null
            }>
            workbook_item_choices?: Array<{
              id: string
              label: string | null
              content: string
              is_correct: boolean | null
            }>
          }>
    }>
    task_submissions?: Array<{
      id: string
      item_id: string | null
      submission_type: string
      content: string | null
      media_asset_id: string | null
      score: string | null
      feedback: string | null
      created_at: string
      updated_at: string
      media_assets?:
        | {
            id: string
            bucket: string | null
            path: string
            mime_type: string | null
            metadata: Record<string, unknown> | null
          }
        | Array<{
            id: string
            bucket: string | null
            path: string
            mime_type: string | null
            metadata: Record<string, unknown> | null
          }>
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
    updated_at?: string | null
    bundle_mode: string | null
    bundle_status: string | null
    compiled_asset_id: string | null
    bundle_ready_at: string | null
    bundle_error: string | null
    print_request_items?: Array<{
      id: string
      student_task_id: string
      submission_id: string | null
      media_asset_id: string | null
      asset_filename: string | null
      asset_metadata: Record<string, unknown> | null
    }>
  }>
}

export interface WorkbookItemSummary {
  id: string
  position: number
  prompt: string
  answerType: string
  explanation: string | null
  shortFields: Array<{ id: string; label: string | null; answer: string; position: number }>
  choices: Array<{ id: string; label: string | null; content: string; isCorrect: boolean }>
}

export interface StudentTaskItemSummary {
  id: string
  itemId: string | null
  streak: number | null
  nextReviewAt: string | null
  completedAt: string | null
  lastResult: string | null
  workbookItem: WorkbookItemSummary | null
}

export interface SubmissionSummary {
  id: string
  itemId: string | null
  submissionType: string
  content: string | null
  mediaAssetId: string | null
  score: string | null
  feedback: string | null
  createdAt: string
  updatedAt: string
  asset: { url: string; filename: string; mimeType: string | null } | null
}

export interface StudentTaskSummary {
  id: string
  status: string
  completionAt: string | null
  updatedAt: string
  studentId: string
  student: {
    id: string
    name: string
    email: string | null
    classId: string | null
  }
  items: StudentTaskItemSummary[]
  submissions: SubmissionSummary[]
}

export interface PrintRequestItemSummary {
  id: string
  studentTaskId: string
  submissionId: string | null
  mediaAssetId: string | null
  assetFilename: string | null
  assetMetadata: Record<string, unknown> | null
}

export interface PrintRequestSummary {
  id: string
  status: string
  bundleMode: 'merged' | 'separate'
  bundleStatus: string
  compiledAssetId: string | null
  bundleReadyAt: string | null
  bundleError: string | null
  studentTaskId: string | null
  studentTaskIds: string[]
  desiredDate: string | null
  desiredPeriod: string | null
  copies: number
  colorMode: string
  notes: string | null
  createdAt: string
  updatedAt: string | null
  items: PrintRequestItemSummary[]
}

export interface AssignmentDetail {
  id: string
  dueAt: string | null
  createdAt: string
  targetScope: string | null
  title: string
  subject: string
  type: string
  weekLabel: string | null
  config: Record<string, unknown> | null
  classes: Array<{ id: string; name: string }>
  studentTasks: StudentTaskSummary[]
  printRequests: PrintRequestSummary[]
}

export interface MediaAssetRecord {
  bucket: string
  path: string
  mimeType: string | null
  metadata: Record<string, unknown> | null
}

export interface AssignmentTransformResult {
  assignment: AssignmentDetail
  mediaAssets: Map<string, MediaAssetRecord>
}

function normalizeWorkbook(row: RawAssignmentRow['workbooks']): {
  title: string
  subject: string
  type: string
  weekLabel: string | null
  config: Record<string, unknown> | null
} | null {
  const workbook = Array.isArray(row) ? row[0] : row
  if (!workbook) {
    return null
  }
  return {
    title: workbook.title ?? '제목 미정',
    subject: workbook.subject ?? '기타',
    type: workbook.type ?? 'unknown',
    weekLabel: workbook.week_label ?? null,
    config: (workbook.config as Record<string, unknown> | null) ?? null,
  }
}

export function transformAssignmentRow(row: RawAssignmentRow): AssignmentTransformResult {
  const workbook = normalizeWorkbook(row.workbooks)
  const mediaAssets = new Map<string, MediaAssetRecord>()

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

  const studentTasks: StudentTaskSummary[] = (row.student_tasks ?? []).map((task) => {
    const profile = Array.isArray(task.profiles) ? task.profiles[0] : task.profiles
    const items: StudentTaskItemSummary[] = (task.student_task_items ?? []).map((item) => {
      const workbookItem = Array.isArray(item.workbook_items) ? item.workbook_items[0] : item.workbook_items
      return {
        id: item.id,
        itemId: item.item_id,
        streak: item.streak ?? null,
        nextReviewAt: item.next_review_at ?? null,
        completedAt: item.completed_at,
        lastResult: item.last_result ?? null,
        workbookItem: workbookItem
          ? {
              id: workbookItem.id,
              position: workbookItem.position,
              prompt: workbookItem.prompt,
              answerType: workbookItem.answer_type,
              explanation: workbookItem.explanation,
              shortFields: (workbookItem.workbook_item_short_fields ?? []).map((field) => ({
                id: field.id,
                label: field.label,
                answer: field.answer,
                position: field.position ?? 0,
              })),
              choices: (workbookItem.workbook_item_choices ?? []).map((choice) => ({
                id: choice.id,
                label: choice.label,
                content: choice.content,
                isCorrect: Boolean(choice.is_correct),
              })),
            }
          : null,
      }
    })

    const submissions: SubmissionSummary[] = (task.task_submissions ?? []).map((submission) => {
      const asset = Array.isArray(submission.media_assets) ? submission.media_assets[0] : submission.media_assets
      if (asset?.id && asset.path) {
        mediaAssets.set(asset.id, {
          bucket: asset.bucket ?? 'submissions',
          path: asset.path,
          mimeType: asset.mime_type ?? null,
          metadata: (asset.metadata as Record<string, unknown> | null) ?? null,
        })
      }

      return {
        id: submission.id,
        itemId: submission.item_id,
        submissionType: submission.submission_type,
        content: submission.content,
        mediaAssetId: submission.media_asset_id,
        score: submission.score,
        feedback: submission.feedback,
        createdAt: submission.created_at,
        updatedAt: submission.updated_at,
        asset: null,
      }
    })

    return {
      id: task.id,
      status: task.status,
      completionAt: task.completion_at,
      updatedAt: task.updated_at,
      studentId: task.student_id,
      student: {
        id: profile?.id ?? task.student_id,
        name: profile?.name ?? '이름 미정',
        email: profile?.email ?? null,
        classId: profile?.class_id ?? null,
      },
      items,
      submissions,
    }
  })

  const assignment: AssignmentDetail = {
    id: row.id,
    dueAt: row.due_at,
    createdAt: row.created_at,
    targetScope: row.target_scope,
    title: workbook?.title ?? '제목 미정',
    subject: workbook?.subject ?? '기타',
    type: workbook?.type ?? 'unknown',
    weekLabel: workbook?.weekLabel ?? null,
    config: workbook?.config ?? null,
    classes,
    studentTasks,
    printRequests: (row.print_requests ?? []).map((request) => {
      const items: PrintRequestItemSummary[] = (request.print_request_items ?? []).map((item) => ({
        id: item.id,
        studentTaskId: item.student_task_id,
        submissionId: item.submission_id,
        mediaAssetId: item.media_asset_id,
        assetFilename: item.asset_filename ?? null,
        assetMetadata: item.asset_metadata ?? null,
      }))

      const studentTaskIds = items.length > 0
        ? Array.from(new Set(items.map((item) => item.studentTaskId)))
        : request.student_task_id
          ? [request.student_task_id]
          : []

      return {
        id: request.id,
        status: request.status,
        bundleMode: (request.bundle_mode as 'merged' | 'separate' | null) ?? 'merged',
        bundleStatus: request.bundle_status ?? 'pending',
        compiledAssetId: request.compiled_asset_id ?? null,
        bundleReadyAt: request.bundle_ready_at ?? null,
        bundleError: request.bundle_error ?? null,
        studentTaskId: request.student_task_id,
        studentTaskIds,
        desiredDate: request.desired_date,
        desiredPeriod: request.desired_period,
        copies: request.copies ?? 1,
        colorMode: request.color_mode ?? 'bw',
        notes: request.notes ?? null,
        createdAt: request.created_at,
        updatedAt: request.updated_at ?? null,
        items,
      }
    }),
  }

  return { assignment, mediaAssets }
}

export function applySignedAssetUrls(
  assignment: AssignmentDetail,
  signedMap: Map<string, { url: string; filename: string; mimeType: string | null }>
): AssignmentDetail {
  assignment.studentTasks.forEach((task) => {
    task.submissions.forEach((submission) => {
      if (!submission.mediaAssetId) {
        return
      }
      const info = signedMap.get(submission.mediaAssetId)
      if (info) {
        submission.asset = info
      }
    })
  })
  return assignment
}

export function cloneAssignmentDetail(assignment: AssignmentDetail): AssignmentDetail {
  return {
    ...assignment,
    classes: assignment.classes.map((cls) => ({ ...cls })),
    studentTasks: assignment.studentTasks.map((task) => ({
      ...task,
      student: { ...task.student },
      items: task.items.map((item) => ({
        ...item,
        workbookItem: item.workbookItem
          ? {
              ...item.workbookItem,
              shortFields: item.workbookItem.shortFields.map((field) => ({ ...field })),
              choices: item.workbookItem.choices.map((choice) => ({ ...choice })),
            }
          : null,
      })),
      submissions: task.submissions.map((submission) => ({
        ...submission,
        asset: submission.asset ? { ...submission.asset } : null,
      })),
    })),
    printRequests: assignment.printRequests.map((request) => ({
      ...request,
      studentTaskIds: [...request.studentTaskIds],
      items: request.items.map((item) => ({ ...item })),
    })),
  }
}

export function filterAssignmentForClass(assignment: AssignmentDetail, classId: string): AssignmentDetail | null {
  const targetedClassIds = new Set(assignment.classes.map((cls) => cls.id))
  const filteredTasks = assignment.studentTasks.filter((task) => {
    if (task.student.classId) {
      return task.student.classId === classId
    }
    return targetedClassIds.has(classId)
  })

  if (filteredTasks.length === 0 && !targetedClassIds.has(classId)) {
    return null
  }

  const cloned = cloneAssignmentDetail(assignment)
  const taskIds = new Set(filteredTasks.map((task) => task.id))

  cloned.studentTasks = cloned.studentTasks.filter((task) => taskIds.has(task.id))
  cloned.printRequests = cloned.printRequests.filter((request) => {
    const requestTargets = request.studentTaskIds.length > 0
      ? request.studentTaskIds
      : request.studentTaskId
        ? [request.studentTaskId]
        : []
    if (requestTargets.length > 0) {
      return requestTargets.some((taskId) => taskIds.has(taskId))
    }
    return targetedClassIds.has(classId)
  })

  return cloned
}

export function computeAssignmentSummary(assignment: AssignmentDetail) {
  const totalStudents = assignment.studentTasks.length
  const completedStudents = assignment.studentTasks.filter((task) => task.status === 'completed').length
  const canceledStudents = assignment.studentTasks.filter((task) => task.status === 'canceled').length
  const outstandingStudents = assignment.studentTasks.filter((task) => task.status !== 'completed' && task.status !== 'canceled').length
  const completionRate = totalStudents === 0 ? 0 : Math.round((completedStudents / totalStudents) * 100)

  const dueLabel = assignment.dueAt
    ? DateUtil.formatForDisplay(assignment.dueAt, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '마감 없음'

  return {
    totalStudents,
    completedStudents,
    canceledStudents,
    outstandingStudents,
    completionRate,
    dueLabel,
  }
}
