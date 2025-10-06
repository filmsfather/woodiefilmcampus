import type { SupabaseClient } from '@supabase/supabase-js'

import DateUtil from '@/lib/date-util'
import { createClient as createServerSupabase } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type {
  StudentTaskAssignmentSummary,
  StudentTaskDetail,
  StudentTaskItemDetail,
  StudentTaskStatus,
  StudentTaskSummary,
  StudentTaskSubmission,
  StudentTaskWorkbookSummary,
} from '@/types/student-task'

const DUE_SOON_THRESHOLD_MINUTES = 60 * 24

type JsonRecord = Record<string, unknown>

type WorkbookItemChoiceRow = {
  id: string
  label: string | null
  content: string | null
  is_correct: boolean | null
}

type WorkbookItemShortFieldRow = {
  id: string
  label: string | null
  answer: string | null
  position: number | null
}

type WorkbookItemMediaRow = {
  id: string
  position: number | null
  media_assets?: {
    id: string
    bucket: string | null
    path: string | null
    mime_type: string | null
    size: number | null
    metadata: JsonRecord | null
  }
}

type WorkbookItemRow = {
  id: string
  position: number
  prompt: string
  answer_type: string
  explanation: string | null
  srs_settings: JsonRecord | null
  workbook_item_choices?: WorkbookItemChoiceRow[] | null
  workbook_item_short_fields?: WorkbookItemShortFieldRow[] | null
  workbook_item_media?: WorkbookItemMediaRow[] | null
}

type StudentTaskSubmissionRow = {
  id: string
  submission_type: string
  content: string | null
  media_asset_id: string | null
  score: string | null
  feedback: string | null
  evaluated_by: string | null
  evaluated_at: string | null
  created_at: string
  updated_at: string
}

type StudentTaskItemRow = {
  id: string
  item_id: string
  completed_at: string | null
  next_review_at: string | null
  streak: number | null
  last_result: string | null
  item?: WorkbookItemRow | WorkbookItemRow[] | null
  submissions?: StudentTaskSubmissionRow[] | null
  task_submissions?: StudentTaskSubmissionRow[] | null
}

type TaskSubmissionRow = StudentTaskSubmissionRow & {
  item_id: string | null
}

type WorkbookRow = {
  id: string
  title: string
  subject: string
  type: string
  week_label: string | null
  tags: unknown
  description?: string | null
  config: JsonRecord | null
}

type AssignmentRow = {
  id: string
  due_at: string | null
  created_at: string
  target_scope: string
  workbook_id: string | null
}

type StudentTaskRow = {
  id: string
  status: StudentTaskStatus
  completion_at: string | null
  created_at: string
  updated_at: string
  progress_meta: JsonRecord | null
  assignment_id: string | null
  student_task_items?: StudentTaskItemRow[]
  task_level_submissions?: TaskSubmissionRow[] | null
}

function pickFirst<T>(value: T | T[] | null | undefined): T | null {
  if (!value) {
    return null
  }
  if (Array.isArray(value)) {
    return value[0] ?? null
  }
  return value
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
}

function toWorkbookSummaryFromRow(row: WorkbookRow | null | undefined): StudentTaskWorkbookSummary {
  return {
    id: typeof row?.id === 'string' ? row.id : '',
    title: typeof row?.title === 'string' ? row.title : '제목 미정',
    subject: typeof row?.subject === 'string' ? row.subject : '과목 미정',
    type: typeof row?.type === 'string' ? row.type : 'unknown',
    weekLabel: (row?.week_label ?? null) as string | null,
    tags: normalizeStringArray(row?.tags ?? null),
    description: (row?.description ?? null) as string | null,
    config: (row?.config as JsonRecord | null) ?? null,
  }
}

function getWorkbookSummary(
  workbookId: string | null | undefined,
  lookup: Map<string, StudentTaskWorkbookSummary>
): StudentTaskWorkbookSummary {
  if (workbookId && lookup.has(workbookId)) {
    return lookup.get(workbookId) as StudentTaskWorkbookSummary
  }

  return {
    id: workbookId ?? '',
    title: '문제집 정보 없음',
    subject: '과목 미정',
    type: 'unknown',
    weekLabel: null,
    tags: [],
    description: null,
    config: null,
  }
}

