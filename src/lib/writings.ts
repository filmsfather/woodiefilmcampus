import { createAdminClient } from '@/lib/supabase/admin'
import type {
  StudentWritingExamData,
  StudentWritingListItem,
  WritingAttemptRow,
  WritingAttemptStatus,
  WritingOcrStatus,
  WritingQuestion,
  WritingReviewItem,
  WritingSessionDetail,
  WritingSessionSummary,
  WritingSetDetail,
  WritingSetSummary,
  WritingSubmissionImage,
} from '@/types/writing'

const SIGNED_URL_TTL_SECONDS = 60 * 60

type AssetRow = {
  id: string
  bucket: string | null
  path: string | null
}

async function createSignedUrlMap(assetRows: AssetRow[]): Promise<Map<string, string>> {
  const admin = createAdminClient()
  const map = new Map<string, string>()

  const byBucket = new Map<string, AssetRow[]>()
  for (const row of assetRows) {
    if (!row.bucket || !row.path) continue
    const list = byBucket.get(row.bucket) ?? []
    list.push(row)
    byBucket.set(row.bucket, list)
  }

  for (const [bucket, rows] of byBucket) {
    const paths = rows.map((row) => row.path as string)
    const { data, error } = await admin.storage.from(bucket).createSignedUrls(paths, SIGNED_URL_TTL_SECONDS)
    if (error) {
      console.error('[writings] failed to create signed urls', error)
      continue
    }
    data?.forEach((entry, index) => {
      const row = rows[index]
      if (entry?.signedUrl && row) {
        map.set(row.id, entry.signedUrl)
      }
    })
  }

  return map
}

type RawQuestionRow = {
  id: string
  set_id: string
  order_index: number
  prompt: string
}

type RawQuestionAssetRow = {
  id: string
  question_id: string
  media_asset_id: string
  order_index: number
  media_assets: { id: string; bucket: string | null; path: string | null } | { id: string; bucket: string | null; path: string | null }[] | null
}

async function fetchQuestionsForSets(setIds: string[]): Promise<Map<string, WritingQuestion[]>> {
  const result = new Map<string, WritingQuestion[]>()
  if (setIds.length === 0) {
    return result
  }

  const admin = createAdminClient()

  const { data: questionRows, error: questionError } = await admin
    .from('writing_questions')
    .select('id, set_id, order_index, prompt')
    .in('set_id', setIds)
    .order('order_index', { ascending: true })

  if (questionError) {
    console.error('[writings] failed to fetch questions', questionError)
    return result
  }

  const questions = (questionRows ?? []) as RawQuestionRow[]
  const questionIds = questions.map((row) => row.id)

  let assetRows: RawQuestionAssetRow[] = []
  if (questionIds.length > 0) {
    const { data, error } = await admin
      .from('writing_question_assets')
      .select('id, question_id, media_asset_id, order_index, media_assets(id, bucket, path)')
      .in('question_id', questionIds)
      .order('order_index', { ascending: true })

    if (error) {
      console.error('[writings] failed to fetch question assets', error)
    }
    assetRows = (data ?? []) as unknown as RawQuestionAssetRow[]
  }

  const mediaRows: AssetRow[] = assetRows.map((row) => {
    const media = Array.isArray(row.media_assets) ? row.media_assets[0] : row.media_assets
    return { id: row.id, bucket: media?.bucket ?? null, path: media?.path ?? null }
  })
  const urlMap = await createSignedUrlMap(mediaRows)

  const assetsByQuestion = new Map<string, WritingQuestion['assets']>()
  for (const row of assetRows) {
    const list = assetsByQuestion.get(row.question_id) ?? []
    list.push({
      id: row.id,
      mediaAssetId: row.media_asset_id,
      orderIndex: row.order_index,
      url: urlMap.get(row.id) ?? null,
    })
    assetsByQuestion.set(row.question_id, list)
  }

  for (const row of questions) {
    const list = result.get(row.set_id) ?? []
    list.push({
      id: row.id,
      orderIndex: row.order_index,
      prompt: row.prompt,
      assets: assetsByQuestion.get(row.id) ?? [],
    })
    result.set(row.set_id, list)
  }

  return result
}

