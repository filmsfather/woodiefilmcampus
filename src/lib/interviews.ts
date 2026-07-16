import { createAdminClient } from '@/lib/supabase/admin'
import type {
  InterviewAssignmentVideo,
  InterviewAttemptRow,
  InterviewAttemptStatus,
  InterviewQuestion,
  InterviewReviewItem,
  InterviewSessionDetail,
  InterviewSessionSummary,
  InterviewSetDetail,
  InterviewSetSummary,
  InterviewTaskVideoInfo,
  StudentInterviewDetail,
  StudentInterviewListItem,
} from '@/types/interview'

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
      console.error('[interviews] failed to create signed urls', error)
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

async function fetchQuestionsForSets(setIds: string[]): Promise<Map<string, InterviewQuestion[]>> {
  const result = new Map<string, InterviewQuestion[]>()
  if (setIds.length === 0) {
    return result
  }

  const admin = createAdminClient()

  const { data: questionRows, error: questionError } = await admin
    .from('interview_questions')
    .select('id, set_id, order_index, prompt')
    .in('set_id', setIds)
    .order('order_index', { ascending: true })

  if (questionError) {
    console.error('[interviews] failed to fetch questions', questionError)
    return result
  }

  const questions = (questionRows ?? []) as RawQuestionRow[]
  const questionIds = questions.map((row) => row.id)

  let assetRows: RawQuestionAssetRow[] = []
  if (questionIds.length > 0) {
    const { data, error } = await admin
      .from('interview_question_assets')
      .select('id, question_id, media_asset_id, order_index, media_assets(id, bucket, path)')
      .in('question_id', questionIds)
      .order('order_index', { ascending: true })

    if (error) {
      console.error('[interviews] failed to fetch question assets', error)
    }
    assetRows = (data ?? []) as unknown as RawQuestionAssetRow[]
  }

  const mediaRows: AssetRow[] = assetRows.map((row) => {
    const media = Array.isArray(row.media_assets) ? row.media_assets[0] : row.media_assets
    return { id: row.id, bucket: media?.bucket ?? null, path: media?.path ?? null }
  })
  const urlMap = await createSignedUrlMap(mediaRows)

  const assetsByQuestion = new Map<string, InterviewQuestion['assets']>()
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

export async function fetchInterviewSetSummaries(): Promise<InterviewSetSummary[]> {
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('interview_sets')
    .select(
      `id, title, description, created_at, workbook_id,
       profiles:profiles!interview_sets_created_by_fkey(name, email),
       interview_questions(id),
       interview_sessions(id)`
    )
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[interviews] failed to fetch interview sets', error)
    return []
  }

  type Row = {
    id: string
    title: string
    description: string | null
    created_at: string
    workbook_id: string | null
    profiles: { name: string | null; email: string | null } | { name: string | null; email: string | null }[] | null
    interview_questions: { id: string }[] | null
    interview_sessions: { id: string }[] | null
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
      console.error('[interviews] failed to fetch review question counts', itemError)
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
      createdAt: row.created_at,
      createdByName: creator?.name ?? creator?.email ?? null,
      questionCount: row.interview_questions?.length ?? 0,
      reviewQuestionCount: row.workbook_id ? reviewCountByWorkbook.get(row.workbook_id) ?? 0 : 0,
      sessionCount: row.interview_sessions?.length ?? 0,
    }
  })
}

type RawSessionRow = {
  id: string
  set_id: string
  status: 'open' | 'closed'
  created_at: string
  interview_sets: { id: string; title: string } | { id: string; title: string }[] | null
  profiles: { name: string | null; email: string | null } | { name: string | null; email: string | null }[] | null
  interview_session_targets: Array<{
    class_id: string | null
    student_id: string | null
    classes: { id: string; name: string | null } | { id: string; name: string | null }[] | null
    student:
      | { id: string; name: string | null; email: string | null }
      | { id: string; name: string | null; email: string | null }[]
      | null
  }> | null
  interview_attempts: Array<{ id: string; status: InterviewAttemptStatus }> | null
}

const SESSION_SELECT = `id, set_id, status, created_at,
  interview_sets(id, title),
  profiles:profiles!interview_sessions_created_by_fkey(name, email),
  interview_session_targets(
    class_id, student_id,
    classes(id, name),
    student:profiles!interview_session_targets_student_id_fkey(id, name, email)
  ),
  interview_attempts(id, status)`