function toAssignmentSummary(
  row: AssignmentRow,
  lookup: Map<string, StudentTaskWorkbookSummary>
): StudentTaskAssignmentSummary {
  return {
    id: row.id,
    dueAt: row.due_at,
    createdAt: row.created_at,
    targetScope: row.target_scope,
    workbook: getWorkbookSummary(row.workbook_id, lookup),
  }
}

function deriveDueState(dueAt: string | null, status: StudentTaskStatus) {
  if (!dueAt) {
    return {
      dueAt: null,
      isOverdue: false,
      isDueSoon: false,
    }
  }

  const now = DateUtil.nowUTC()
  const isCompleted = status === 'completed'
  const isOverdue = !isCompleted && new Date(dueAt).getTime() < now.getTime()

  const diffMinutes = DateUtil.diffInMinutes(dueAt, now)
  const isDueSoon = !isCompleted && diffMinutes >= 0 && diffMinutes <= DUE_SOON_THRESHOLD_MINUTES

  return {
    dueAt,
    isOverdue,
    isDueSoon,
  }
}

function mapSummary(
  row: StudentTaskRow,
  assignmentLookup: Map<string, StudentTaskAssignmentSummary>
): StudentTaskSummary {
  const assignment = row.assignment_id ? assignmentLookup.get(row.assignment_id) ?? null : null
  const items = row.student_task_items ?? []
  let totalItems = items.length
  let completedItems = items.filter((item) => Boolean(item.completed_at)).length

  if (assignment?.workbook?.type === 'film') {
    const filmProgress = (() => {
      const meta = row.progress_meta
      if (!meta || typeof meta !== 'object') {
        return null
      }
      const film = (meta as { film?: unknown }).film
      if (!film || typeof film !== 'object') {
        return null
      }
      const total = Number((film as { total?: unknown }).total)
      const completed = Number((film as { completed?: unknown }).completed)
      if (!Number.isFinite(total) || total <= 0) {
        return null
      }
      return {
        total,
        completed: Number.isFinite(completed) ? Math.max(0, Math.min(completed, total)) : 0,
      }
    })()

    if (filmProgress) {
      totalItems = filmProgress.total
      completedItems = filmProgress.completed
    }
  }

  return {
    id: row.id,
    status: row.status,
    completionAt: row.completion_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    progressMeta: row.progress_meta ?? null,
    assignment,
    summary: {
      totalItems,
      completedItems,
      remainingItems: Math.max(totalItems - completedItems, 0),
    },
    due: deriveDueState(assignment?.dueAt ?? null, row.status),
  }
}

function mapItemDetail(row: StudentTaskItemRow): StudentTaskItemDetail {
  const workbookItem = pickFirst(row.item)
  const choiceRows = workbookItem?.workbook_item_choices ?? []
  const sortedChoices = choiceRows
    .filter((choice): choice is NonNullable<typeof choice> => Boolean(choice))
    .map((choice) => ({
      id: choice.id,
      label: choice.label ?? null,
      content: choice.content ?? '',
      isCorrect: Boolean(choice.is_correct),
    }))

  const shortFieldRows = workbookItem?.workbook_item_short_fields ?? []
  const sortedShortFields = shortFieldRows
    .filter((field): field is NonNullable<typeof field> => Boolean(field))
    .map((field) => ({
      id: field.id,
      label: field.label ?? null,
      answer: field.answer ?? '',
      position: field.position ?? 0,
    }))
    .sort((a, b) => a.position - b.position)

  const mediaRows = workbookItem?.workbook_item_media ?? []
  const sortedMedia = mediaRows
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .map((item) => ({
      id: item.id,
      position: item.position ?? 0,
      asset: {
        id: item.media_assets?.id ?? '',
        bucket: item.media_assets?.bucket ?? 'workbook-assets',
        path: item.media_assets?.path ?? '',
        mimeType: item.media_assets?.mime_type ?? null,
        size: item.media_assets?.size ?? null,
        metadata: (item.media_assets?.metadata as JsonRecord | null) ?? null,
      },
    }))
    .sort((a, b) => a.position - b.position)

  const submissionRows = (row.submissions ?? row.task_submissions ?? []).filter((submission) =>
    Boolean(submission)
  )
  submissionRows.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  const latestSubmission = submissionRows.at(-1)

  return {
    id: row.id,
    completedAt: row.completed_at,
    nextReviewAt: row.next_review_at,
    streak: row.streak ?? 0,
    lastResult: row.last_result ?? null,
    workbookItem: {
      id: workbookItem?.id ?? '',
      position: workbookItem?.position ?? 0,
      prompt: workbookItem?.prompt ?? '',
      answerType: workbookItem?.answer_type ?? 'text',
      explanation: workbookItem?.explanation ?? null,
      srsSettings: workbookItem?.srs_settings ?? null,
      choices: sortedChoices,
      shortFields: sortedShortFields,
      media: sortedMedia,
    },
    submission: latestSubmission ? mapSubmission({ ...latestSubmission, item_id: workbookItem?.id ?? null }) : null,
  }
}

