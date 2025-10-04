import DateUtil from '@/lib/date-util'
import { createClient as createServerSupabase } from '@/lib/supabase/server'
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
  workbook: WorkbookRow | WorkbookRow[] | null
}

type StudentTaskRow = {
  id: string
  status: StudentTaskStatus
  completion_at: string | null
  created_at: string
  updated_at: string
  progress_meta: JsonRecord | null
  assignment: AssignmentRow | AssignmentRow[] | null
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

function toWorkbookSummary(workbook: WorkbookRow | WorkbookRow[] | null | undefined): StudentTaskWorkbookSummary {
  const record = pickFirst(workbook)

  return {
    id: typeof record?.id === 'string' ? record.id : '',
    title: typeof record?.title === 'string' ? record.title : '제목 미정',
    subject: typeof record?.subject === 'string' ? record.subject : '과목 미정',
    type: typeof record?.type === 'string' ? record.type : 'unknown',
    weekLabel: (record?.week_label ?? null) as string | null,
    tags: normalizeStringArray(record?.tags ?? null),
    description: (record?.description ?? null) as string | null,
    config: (record?.config as JsonRecord | null) ?? null,
  }
}

function toAssignmentSummary(row: AssignmentRow): StudentTaskAssignmentSummary {
  return {
    id: row.id,
    dueAt: row.due_at,
    createdAt: row.created_at,
    targetScope: row.target_scope,
    workbook: toWorkbookSummary(row.workbook),
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

function mapSummary(row: StudentTaskRow): StudentTaskSummary {
  const assignmentRow = pickFirst(row.assignment)
  const assignment = assignmentRow ? toAssignmentSummary(assignmentRow) : null
  const items = row.student_task_items ?? []
  const totalItems = items.length
  const completedItems = items.filter((item) => Boolean(item.completed_at)).length

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

function mapDetail(row: StudentTaskRow): StudentTaskDetail {
  const summary = mapSummary(row)
  const items = (row.student_task_items ?? [])
    .map(mapItemDetail)
    .sort((a, b) => a.workbookItem.position - b.workbookItem.position)

  return {
    ...summary,
    items,
    submissions: (row.task_level_submissions ?? []).map(mapSubmission),
  }
}

export async function fetchStudentTaskSummaries(studentId: string): Promise<StudentTaskSummary[]> {
  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('student_tasks')
    .select(
      `id, status, completion_at, created_at, updated_at, progress_meta,
       assignment:assignments(id, due_at, created_at, target_scope,
         workbook:workbooks(id, title, subject, type, week_label, tags, description, config)
       ),
       student_task_items(id, completed_at, next_review_at)`
    )
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[student-tasks] failed to fetch summaries', error)
    throw new Error('학생 과제 목록을 불러오지 못했습니다.')
  }

  const rows = (data ?? []) as unknown[]
  return rows.map((raw) => mapSummary(raw as StudentTaskRow))
}

export async function fetchStudentTaskDetail(
  studentTaskId: string,
  studentId: string
): Promise<StudentTaskDetail | null> {
  const supabase = createServerSupabase()
  const { data, error } = await supabase
    .from('student_tasks')
    .select(
      `id, status, completion_at, created_at, updated_at, progress_meta,
       assignment:assignments(id, due_at, created_at, target_scope,
         workbook:workbooks(id, title, subject, type, week_label, tags, description, config)
       ),
       student_task_items(
         id, completed_at, next_review_at, streak, last_result,
         item:workbook_items(
           id, position, prompt, answer_type, explanation, srs_settings,
           workbook_item_choices(id, label, content, is_correct),
           workbook_item_short_fields(id, label, answer, position),
           workbook_item_media(id, position, media_assets(id, bucket, path, mime_type, size))
         ),
         submissions:task_submissions(
           id, submission_type, content, media_asset_id, score, feedback, evaluated_by, evaluated_at, created_at, updated_at
         )
       ),
       task_level_submissions:task_submissions(
         id, item_id, submission_type, content, media_asset_id, score, feedback, evaluated_by, evaluated_at, created_at, updated_at
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

  return mapDetail(data as unknown as StudentTaskRow)
}