function buildSessionSummary(row: RawSessionRow): InterviewSessionSummary {
  const set = Array.isArray(row.interview_sets) ? row.interview_sets[0] : row.interview_sets
  const creator = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles

  const targetLabels: string[] = []
  for (const target of row.interview_session_targets ?? []) {
    if (target.class_id) {
      const cls = Array.isArray(target.classes) ? target.classes[0] : target.classes
      targetLabels.push(cls?.name ?? '이름 없는 반')
    } else if (target.student_id) {
      const student = Array.isArray(target.student) ? target.student[0] : target.student
      targetLabels.push(student?.name ?? student?.email ?? '이름 없는 학생')
    }
  }

  const attempts = row.interview_attempts ?? []

  return {
    id: row.id,
    setId: row.set_id,
    setTitle: set?.title ?? '제목 없음',
    status: row.status,
    createdAt: row.created_at,
    createdByName: creator?.name ?? creator?.email ?? null,
    targetLabels,
    totalStudents: attempts.length,
    recordedCount: attempts.filter((attempt) => attempt.status === 'task_created').length,
  }
}

export async function fetchInterviewSessionSummaries(): Promise<InterviewSessionSummary[]> {
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('interview_sessions')
    .select(SESSION_SELECT)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[interviews] failed to fetch interview sessions', error)
    return []
  }

  return ((data ?? []) as unknown as RawSessionRow[]).map(buildSessionSummary)
}