async function fetchSubmissionImagesForAttempts(
  attemptIds: string[]
): Promise<Map<string, WritingSubmissionImage[]>> {
  const result = new Map<string, WritingSubmissionImage[]>()
  if (attemptIds.length === 0) {
    return result
  }

  const admin = createAdminClient()

  type Row = {
    id: string
    attempt_id: string
    media_asset_id: string
    order_index: number
    media_assets: { id: string; bucket: string | null; path: string | null } | { id: string; bucket: string | null; path: string | null }[] | null
  }

  const { data, error } = await admin
    .from('writing_submission_assets')
    .select('id, attempt_id, media_asset_id, order_index, media_assets(id, bucket, path)')
    .in('attempt_id', attemptIds)
    .order('order_index', { ascending: true })

  if (error) {
    console.error('[writings] failed to fetch submission assets', error)
    return result
  }

  const rows = (data ?? []) as unknown as Row[]
  const mediaRows: AssetRow[] = rows.map((row) => {
    const media = Array.isArray(row.media_assets) ? row.media_assets[0] : row.media_assets
    return { id: row.id, bucket: media?.bucket ?? null, path: media?.path ?? null }
  })
  const urlMap = await createSignedUrlMap(mediaRows)

  for (const row of rows) {
    const list = result.get(row.attempt_id) ?? []
    list.push({
      id: row.id,
      mediaAssetId: row.media_asset_id,
      orderIndex: row.order_index,
      url: urlMap.get(row.id) ?? null,
    })
    result.set(row.attempt_id, list)
  }

  return result
}

export async function fetchWritingSetSummaries(): Promise<WritingSetSummary[]> {
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('writing_sets')
    .select(
      `id, title, description, time_limit_minutes, created_at, workbook_id,
       profiles:profiles!writing_sets_created_by_fkey(name, email),
       writing_questions(id),
       writing_sessions(id)`
    )
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[writings] failed to fetch writing sets', error)
    return []
  }

  type Row = {
    id: string
    title: string
    description: string | null
    time_limit_minutes: number
    created_at: string
    workbook_id: string | null
    profiles: { name: string | null; email: string | null } | { name: string | null; email: string | null }[] | null
    writing_questions: { id: string }[] | null
    writing_sessions: { id: string }[] | null
  }

  const rows = (data ?? []) as unknown as Row[]
  const workbookIds = rows.map((row) => row.workbook_id).filter((id): id is string => Boolean(id))

  const reviewCountByWorkbook = new Map<string, number>()
  if (workbookIds.length > 0) {
    const { data: itemRows, error: itemError } = await admin
      .from('workbook_items')
      .select('id, workbook_id')
      .in('workbook_id', workbookIds)

    if (itemError) {
      console.error('[writings] failed to fetch review question counts', itemError)
    }

    for (const row of (itemRows ?? []) as Array<{ id: string; workbook_id: string }>) {
      reviewCountByWorkbook.set(row.workbook_id, (reviewCountByWorkbook.get(row.workbook_id) ?? 0) + 1)
    }
  }

  return rows.map((row) => {
    const creator = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      timeLimitMinutes: row.time_limit_minutes,
      createdAt: row.created_at,
      createdByName: creator?.name ?? creator?.email ?? null,
      questionCount: row.writing_questions?.length ?? 0,
      reviewQuestionCount: row.workbook_id ? reviewCountByWorkbook.get(row.workbook_id) ?? 0 : 0,
      sessionCount: row.writing_sessions?.length ?? 0,
    }
  })
}

type RawSessionRow = {
  id: string
  set_id: string
  status: 'open' | 'closed'
  created_at: string
  writing_sets: { id: string; title: string; time_limit_minutes: number } | { id: string; title: string; time_limit_minutes: number }[] | null
  profiles: { name: string | null; email: string | null } | { name: string | null; email: string | null }[] | null
  writing_session_targets: Array<{
    class_id: string | null
    student_id: string | null
    classes: { id: string; name: string | null } | { id: string; name: string | null }[] | null
    student:
      | { id: string; name: string | null; email: string | null }
      | { id: string; name: string | null; email: string | null }[]
      | null
  }> | null
  writing_attempts: Array<{ id: string; status: WritingAttemptStatus }> | null
}