function mapSubmission(row: TaskSubmissionRow): StudentTaskSubmission {
  return {
    id: row.id,
    submissionType: row.submission_type,
    content: row.content,
    mediaAssetId: row.media_asset_id,
    score: row.score,
    feedback: row.feedback,
    evaluatedBy: row.evaluated_by,
    evaluatedAt: row.evaluated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    itemId: row.item_id,
  }
}

function mapDetail(
  row: StudentTaskRow,
  assignmentLookup: Map<string, StudentTaskAssignmentSummary>
): StudentTaskDetail {
  const summary = mapSummary(row, assignmentLookup)
  const items = (row.student_task_items ?? [])
    .map(mapItemDetail)
    .sort((a, b) => a.workbookItem.position - b.workbookItem.position)

  return {
    ...summary,
    items,
    submissions: (row.task_level_submissions ?? []).map(mapSubmission),
  }
}

async function loadWorkbookSummaries(
  supabase: SupabaseClient,
  workbookIds: string[]
): Promise<Map<string, StudentTaskWorkbookSummary>> {
  const lookup = new Map<string, StudentTaskWorkbookSummary>()

  if (workbookIds.length === 0) {
    return lookup
  }

  const { data, error } = await supabase
    .from('workbooks')
    .select('id, title, subject, type, week_label, tags, description, config')
    .in('id', workbookIds)

  if (error) {
    console.error('[student-tasks] failed to load workbooks', error)
    return lookup
  }

  for (const row of (data ?? []) as WorkbookRow[]) {
    if (!row?.id) {
      continue
    }
    lookup.set(row.id, toWorkbookSummaryFromRow(row))
  }

  return lookup
}

function collectAssignmentIds(rows: StudentTaskRow[]): string[] {
  const ids = new Set<string>()

  for (const row of rows) {
    if (row.assignment_id) {
      ids.add(row.assignment_id)
    }
  }

  return Array.from(ids)
}

async function loadAssignmentSummaries(
  assignmentIds: string[]
): Promise<Map<string, StudentTaskAssignmentSummary>> {
  const lookup = new Map<string, StudentTaskAssignmentSummary>()

  if (assignmentIds.length === 0) {
    return lookup
  }

  const adminClient = createAdminClient()

  const { data, error } = await adminClient
    .from('assignments')
    .select('id, due_at, created_at, target_scope, workbook_id')
    .in('id', assignmentIds)

  if (error) {
    console.error('[student-tasks] failed to load assignments', error)
    return lookup
  }

  const rows = (data ?? []) as AssignmentRow[]
  const workbookIdSet = new Set<string>()
  for (const row of rows) {
    if (typeof row.workbook_id === 'string' && row.workbook_id.length > 0) {
      workbookIdSet.add(row.workbook_id)
    }
  }
  const workbookLookup = await loadWorkbookSummaries(adminClient, Array.from(workbookIdSet))

  for (const row of rows) {
    if (!row?.id) {
      continue
    }
    lookup.set(row.id, toAssignmentSummary(row, workbookLookup))
  }

  return lookup
}

export async function fetchStudentTaskSummaries(studentId: string): Promise<StudentTaskSummary[]> {
  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('student_tasks')
    .select(
      `id, assignment_id, status, completion_at, created_at, updated_at, progress_meta,
       student_task_items(id, completed_at, next_review_at)`
    )
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[student-tasks] failed to fetch summaries', error)
    throw new Error('학생 과제 목록을 불러오지 못했습니다.')
  }

  const rows = (data ?? []) as StudentTaskRow[]
  const assignmentLookup = await loadAssignmentSummaries(
    collectAssignmentIds(rows)
  )

  return rows.map((row) => mapSummary(row, assignmentLookup))
}