export async function fetchInterviewSetDetail(setId: string): Promise<InterviewSetDetail | null> {
  const admin = createAdminClient()

  const { data: setRow, error } = await admin
    .from('interview_sets')
    .select('id, title, description, created_at, workbook_id')
    .eq('id', setId)
    .maybeSingle()

  if (error || !setRow) {
    if (error) console.error('[interviews] failed to fetch set detail', error)
    return null
  }

  const [questionMap, sessionResult] = await Promise.all([
    fetchQuestionsForSets([setId]),
    admin
      .from('interview_sessions')
      .select(SESSION_SELECT)
      .eq('set_id', setId)
      .order('created_at', { ascending: false }),
  ])

  if (sessionResult.error) {
    console.error('[interviews] failed to fetch sessions for set', sessionResult.error)
  }

  let reviewQuestions: InterviewSetDetail['reviewQuestions'] = []
  if (setRow.workbook_id) {
    const { data: itemRows, error: itemError } = await admin
      .from('workbook_items')
      .select('id, position, prompt')
      .eq('workbook_id', setRow.workbook_id)
      .order('position', { ascending: true })

    if (itemError) {
      console.error('[interviews] failed to fetch review questions', itemError)
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
    createdAt: setRow.created_at,
    workbookId: setRow.workbook_id,
    questions: questionMap.get(setId) ?? [],
    reviewQuestions,
    sessions: ((sessionResult.data ?? []) as unknown as RawSessionRow[]).map(buildSessionSummary),
  }
}

export async function fetchInterviewSessionDetail(sessionId: string): Promise<InterviewSessionDetail | null> {
  const admin = createAdminClient()

  const { data: sessionRow, error } = await admin
    .from('interview_sessions')
    .select(SESSION_SELECT)
    .eq('id', sessionId)
    .maybeSingle()

  if (error || !sessionRow) {
    if (error) console.error('[interviews] failed to fetch session detail', error)
    return null
  }

  const raw = sessionRow as unknown as RawSessionRow
  const summary = buildSessionSummary(raw)

  const { data: setRow } = await admin
    .from('interview_sets')
    .select('id, title, description, workbook_id')
    .eq('id', raw.set_id)
    .maybeSingle()

  const templateWorkbookId = (setRow?.workbook_id as string | null) ?? null

  const questionMap = await fetchQuestionsForSets([raw.set_id])

  type AttemptDetailRow = {
    id: string
    student_id: string
    status: InterviewAttemptStatus
    recorded_at: string | null
    student_task_id: string | null
    video_media_asset_id: string | null
    profiles: { id: string; name: string | null; email: string | null } | { id: string; name: string | null; email: string | null }[] | null
    media_assets: { id: string; bucket: string | null; path: string | null } | { id: string; bucket: string | null; path: string | null }[] | null
    student_tasks:
      | { id: string; assignment_id: string; status: string | null; assignments: { workbook_id: string | null } | { workbook_id: string | null }[] | null }
      | Array<{ id: string; assignment_id: string; status: string | null; assignments: { workbook_id: string | null } | { workbook_id: string | null }[] | null }>
      | null
  }

  const { data: attemptData, error: attemptError } = await admin
    .from('interview_attempts')
    .select(
      `id, student_id, status, recorded_at, student_task_id, video_media_asset_id,
       profiles:profiles!interview_attempts_student_id_fkey(id, name, email),
       media_assets:media_assets!interview_attempts_video_media_asset_id_fkey(id, bucket, path),
       student_tasks:student_tasks!interview_attempts_student_task_id_fkey(id, assignment_id, status, assignments(workbook_id))`
    )
    .eq('session_id', sessionId)

  if (attemptError) {
    console.error('[interviews] failed to fetch attempts', attemptError)
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
      console.error('[interviews] failed to fetch student classes', memberError)
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

  const videoRows: AssetRow[] = attempts.map((attempt) => {
    const media = Array.isArray(attempt.media_assets) ? attempt.media_assets[0] : attempt.media_assets
    return { id: attempt.id, bucket: media?.bucket ?? null, path: media?.path ?? null }
  })
  const videoUrlMap = await createSignedUrlMap(videoRows)

  // 복기 과제 문항 + 학생 답변
  const taskIds = attempts
    .map((attempt) => attempt.student_task_id)
    .filter((id): id is string => Boolean(id))

  const reviewItemsByTask = new Map<string, InterviewReviewItem[]>()
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
      console.error('[interviews] failed to fetch review task items', taskItemsResult.error)
    }
    if (submissionsResult.error) {
      console.error('[interviews] failed to fetch review submissions', submissionsResult.error)
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

  const rows: InterviewAttemptRow[] = attempts.map((attempt) => {
    const profile = Array.isArray(attempt.profiles) ? attempt.profiles[0] : attempt.profiles
    const task = Array.isArray(attempt.student_tasks) ? attempt.student_tasks[0] : attempt.student_tasks
    const taskAssignment = task
      ? Array.isArray(task.assignments)
        ? task.assignments[0]
        : task.assignments
      : null
    const taskWorkbookId = taskAssignment?.workbook_id ?? null

    return {
      attemptId: attempt.id,
      studentId: attempt.student_id,
      studentName: profile?.name ?? profile?.email ?? '이름 없음',
      className: classNameByStudent.get(attempt.student_id) ?? null,
      status: attempt.status,
      recordedAt: attempt.recorded_at,
      studentTaskId: attempt.student_task_id,
      assignmentId: task?.assignment_id ?? null,
      taskStatus: task?.status ?? null,
      videoUrl: videoUrlMap.get(attempt.id) ?? null,
      reviewItems: attempt.student_task_id ? reviewItemsByTask.get(attempt.student_task_id) ?? [] : [],
      canAddQuestion: Boolean(
        taskWorkbookId && (!templateWorkbookId || taskWorkbookId !== templateWorkbookId)
      ),
    }
  })

  rows.sort((a, b) => a.studentName.localeCompare(b.studentName, 'ko'))

  return {
    session: summary,
    set: {
      id: raw.set_id,
      title: setRow?.title ?? summary.setTitle,
      description: setRow?.description ?? null,
      questions: questionMap.get(raw.set_id) ?? [],
    },
    rows,
  }
}

export async function fetchStudentInterviewList(studentId: string): Promise<StudentInterviewListItem[]> {
  const admin = createAdminClient()

  type Row = {
    id: string
    session_id: string
    status: InterviewAttemptStatus
    recorded_at: string | null
    student_task_id: string | null
    interview_sessions:
      | {
          id: string
          status: 'open' | 'closed'
          created_at: string
          interview_sets: { title: string; description: string | null } | { title: string; description: string | null }[] | null
        }
      | Array<{
          id: string
          status: 'open' | 'closed'
          created_at: string
          interview_sets: { title: string; description: string | null } | { title: string; description: string | null }[] | null
        }>
      | null
  }

  const { data, error } = await admin
    .from('interview_attempts')
    .select(
      `id, session_id, status, recorded_at, student_task_id,
       interview_sessions(id, status, created_at, interview_sets(title, description))`
    )
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[interviews] failed to fetch student interview list', error)
    return []
  }

  return ((data ?? []) as unknown as Row[]).map((row) => {
    const session = Array.isArray(row.interview_sessions) ? row.interview_sessions[0] : row.interview_sessions
    const set = session
      ? Array.isArray(session.interview_sets)
        ? session.interview_sets[0]
        : session.interview_sets
      : null

    return {
      sessionId: row.session_id,
      setTitle: set?.title ?? '제목 없음',
      setDescription: set?.description ?? null,
      createdAt: session?.created_at ?? '',
      sessionStatus: session?.status ?? 'open',
      attemptStatus: row.status,
      recordedAt: row.recorded_at,
      studentTaskId: row.student_task_id,
    }
  })
}

export async function fetchStudentInterviewDetail(
  sessionId: string,
  studentId: string
): Promise<StudentInterviewDetail | null> {
  const admin = createAdminClient()

  type AttemptRow = {
    id: string
    status: InterviewAttemptStatus
    recorded_at: string | null
    student_task_id: string | null
    video_media_asset_id: string | null
    media_assets: { id: string; bucket: string | null; path: string | null } | { id: string; bucket: string | null; path: string | null }[] | null
  }

  const { data: attemptRow, error: attemptError } = await admin
    .from('interview_attempts')
    .select(
      `id, status, recorded_at, student_task_id, video_media_asset_id,
       media_assets:media_assets!interview_attempts_video_media_asset_id_fkey(id, bucket, path)`
    )
    .eq('session_id', sessionId)
    .eq('student_id', studentId)
    .maybeSingle()

  if (attemptError || !attemptRow) {
    if (attemptError) console.error('[interviews] failed to fetch student attempt', attemptError)
    return null
  }

  const attempt = attemptRow as unknown as AttemptRow

  type SessionRow = {
    id: string
    set_id: string
    status: 'open' | 'closed'
    interview_sets: { title: string; description: string | null } | { title: string; description: string | null }[] | null
  }

  const { data: sessionRow, error: sessionError } = await admin
    .from('interview_sessions')
    .select('id, set_id, status, interview_sets(title, description)')
    .eq('id', sessionId)
    .maybeSingle()

  if (sessionError || !sessionRow) {
    if (sessionError) console.error('[interviews] failed to fetch session for student', sessionError)
    return null
  }

  const session = sessionRow as unknown as SessionRow
  const set = Array.isArray(session.interview_sets) ? session.interview_sets[0] : session.interview_sets

  const questionMap = await fetchQuestionsForSets([session.set_id])

  const media = Array.isArray(attempt.media_assets) ? attempt.media_assets[0] : attempt.media_assets
  let videoUrl: string | null = null
  if (media?.bucket && media?.path) {
    const urlMap = await createSignedUrlMap([{ id: attempt.id, bucket: media.bucket, path: media.path }])
    videoUrl = urlMap.get(attempt.id) ?? null
  }

  return {
    sessionId: session.id,
    setTitle: set?.title ?? '제목 없음',
    setDescription: set?.description ?? null,
    sessionStatus: session.status,
    questions: questionMap.get(session.set_id) ?? [],
    attemptStatus: attempt.status,
    recordedAt: attempt.recorded_at,
    studentTaskId: attempt.student_task_id,
    videoUrl,
  }
}

/**
 * 학생 과제 상세 화면에서 해당 과제가 모의 면접 복기 과제인지 확인하고 영상 정보를 반환.
 */
export async function fetchInterviewVideoForTask(
  studentTaskId: string,
  studentId: string
): Promise<InterviewTaskVideoInfo | null> {
  const admin = createAdminClient()

  type Row = {
    id: string
    student_id: string
    recorded_at: string | null
    media_assets: { id: string; bucket: string | null; path: string | null } | { id: string; bucket: string | null; path: string | null }[] | null
    interview_sessions:
      | { interview_sets: { title: string } | { title: string }[] | null }
      | Array<{ interview_sets: { title: string } | { title: string }[] | null }>
      | null
  }

  const { data, error } = await admin
    .from('interview_attempts')
    .select(
      `id, student_id, recorded_at,
       media_assets:media_assets!interview_attempts_video_media_asset_id_fkey(id, bucket, path),
       interview_sessions(interview_sets(title))`
    )
    .eq('student_task_id', studentTaskId)
    .maybeSingle()

  if (error || !data) {
    if (error) console.error('[interviews] failed to fetch interview video for task', error)
    return null
  }

  const row = data as unknown as Row
  if (row.student_id !== studentId) {
    return null
  }

  const media = Array.isArray(row.media_assets) ? row.media_assets[0] : row.media_assets
  let videoUrl: string | null = null
  if (media?.bucket && media?.path) {
    const urlMap = await createSignedUrlMap([{ id: row.id, bucket: media.bucket, path: media.path }])
    videoUrl = urlMap.get(row.id) ?? null
  }

  const session = Array.isArray(row.interview_sessions) ? row.interview_sessions[0] : row.interview_sessions
  const set = session ? (Array.isArray(session.interview_sets) ? session.interview_sets[0] : session.interview_sets) : null

  return {
    attemptId: row.id,
    setTitle: set?.title ?? '모의 면접',
    recordedAt: row.recorded_at,
    videoUrl,
  }
}

/**
 * 교사 과제 상세 화면용: 해당 과제가 모의 면접 복기 과제라면 학생별 면접 영상 정보를 반환.
 */
export async function fetchInterviewVideosForAssignment(assignmentId: string): Promise<InterviewAssignmentVideo[]> {
  const admin = createAdminClient()

  const { data: taskRows, error: taskError } = await admin
    .from('student_tasks')
    .select('id')
    .eq('assignment_id', assignmentId)

  if (taskError || !taskRows || taskRows.length === 0) {
    if (taskError) console.error('[interviews] failed to fetch tasks for assignment videos', taskError)
    return []
  }

  const taskIds = taskRows.map((row) => row.id as string)

  type Row = {
    id: string
    student_task_id: string
    recorded_at: string | null
    profiles: { name: string | null; email: string | null } | { name: string | null; email: string | null }[] | null
    media_assets: { id: string; bucket: string | null; path: string | null } | { id: string; bucket: string | null; path: string | null }[] | null
    interview_sessions:
      | { interview_sets: { title: string } | { title: string }[] | null }
      | Array<{ interview_sets: { title: string } | { title: string }[] | null }>
      | null
  }

  const { data, error } = await admin
    .from('interview_attempts')
    .select(
      `id, student_task_id, recorded_at,
       profiles:profiles!interview_attempts_student_id_fkey(name, email),
       media_assets:media_assets!interview_attempts_video_media_asset_id_fkey(id, bucket, path),
       interview_sessions(interview_sets(title))`
    )
    .in('student_task_id', taskIds)

  if (error || !data || data.length === 0) {
    if (error) console.error('[interviews] failed to fetch interview videos for assignment', error)
    return []
  }

  const rows = data as unknown as Row[]

  const assetRows: AssetRow[] = rows.map((row) => {
    const media = Array.isArray(row.media_assets) ? row.media_assets[0] : row.media_assets
    return { id: row.id, bucket: media?.bucket ?? null, path: media?.path ?? null }
  })
  const urlMap = await createSignedUrlMap(assetRows)

  return rows.map((row) => {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles
    const session = Array.isArray(row.interview_sessions) ? row.interview_sessions[0] : row.interview_sessions
    const set = session
      ? Array.isArray(session.interview_sets)
        ? session.interview_sets[0]
        : session.interview_sets
      : null

    return {
      attemptId: row.id,
      studentTaskId: row.student_task_id,
      studentName: profile?.name ?? profile?.email ?? '이름 없음',
      setTitle: set?.title ?? '모의 면접',
      recordedAt: row.recorded_at,
      videoUrl: urlMap.get(row.id) ?? null,
    }
  })
}

export async function fetchClassOptionsForInterview(teacherId: string, role: string) {
  const admin = createAdminClient()

  type ClassRow = {
    id: string
    name: string | null
    class_students: Array<{
      student_id: string
      profiles: { id: string; name: string | null; email: string | null } | { id: string; name: string | null; email: string | null }[] | null
    }> | null
  }

  let classIds: string[] | null = null

  if (role === 'teacher') {
    const { data: teacherClassRows, error: teacherClassError } = await admin
      .from('class_teachers')
      .select('class_id')
      .eq('teacher_id', teacherId)

    if (teacherClassError) {
      console.error('[interviews] failed to fetch teacher classes', teacherClassError)
      return []
    }

    classIds = Array.from(
      new Set((teacherClassRows ?? []).map((row) => row.class_id).filter((id): id is string => Boolean(id)))
    )

    if (classIds.length === 0) {
      return []
    }
  }

  let query = admin
    .from('classes')
    .select('id, name, class_students(student_id, profiles:profiles!class_students_student_id_fkey(id, name, email))')
    .order('name', { ascending: true })

  if (classIds) {
    query = query.in('id', classIds)
  }

  const { data, error } = await query

  if (error) {
    console.error('[interviews] failed to fetch class options', error)
    return []
  }

  return ((data ?? []) as unknown as ClassRow[]).map((row) => ({
    id: row.id,
    name: row.name ?? '이름 없는 반',
    students: (row.class_students ?? [])
      .map((member) => {
        const profile = Array.isArray(member.profiles) ? member.profiles[0] : member.profiles
        return {
          id: member.student_id,
          name: profile?.name ?? profile?.email ?? '이름 없음',
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'ko')),
  }))
}