const SESSION_SELECT = `id, set_id, status, created_at,
  writing_sets(id, title, time_limit_minutes),
  profiles:profiles!writing_sessions_created_by_fkey(name, email),
  writing_session_targets(
    class_id, student_id,
    classes(id, name),
    student:profiles!writing_session_targets_student_id_fkey(id, name, email)
  ),
  writing_attempts(id, status)`

function buildSessionSummary(row: RawSessionRow): WritingSessionSummary {
  const set = Array.isArray(row.writing_sets) ? row.writing_sets[0] : row.writing_sets
  const creator = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles

  const targetLabels: string[] = []
  for (const target of row.writing_session_targets ?? []) {
    if (target.class_id) {
      const cls = Array.isArray(target.classes) ? target.classes[0] : target.classes
      targetLabels.push(cls?.name ?? '이름 없는 반')
    } else if (target.student_id) {
      const student = Array.isArray(target.student) ? target.student[0] : target.student
      targetLabels.push(student?.name ?? student?.email ?? '이름 없는 학생')
    }
  }

  const attempts = row.writing_attempts ?? []

  return {
    id: row.id,
    setId: row.set_id,
    setTitle: set?.title ?? '제목 없음',
    timeLimitMinutes: set?.time_limit_minutes ?? 0,
    status: row.status,
    createdAt: row.created_at,
    createdByName: creator?.name ?? creator?.email ?? null,
    targetLabels,
    totalStudents: attempts.length,
    submittedCount: attempts.filter(
      (attempt) => attempt.status === 'submitted' || attempt.status === 'task_created'
    ).length,
  }
}

export async function fetchWritingSessionSummaries(): Promise<WritingSessionSummary[]> {
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('writing_sessions')
    .select(SESSION_SELECT)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[writings] failed to fetch writing sessions', error)
    return []
  }

  return ((data ?? []) as unknown as RawSessionRow[]).map(buildSessionSummary)
}

export async function fetchWritingSetDetail(setId: string): Promise<WritingSetDetail | null> {
  const admin = createAdminClient()

  const { data: setRow, error } = await admin
    .from('writing_sets')
    .select('id, title, description, time_limit_minutes, created_at, workbook_id')
    .eq('id', setId)
    .maybeSingle()

  if (error || !setRow) {
    if (error) console.error('[writings] failed to fetch set detail', error)
    return null
  }

  const [questionMap, sessionResult] = await Promise.all([
    fetchQuestionsForSets([setId]),
    admin
      .from('writing_sessions')
      .select(SESSION_SELECT)
      .eq('set_id', setId)
      .order('created_at', { ascending: false }),
  ])

  if (sessionResult.error) {
    console.error('[writings] failed to fetch sessions for set', sessionResult.error)
  }

  let reviewQuestions: WritingSetDetail['reviewQuestions'] = []
  if (setRow.workbook_id) {
    const { data: itemRows, error: itemError } = await admin
      .from('workbook_items')
      .select('id, position, prompt')
      .eq('workbook_id', setRow.workbook_id)
      .order('position', { ascending: true })

    if (itemError) {
      console.error('[writings] failed to fetch review questions', itemError)
    }

    reviewQuestions = ((itemRows ?? []) as Array<{ id: string; position: number; prompt: string }>).map((row) => ({
      id: row.id,
      position: row.position,
      prompt: row.prompt,
    }))
  }

  return {
    id: setRow.id,
    title: setRow.title,
    description: setRow.description,
    timeLimitMinutes: setRow.time_limit_minutes as number,
    createdAt: setRow.created_at,
    workbookId: setRow.workbook_id,
    questions: questionMap.get(setId) ?? [],
    reviewQuestions,
    sessions: ((sessionResult.data ?? []) as unknown as RawSessionRow[]).map(buildSessionSummary),
  }
}