export async function fetchStudentTaskDetail(
  studentTaskId: string,
  studentId: string
): Promise<StudentTaskDetail | null> {
  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('student_tasks')
    .select(
      `id, assignment_id, status, completion_at, created_at, updated_at, progress_meta,
       student_task_items(
         id, item_id, completed_at, next_review_at, streak, last_result,
         item:workbook_items(
           id, position, prompt, answer_type, explanation, srs_settings,
           workbook_item_choices(id, label, content, is_correct),
           workbook_item_short_fields(id, label, answer, position),
           workbook_item_media(id, position, media_assets(id, bucket, path, mime_type, size))
         )
       )`
    )
    .eq('id', studentTaskId)
    .eq('student_id', studentId)
    .maybeSingle()

  if (error) {
    console.error('[student-tasks] failed to fetch detail', error)
    throw new Error('학생 과제 상세를 불러오지 못했습니다.')
  }

  if (!data) {
    return null
  }

  const row = data as StudentTaskRow
  const assignmentLookup = await loadAssignmentSummaries(
    collectAssignmentIds([row])
  )

  const assignmentSummary = row.assignment_id ? assignmentLookup.get(row.assignment_id) ?? null : null

  let workbookItemLookup: Map<string, WorkbookItemRow> | null = null

  if (assignmentSummary?.workbook.id) {
    const adminClient = createAdminClient()
    const { data: workbookItemRows, error: workbookItemsError } = await adminClient
      .from('workbook_items')
      .select(
        `id, position, prompt, answer_type, explanation, srs_settings,
         workbook_item_choices(id, label, content, is_correct),
         workbook_item_short_fields(id, label, answer, position),
         workbook_item_media(id, position, media_assets(id, bucket, path, mime_type, size))`
      )
      .eq('workbook_id', assignmentSummary.workbook.id)

    if (workbookItemsError) {
      console.error('[student-tasks] failed to load workbook items for detail', workbookItemsError)
    } else if (workbookItemRows) {
      workbookItemLookup = new Map(
        (workbookItemRows as unknown as WorkbookItemRow[]).map((item) => [item.id, item])
      )
    }
  }

  const { data: submissionRows, error: submissionError } = await supabase
    .from('task_submissions')
    .select(
      'id, student_task_id, item_id, submission_type, content, media_asset_id, score, feedback, evaluated_by, evaluated_at, created_at, updated_at'
    )
    .eq('student_task_id', row.id)

  if (submissionError) {
    console.error('[student-tasks] failed to fetch task submissions', submissionError)
    throw new Error('학생 과제 제출 정보를 불러오지 못했습니다.')
  }

  const itemSubmissionMap = new Map<string, StudentTaskSubmissionRow[]>()
  const taskLevelSubmissions: TaskSubmissionRow[] = []

  for (const submission of (submissionRows ?? []) as TaskSubmissionRow[]) {
    if (submission.item_id) {
      const list = itemSubmissionMap.get(submission.item_id) ?? []
      list.push(submission)
      itemSubmissionMap.set(submission.item_id, list)
    } else {
      taskLevelSubmissions.push(submission)
    }
  }

  const enrichedItems = (row.student_task_items ?? []).map((item) => {
    let workbookItem = pickFirst(item.item)

    if (!workbookItem && workbookItemLookup && item.item_id && workbookItemLookup.has(item.item_id)) {
      workbookItem = workbookItemLookup.get(item.item_id) ?? null
    }

    const workbookItemId = (workbookItem as { id?: string } | null)?.id ?? null

    return {
      ...item,
      item: workbookItem ?? null,
      submissions: workbookItemId ? itemSubmissionMap.get(workbookItemId) ?? [] : [],
    }
  })

  const enrichedRow: StudentTaskRow = {
    ...row,
    student_task_items: enrichedItems,
    task_level_submissions: taskLevelSubmissions,
  }

  return mapDetail(enrichedRow, assignmentLookup)
}