export async function fetchWritingSessionDetail(sessionId: string): Promise<WritingSessionDetail | null> {
  const admin = createAdminClient()

  const { data: sessionRow, error } = await admin
    .from('writing_sessions')
    .select(SESSION_SELECT)
    .eq('id', sessionId)
    .maybeSingle()

  if (error || !sessionRow) {
    if (error) console.error('[writings] failed to fetch session detail', error)
    return null
  }

  const raw = sessionRow as unknown as RawSessionRow
  const summary = buildSessionSummary(raw)

  const { data: setRow } = await admin
    .from('writing_sets')
    .select('id, title, description, time_limit_minutes, workbook_id')
    .eq('id', raw.set_id)
    .maybeSingle()

  const questionMap = await fetchQuestionsForSets([raw.set_id])

  let templateReviewQuestions: WritingSetDetail['reviewQuestions'] = []
  if (setRow?.workbook_id) {
    const { data: itemRows, error: itemError } = await admin
      .from('workbook_items')
      .select('id, position, prompt')
      .eq('workbook_id', setRow.workbook_id)
      .order('position', { ascending: true })

    if (itemError) {
      console.error('[writings] failed to fetch template review questions', itemError)
    }

    templateReviewQuestions = ((itemRows ?? []) as Array<{ id: string; position: number; prompt: string }>).map(
      (row) => ({ id: row.id, position: row.position, prompt: row.prompt })
    )
  }

  type AttemptDetailRow = {
    id: string
    student_id: string
    status: WritingAttemptStatus
    started_at: string | null
    deadline_at: string | null
    submitted_at: string | null
    ocr_text: string | null
    ocr_status: WritingOcrStatus
    student_task_id: string | null
    profiles: { id: string; name: string | null; email: string | null } | { id: string; name: string | null; email: string | null }[] | null
    student_tasks:
      | { id: string; assignment_id: string; status: string | null }
      | Array<{ id: string; assignment_id: string; status: string | null }>
      | null
  }

  const { data: attemptData, error: attemptError } = await admin
    .from('writing_attempts')
    .select(
      `id, student_id, status, started_at, deadline_at, submitted_at, ocr_text, ocr_status, student_task_id,
       profiles:profiles!writing_attempts_student_id_fkey(id, name, email),
       student_tasks:student_tasks!writing_attempts_student_task_id_fkey(id, assignment_id, status)`
    )
    .eq('session_id', sessionId)

  if (attemptError) {
    console.error('[writings] failed to fetch attempts', attemptError)
  }

  const attempts = (attemptData ?? []) as unknown as AttemptDetailRow[]

  // 학생 반 이름 (첫 번째 소속 반 기준)
  const studentIds = attempts.map((attempt) => attempt.student_id)
  const classNameByStudent = new Map<string, string>()
  if (studentIds.length > 0) {
    const { data: memberRows, error: memberError } = await admin
      .from('class_students')
      .select('student_id, classes(name)')
      .in('student_id', studentIds)

    if (memberError) {
      console.error('[writings] failed to fetch student classes', memberError)
    }

    for (const row of (memberRows ?? []) as unknown as Array<{
      student_id: string
      classes: { name: string | null } | { name: string | null }[] | null
    }>) {
      if (classNameByStudent.has(row.student_id)) continue
      const cls = Array.isArray(row.classes) ? row.classes[0] : row.classes
      if (cls?.name) {
        classNameByStudent.set(row.student_id, cls.name)
      }
    }
  }

  const submissionImagesByAttempt = await fetchSubmissionImagesForAttempts(attempts.map((attempt) => attempt.id))

  // 오답노트 과제 문항 + 학생 답변
  const taskIds = attempts
    .map((attempt) => attempt.student_task_id)
    .filter((id): id is string => Boolean(id))

  const reviewItemsByTask = new Map<string, WritingReviewItem[]>()
  if (taskIds.length > 0) {
    type TaskItemRow = {
      student_task_id: string
      workbook_items: { id: string; position: number; prompt: string } | { id: string; position: number; prompt: string }[] | null
    }
    type SubmissionRow = {
      student_task_id: string
      item_id: string | null
      content: string | null
      updated_at: string | null
      created_at: string | null
    }

    const [taskItemsResult, submissionsResult] = await Promise.all([
      admin
        .from('student_task_items')
        .select('student_task_id, workbook_items(id, position, prompt)')
        .in('student_task_id', taskIds),
      admin
        .from('task_submissions')
        .select('student_task_id, item_id, content, updated_at, created_at')
        .in('student_task_id', taskIds)
        .not('item_id', 'is', null),
    ])

    if (taskItemsResult.error) {
      console.error('[writings] failed to fetch review task items', taskItemsResult.error)
    }
    if (submissionsResult.error) {
      console.error('[writings] failed to fetch review submissions', submissionsResult.error)
    }

    const answerByTaskItem = new Map<string, { content: string | null; at: string | null }>()
    for (const row of (submissionsResult.data ?? []) as SubmissionRow[]) {
      if (!row.item_id) continue
      answerByTaskItem.set(`${row.student_task_id}:${row.item_id}`, {
        content: row.content,
        at: row.updated_at ?? row.created_at,
      })
    }

    for (const row of (taskItemsResult.data ?? []) as unknown as TaskItemRow[]) {
      const item = Array.isArray(row.workbook_items) ? row.workbook_items[0] : row.workbook_items
      if (!item) continue
      const answer = answerByTaskItem.get(`${row.student_task_id}:${item.id}`)
      const list = reviewItemsByTask.get(row.student_task_id) ?? []
      list.push({
        itemId: item.id,
        position: item.position,
        prompt: item.prompt,
        answer: answer?.content ?? null,
        answeredAt: answer?.at ?? null,
      })
      reviewItemsByTask.set(row.student_task_id, list)
    }

    for (const list of reviewItemsByTask.values()) {
      list.sort((a, b) => a.position - b.position)
    }
  }

  const rows: WritingAttemptRow[] = attempts.map((attempt) => {
    const profile = Array.isArray(attempt.profiles) ? attempt.profiles[0] : attempt.profiles
    const task = Array.isArray(attempt.student_tasks) ? attempt.student_tasks[0] : attempt.student_tasks

    return {
      attemptId: attempt.id,
      studentId: attempt.student_id,
      studentName: profile?.name ?? profile?.email ?? '이름 없음',
      className: classNameByStudent.get(attempt.student_id) ?? null,
      status: attempt.status,
      startedAt: attempt.started_at,
      deadlineAt: attempt.deadline_at,
      submittedAt: attempt.submitted_at,
      ocrText: attempt.ocr_text,
      ocrStatus: attempt.ocr_status,
      submissionImages: submissionImagesByAttempt.get(attempt.id) ?? [],
      studentTaskId: attempt.student_task_id,
      assignmentId: task?.assignment_id ?? null,
      taskStatus: task?.status ?? null,
      reviewItems: attempt.student_task_id ? reviewItemsByTask.get(attempt.student_task_id) ?? [] : [],
    }
  })

  rows.sort((a, b) => a.studentName.localeCompare(b.studentName, 'ko'))

  return {
    session: summary,
    set: {
      id: raw.set_id,
      title: setRow?.title ?? summary.setTitle,
      description: setRow?.description ?? null,
      timeLimitMinutes: (setRow?.time_limit_minutes as number | undefined) ?? summary.timeLimitMinutes,
      workbookId: (setRow?.workbook_id as string | null) ?? null,
      questions: questionMap.get(raw.set_id) ?? [],
      reviewQuestions: templateReviewQuestions,
    },
    rows,
  }
}

export async function fetchStudentWritingList(studentId: string): Promise<StudentWritingListItem[]> {
  const admin = createAdminClient()

  type Row = {
    id: string
    session_id: string
    status: WritingAttemptStatus
    deadline_at: string | null
    submitted_at: string | null
    student_task_id: string | null
    writing_sessions:
      | {
          id: string
          status: 'open' | 'closed'
          created_at: string
          writing_sets:
            | { title: string; description: string | null; time_limit_minutes: number }
            | { title: string; description: string | null; time_limit_minutes: number }[]
            | null
        }
      | Array<{
          id: string
          status: 'open' | 'closed'
          created_at: string
          writing_sets:
            | { title: string; description: string | null; time_limit_minutes: number }
            | { title: string; description: string | null; time_limit_minutes: number }[]
            | null
        }>
      | null
  }

  const { data, error } = await admin
    .from('writing_attempts')
    .select(
      `id, session_id, status, deadline_at, submitted_at, student_task_id,
       writing_sessions(id, status, created_at, writing_sets(title, description, time_limit_minutes))`
    )
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[writings] failed to fetch student writing list', error)
    return []
  }

  return ((data ?? []) as unknown as Row[]).map((row) => {
    const session = Array.isArray(row.writing_sessions) ? row.writing_sessions[0] : row.writing_sessions
    const set = session
      ? Array.isArray(session.writing_sets)
        ? session.writing_sets[0]
        : session.writing_sets
      : null

    return {
      sessionId: row.session_id,
      setTitle: set?.title ?? '제목 없음',
      setDescription: set?.description ?? null,
      timeLimitMinutes: set?.time_limit_minutes ?? 0,
      createdAt: session?.created_at ?? '',
      sessionStatus: session?.status ?? 'open',
      attemptStatus: row.status,
      deadlineAt: row.deadline_at,
      submittedAt: row.submitted_at,
      studentTaskId: row.student_task_id,
    }
  })
}

export async function fetchStudentWritingExam(
  sessionId: string,
  studentId: string
): Promise<StudentWritingExamData | null> {
  const admin = createAdminClient()

  type AttemptRow = {
    id: string
    status: WritingAttemptStatus
    started_at: string | null
    deadline_at: string | null
    submitted_at: string | null
    ocr_text: string | null
    ocr_status: WritingOcrStatus
    student_task_id: string | null
  }

  const { data: attemptRow, error: attemptError } = await admin
    .from('writing_attempts')
    .select('id, status, started_at, deadline_at, submitted_at, ocr_text, ocr_status, student_task_id')
    .eq('session_id', sessionId)
    .eq('student_id', studentId)
    .maybeSingle()

  if (attemptError || !attemptRow) {
    if (attemptError) console.error('[writings] failed to fetch student attempt', attemptError)
    return null
  }

  const attempt = attemptRow as unknown as AttemptRow

  type SessionRow = {
    id: string
    set_id: string
    status: 'open' | 'closed'
    writing_sets:
      | { title: string; description: string | null; time_limit_minutes: number }
      | { title: string; description: string | null; time_limit_minutes: number }[]
      | null
  }

  const { data: sessionRow, error: sessionError } = await admin
    .from('writing_sessions')
    .select('id, set_id, status, writing_sets(title, description, time_limit_minutes)')
    .eq('id', sessionId)
    .maybeSingle()

  if (sessionError || !sessionRow) {
    if (sessionError) console.error('[writings] failed to fetch session for student', sessionError)
    return null
  }

  const session = sessionRow as unknown as SessionRow
  const set = Array.isArray(session.writing_sets) ? session.writing_sets[0] : session.writing_sets

  // 시작 전에는 문항을 절대 노출하지 않는다
  const hasStarted = Boolean(attempt.started_at)
  const questionMap = hasStarted ? await fetchQuestionsForSets([session.set_id]) : new Map()

  const submissionImagesByAttempt =
    attempt.status === 'submitted' || attempt.status === 'task_created'
      ? await fetchSubmissionImagesForAttempts([attempt.id])
      : new Map<string, WritingSubmissionImage[]>()

  return {
    sessionId: session.id,
    attemptId: attempt.id,
    setTitle: set?.title ?? '제목 없음',
    setDescription: set?.description ?? null,
    timeLimitMinutes: set?.time_limit_minutes ?? 0,
    sessionStatus: session.status,
    attemptStatus: attempt.status,
    startedAt: attempt.started_at,
    deadlineAt: attempt.deadline_at,
    submittedAt: attempt.submitted_at,
    ocrText: attempt.ocr_text,
    ocrStatus: attempt.ocr_status,
    questions: questionMap.get(session.set_id) ?? [],
    submissionImages: submissionImagesByAttempt.get(attempt.id) ?? [],
    studentTaskId: attempt.student_task_id,
  }
}
