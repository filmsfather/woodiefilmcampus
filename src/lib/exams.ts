import { createAdminClient } from '@/lib/supabase/admin'
import type {
  ExamDetail,
  ExamQuestion,
  ExamSessionDetail,
  ExamSessionSummary,
  ExamSummary,
  ExamReviewTaskView,
  PrincipalReviewTaskListItem,
  ReviewTaskDetailForPrincipal,
  SessionAttemptRow,
  StudentExamListItem,
  StudentExamRunnerData,
  StudentReviewTaskDetail,
  StudentReviewTaskListItem,
} from '@/types/exam'

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
      console.error('[exams] failed to create signed urls', error)
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
  exam_id: string
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

type RawReviewQuestionRow = {
  id: string
  exam_question_id: string
  order_index: number
  prompt: string
  requires_image: boolean
}

async function fetchQuestionsForExams(examIds: string[]): Promise<Map<string, ExamQuestion[]>> {
  const result = new Map<string, ExamQuestion[]>()
  if (examIds.length === 0) {
    return result
  }

  const admin = createAdminClient()

  const { data: questionRows, error: questionError } = await admin
    .from('exam_questions')
    .select('id, exam_id, order_index, prompt')
    .in('exam_id', examIds)
    .order('order_index', { ascending: true })

  if (questionError) {
    console.error('[exams] failed to fetch exam questions', questionError)
    return result
  }

  const questions = (questionRows ?? []) as RawQuestionRow[]
  const questionIds = questions.map((row) => row.id)

  let assetRows: RawQuestionAssetRow[] = []
  let reviewRows: RawReviewQuestionRow[] = []

  if (questionIds.length > 0) {
    const [assetResult, reviewResult] = await Promise.all([
      admin
        .from('exam_question_assets')
        .select('id, question_id, media_asset_id, order_index, media_assets(id, bucket, path)')
        .in('question_id', questionIds)
        .order('order_index', { ascending: true }),
      admin
        .from('exam_review_questions')
        .select('id, exam_question_id, order_index, prompt, requires_image')
        .in('exam_question_id', questionIds)
        .order('order_index', { ascending: true }),
    ])

    if (assetResult.error) {
      console.error('[exams] failed to fetch question assets', assetResult.error)
    }
    if (reviewResult.error) {
      console.error('[exams] failed to fetch review question templates', reviewResult.error)
    }

    assetRows = (assetResult.data ?? []) as unknown as RawQuestionAssetRow[]
    reviewRows = (reviewResult.data ?? []) as RawReviewQuestionRow[]
  }

  const mediaRows: AssetRow[] = assetRows.map((row) => {
    const media = Array.isArray(row.media_assets) ? row.media_assets[0] : row.media_assets
    return { id: row.id, bucket: media?.bucket ?? null, path: media?.path ?? null }
  })
  const urlMap = await createSignedUrlMap(mediaRows)

  const assetsByQuestion = new Map<string, ExamQuestion['assets']>()
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

  const reviewByQuestion = new Map<string, ExamQuestion['reviewQuestions']>()
  for (const row of reviewRows) {
    const list = reviewByQuestion.get(row.exam_question_id) ?? []
    list.push({
      id: row.id,
      orderIndex: row.order_index,
      prompt: row.prompt,
      requiresImage: row.requires_image,
    })
    reviewByQuestion.set(row.exam_question_id, list)
  }

  for (const row of questions) {
    const list = result.get(row.exam_id) ?? []
    list.push({
      id: row.id,
      orderIndex: row.order_index,
      prompt: row.prompt,
      assets: assetsByQuestion.get(row.id) ?? [],
      reviewQuestions: reviewByQuestion.get(row.id) ?? [],
    })
    result.set(row.exam_id, list)
  }

  return result
}

export async function fetchExamSummaries(): Promise<ExamSummary[]> {
  const admin = createAdminClient()

  const { data: examRows, error } = await admin
    .from('exams')
    .select('id, title, description, created_at, exam_questions(id), exam_sessions(id, status)')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[exams] failed to fetch exams', error)
    return []
  }

  type Row = {
    id: string
    title: string
    description: string | null
    created_at: string
    exam_questions: { id: string }[] | null
    exam_sessions: { id: string; status: string }[] | null
  }

  return ((examRows ?? []) as Row[]).map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    createdAt: row.created_at,
    questionCount: row.exam_questions?.length ?? 0,
    sessionCount: row.exam_sessions?.length ?? 0,
    openSessionCount: row.exam_sessions?.filter((session) => session.status === 'open').length ?? 0,
  }))
}

type RawSessionRow = {
  id: string
  exam_id: string
  duration_minutes: number
  opens_at: string
  closes_at: string
  status: 'open' | 'closed'
  created_at: string
  exams: { id: string; title: string } | { id: string; title: string }[] | null
  exam_session_targets: Array<{
    class_id: string | null
    student_id: string | null
    classes: { id: string; name: string | null } | { id: string; name: string | null }[] | null
    profiles:
      | { id: string; name: string | null; email: string | null }
      | { id: string; name: string | null; email: string | null }[]
      | null
  }> | null
}

async function buildSessionSummaries(rows: RawSessionRow[]): Promise<ExamSessionSummary[]> {
  const admin = createAdminClient()
  const sessionIds = rows.map((row) => row.id)
  const classIdSet = new Set<string>()
  for (const row of rows) {
    for (const target of row.exam_session_targets ?? []) {
      if (target.class_id) {
        classIdSet.add(target.class_id)
      }
    }
  }

  const memberByClass = new Map<string, string[]>()
  if (classIdSet.size > 0) {
    const { data: memberRows, error } = await admin
      .from('class_students')
      .select('class_id, student_id')
      .in('class_id', Array.from(classIdSet))

    if (error) {
      console.error('[exams] failed to fetch class members', error)
    }

    for (const row of (memberRows ?? []) as Array<{ class_id: string; student_id: string }>) {
      const list = memberByClass.get(row.class_id) ?? []
      list.push(row.student_id)
      memberByClass.set(row.class_id, list)
    }
  }

  type AttemptRow = {
    id: string
    session_id: string
    submitted_at: string | null
    result: string
  }

  let attemptRows: AttemptRow[] = []
  if (sessionIds.length > 0) {
    const { data, error } = await admin
      .from('exam_attempts')
      .select('id, session_id, submitted_at, result')
      .in('session_id', sessionIds)

    if (error) {
      console.error('[exams] failed to fetch attempts for summaries', error)
    }
    attemptRows = (data ?? []) as AttemptRow[]
  }

  const attemptsBySession = new Map<string, AttemptRow[]>()
  for (const row of attemptRows) {
    const list = attemptsBySession.get(row.session_id) ?? []
    list.push(row)
    attemptsBySession.set(row.session_id, list)
  }

  return rows.map((row) => {
    const exam = Array.isArray(row.exams) ? row.exams[0] : row.exams
    const classNames: string[] = []
    const studentNames: string[] = []
    const studentIdSet = new Set<string>()

    for (const target of row.exam_session_targets ?? []) {
      if (target.class_id) {
        const cls = Array.isArray(target.classes) ? target.classes[0] : target.classes
        if (cls?.name) {
          classNames.push(cls.name)
        }
        for (const studentId of memberByClass.get(target.class_id) ?? []) {
          studentIdSet.add(studentId)
        }
      } else if (target.student_id) {
        const profile = Array.isArray(target.profiles) ? target.profiles[0] : target.profiles
        studentNames.push(profile?.name ?? profile?.email ?? '이름 없음')
        studentIdSet.add(target.student_id)
      }
    }

    const attempts = attemptsBySession.get(row.id) ?? []
    const submitted = attempts.filter((attempt) => attempt.submitted_at)

    return {
      id: row.id,
      examId: row.exam_id,
      examTitle: exam?.title ?? '제목 없음',
      durationMinutes: row.duration_minutes,
      opensAt: row.opens_at,
      closesAt: row.closes_at,
      status: row.status,
      classNames: classNames.sort((a, b) => a.localeCompare(b, 'ko')),
      studentNames: studentNames.sort((a, b) => a.localeCompare(b, 'ko')),
      totalStudents: studentIdSet.size,
      submittedCount: submitted.length,
      pendingEvaluationCount: submitted.filter((attempt) => attempt.result === 'pending').length,
      createdAt: row.created_at,
    }
  })
}

const SESSION_SELECT = `id, exam_id, duration_minutes, opens_at, closes_at, status, created_at,
  exams(id, title),
  exam_session_targets(class_id, student_id, classes(id, name), profiles:profiles!exam_session_targets_student_id_fkey(id, name, email))`

export async function fetchExamSessionSummaries(): Promise<ExamSessionSummary[]> {
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('exam_sessions')
    .select(SESSION_SELECT)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[exams] failed to fetch exam sessions', error)
    return []
  }

  return buildSessionSummaries((data ?? []) as unknown as RawSessionRow[])
}

export async function fetchExamDetail(examId: string): Promise<ExamDetail | null> {
  const admin = createAdminClient()

  const { data: examRow, error } = await admin
    .from('exams')
    .select('id, title, description, created_at')
    .eq('id', examId)
    .maybeSingle()

  if (error || !examRow) {
    if (error) console.error('[exams] failed to fetch exam detail', error)
    return null
  }

  const { data: sessionRows, error: sessionError } = await admin
    .from('exam_sessions')
    .select(SESSION_SELECT)
    .eq('exam_id', examId)
    .order('created_at', { ascending: false })

  if (sessionError) {
    console.error('[exams] failed to fetch sessions for exam', sessionError)
  }

  const [questionMap, sessions] = await Promise.all([
    fetchQuestionsForExams([examId]),
    buildSessionSummaries((sessionRows ?? []) as unknown as RawSessionRow[]),
  ])

  return {
    id: examRow.id,
    title: examRow.title,
    description: examRow.description,
    createdAt: examRow.created_at,
    questions: questionMap.get(examId) ?? [],
    sessions,
  }
}

type RawReviewItemRow = {
  id: string
  review_task_id: string
  exam_question_id: string | null
  order_index: number
  prompt: string
  requires_image: boolean
  answer_content: string | null
  result: 'pending' | 'pass' | 'nonpass'
  feedback: string | null
}

type RawReviewItemAssetRow = {
  id: string
  item_id: string
  media_asset_id: string
  order_index: number
  caption: string | null
  media_assets: { id: string; bucket: string | null; path: string | null } | { id: string; bucket: string | null; path: string | null }[] | null
}

async function fetchReviewTaskViews(taskIds: string[]): Promise<Map<string, ExamReviewTaskView>> {
  const result = new Map<string, ExamReviewTaskView>()
  if (taskIds.length === 0) {
    return result
  }

  const admin = createAdminClient()

  type TaskRow = {
    id: string
    attempt_id: string
    status: 'assigned' | 'submitted' | 'partial' | 'pass'
    assigned_at: string
    submitted_at: string | null
    evaluated_at: string | null
  }

  const { data: taskRows, error: taskError } = await admin
    .from('exam_review_tasks')
    .select('id, attempt_id, status, assigned_at, submitted_at, evaluated_at')
    .in('id', taskIds)

  if (taskError) {
    console.error('[exams] failed to fetch review tasks', taskError)
    return result
  }

  const tasks = (taskRows ?? []) as TaskRow[]

  const { data: itemRows, error: itemError } = await admin
    .from('exam_review_items')
    .select('id, review_task_id, exam_question_id, order_index, prompt, requires_image, answer_content, result, feedback')
    .in('review_task_id', taskIds)
    .order('order_index', { ascending: true })

  if (itemError) {
    console.error('[exams] failed to fetch review items', itemError)
  }

  const items = (itemRows ?? []) as RawReviewItemRow[]
  const itemIds = items.map((item) => item.id)
  const questionIds = Array.from(
    new Set(items.map((item) => item.exam_question_id).filter((id): id is string => Boolean(id)))
  )
  const attemptIdByTask = new Map(tasks.map((row) => [row.id, row.attempt_id]))
  const attemptIds = Array.from(new Set(tasks.map((row) => row.attempt_id)))

  let assetRows: RawReviewItemAssetRow[] = []
  if (itemIds.length > 0) {
    const { data, error } = await admin
      .from('exam_review_item_assets')
      .select('id, item_id, media_asset_id, order_index, caption, media_assets(id, bucket, path)')
      .in('item_id', itemIds)
      .order('order_index', { ascending: true })

    if (error) {
      console.error('[exams] failed to fetch review item assets', error)
    }
    assetRows = (data ?? []) as unknown as RawReviewItemAssetRow[]
  }

  // 원본 시험 문항 + 문항 이미지 + 응시 당시 답안
  type QuestionRow = { id: string; order_index: number; prompt: string }
  type AnswerRow = { attempt_id: string; question_id: string; content: string | null }

  let questionRows: QuestionRow[] = []
  let questionAssetRows: RawQuestionAssetRow[] = []
  let answerRows: AnswerRow[] = []

  if (questionIds.length > 0) {
    const [questionResult, questionAssetResult, answerResult] = await Promise.all([
      admin
        .from('exam_questions')
        .select('id, order_index, prompt')
        .in('id', questionIds),
      admin
        .from('exam_question_assets')
        .select('id, question_id, media_asset_id, order_index, media_assets(id, bucket, path)')
        .in('question_id', questionIds)
        .order('order_index', { ascending: true }),
      admin
        .from('exam_answers')
        .select('attempt_id, question_id, content')
        .in('attempt_id', attemptIds)
        .in('question_id', questionIds),
    ])

    if (questionResult.error) {
      console.error('[exams] failed to fetch original questions for review', questionResult.error)
    }
    if (questionAssetResult.error) {
      console.error('[exams] failed to fetch original question assets for review', questionAssetResult.error)
    }
    if (answerResult.error) {
      console.error('[exams] failed to fetch original answers for review', answerResult.error)
    }

    questionRows = (questionResult.data ?? []) as QuestionRow[]
    questionAssetRows = (questionAssetResult.data ?? []) as unknown as RawQuestionAssetRow[]
    answerRows = (answerResult.data ?? []) as AnswerRow[]
  }

  const mediaRows: AssetRow[] = [
    ...assetRows.map((row) => {
      const media = Array.isArray(row.media_assets) ? row.media_assets[0] : row.media_assets
      return { id: row.id, bucket: media?.bucket ?? null, path: media?.path ?? null }
    }),
    ...questionAssetRows.map((row) => {
      const media = Array.isArray(row.media_assets) ? row.media_assets[0] : row.media_assets
      return { id: row.id, bucket: media?.bucket ?? null, path: media?.path ?? null }
    }),
  ]
  const urlMap = await createSignedUrlMap(mediaRows)

  const assetsByItem = new Map<string, ExamReviewTaskView['items'][number]['assets']>()
  for (const row of assetRows) {
    const list = assetsByItem.get(row.item_id) ?? []
    list.push({
      id: row.id,
      mediaAssetId: row.media_asset_id,
      orderIndex: row.order_index,
      caption: row.caption,
      url: urlMap.get(row.id) ?? null,
    })
    assetsByItem.set(row.item_id, list)
  }

  const questionAssetsByQuestion = new Map<string, ExamQuestion['assets']>()
  for (const row of questionAssetRows) {
    const list = questionAssetsByQuestion.get(row.question_id) ?? []
    list.push({
      id: row.id,
      mediaAssetId: row.media_asset_id,
      orderIndex: row.order_index,
      url: urlMap.get(row.id) ?? null,
    })
    questionAssetsByQuestion.set(row.question_id, list)
  }

  const questionById = new Map(questionRows.map((row) => [row.id, row]))
  const answerByAttemptQuestion = new Map(
    answerRows.map((row) => [`${row.attempt_id}:${row.question_id}`, row.content])
  )

  const itemsByTask = new Map<string, ExamReviewTaskView['items']>()
  for (const row of items) {
    const question = row.exam_question_id ? questionById.get(row.exam_question_id) : null
    const attemptId = attemptIdByTask.get(row.review_task_id)

    const list = itemsByTask.get(row.review_task_id) ?? []
    list.push({
      id: row.id,
      examQuestionId: row.exam_question_id,
      orderIndex: row.order_index,
      prompt: row.prompt,
      requiresImage: row.requires_image,
      answerContent: row.answer_content,
      result: row.result,
      feedback: row.feedback,
      assets: assetsByItem.get(row.id) ?? [],
      examQuestion: question
        ? {
            orderIndex: question.order_index,
            prompt: question.prompt,
            assets: questionAssetsByQuestion.get(question.id) ?? [],
            originalAnswer:
              attemptId && row.exam_question_id
                ? answerByAttemptQuestion.get(`${attemptId}:${row.exam_question_id}`) ?? null
                : null,
          }
        : null,
    })
    itemsByTask.set(row.review_task_id, list)
  }

  for (const row of tasks) {
    result.set(row.id, {
      id: row.id,
      attemptId: row.attempt_id,
      status: row.status,
      assignedAt: row.assigned_at,
      submittedAt: row.submitted_at,
      evaluatedAt: row.evaluated_at,
      items: itemsByTask.get(row.id) ?? [],
    })
  }

  return result
}

export async function fetchExamSessionDetail(sessionId: string): Promise<ExamSessionDetail | null> {
  const admin = createAdminClient()

  const { data: sessionRow, error } = await admin
    .from('exam_sessions')
    .select(SESSION_SELECT)
    .eq('id', sessionId)
    .maybeSingle()

  if (error || !sessionRow) {
    if (error) console.error('[exams] failed to fetch session detail', error)
    return null
  }

  const raw = sessionRow as unknown as RawSessionRow
  const [summary] = await buildSessionSummaries([raw])

  const examRelation = Array.isArray(raw.exams) ? raw.exams[0] : raw.exams
  const examId = raw.exam_id

  const { data: examRow } = await admin
    .from('exams')
    .select('id, title, description')
    .eq('id', examId)
    .maybeSingle()

  const questionMap = await fetchQuestionsForExams([examId])
  const questions = questionMap.get(examId) ?? []

  // 대상 반 학생 로스터
  const classIds = (raw.exam_session_targets ?? [])
    .map((target) => target.class_id)
    .filter((id): id is string => Boolean(id))
  type MemberRow = {
    class_id: string
    student_id: string
    classes: { name: string | null } | { name: string | null }[] | null
    profiles: { id: string; name: string | null; email: string | null } | { id: string; name: string | null; email: string | null }[] | null
  }

  let memberRows: MemberRow[] = []
  if (classIds.length > 0) {
    const { data, error: memberError } = await admin
      .from('class_students')
      .select('class_id, student_id, classes(name), profiles:profiles!class_students_student_id_fkey(id, name, email)')
      .in('class_id', classIds)

    if (memberError) {
      console.error('[exams] failed to fetch session roster', memberError)
    }
    memberRows = (data ?? []) as unknown as MemberRow[]
  }

  type AttemptRow = {
    id: string
    student_id: string
    started_at: string | null
    submitted_at: string | null
    result: 'pending' | 'pass' | 'nonpass'
  }

  const { data: attemptData, error: attemptError } = await admin
    .from('exam_attempts')
    .select('id, student_id, started_at, submitted_at, result')
    .eq('session_id', sessionId)

  if (attemptError) {
    console.error('[exams] failed to fetch session attempts', attemptError)
  }

  const attempts = (attemptData ?? []) as AttemptRow[]
  const attemptByStudent = new Map(attempts.map((attempt) => [attempt.student_id, attempt]))
  const attemptIds = attempts.map((attempt) => attempt.id)

  type AnswerRow = { attempt_id: string; question_id: string; content: string | null }
  let answerRows: AnswerRow[] = []
  if (attemptIds.length > 0) {
    const { data, error: answerError } = await admin
      .from('exam_answers')
      .select('attempt_id, question_id, content')
      .in('attempt_id', attemptIds)

    if (answerError) {
      console.error('[exams] failed to fetch answers', answerError)
    }
    answerRows = (data ?? []) as AnswerRow[]
  }

  const answersByAttempt = new Map<string, AnswerRow[]>()
  for (const row of answerRows) {
    const list = answersByAttempt.get(row.attempt_id) ?? []
    list.push(row)
    answersByAttempt.set(row.attempt_id, list)
  }

  type ReviewTaskRow = { id: string; attempt_id: string; status: 'assigned' | 'submitted' | 'partial' | 'pass'; submitted_at: string | null }
  let reviewTaskRows: ReviewTaskRow[] = []
  if (attemptIds.length > 0) {
    const { data, error: reviewError } = await admin
      .from('exam_review_tasks')
      .select('id, attempt_id, status, submitted_at')
      .in('attempt_id', attemptIds)

    if (reviewError) {
      console.error('[exams] failed to fetch review tasks for session', reviewError)
    }
    reviewTaskRows = (data ?? []) as ReviewTaskRow[]
  }
  const reviewByAttempt = new Map(reviewTaskRows.map((row) => [row.attempt_id, row]))

  const seenStudents = new Set<string>()
  const rows: SessionAttemptRow[] = []

  for (const member of memberRows) {
    if (seenStudents.has(member.student_id)) continue
    seenStudents.add(member.student_id)

    const profile = Array.isArray(member.profiles) ? member.profiles[0] : member.profiles
    const cls = Array.isArray(member.classes) ? member.classes[0] : member.classes
    const attempt = attemptByStudent.get(member.student_id) ?? null
    const reviewTask = attempt ? reviewByAttempt.get(attempt.id) ?? null : null

    rows.push({
      attemptId: attempt?.id ?? null,
      studentId: member.student_id,
      studentName: profile?.name ?? profile?.email ?? '이름 없음',
      className: cls?.name ?? null,
      startedAt: attempt?.started_at ?? null,
      submittedAt: attempt?.submitted_at ?? null,
      result: attempt?.result ?? 'pending',
      answers: attempt
        ? (answersByAttempt.get(attempt.id) ?? []).map((answer) => ({
            questionId: answer.question_id,
            content: answer.content,
          }))
        : [],
      reviewTask: reviewTask
        ? { id: reviewTask.id, status: reviewTask.status, submittedAt: reviewTask.submitted_at }
        : null,
    })
  }

  // 개별 지정 학생 로스터
  for (const target of raw.exam_session_targets ?? []) {
    if (!target.student_id || seenStudents.has(target.student_id)) continue
    seenStudents.add(target.student_id)

    const profile = Array.isArray(target.profiles) ? target.profiles[0] : target.profiles
    const attempt = attemptByStudent.get(target.student_id) ?? null
    const reviewTask = attempt ? reviewByAttempt.get(attempt.id) ?? null : null

    rows.push({
      attemptId: attempt?.id ?? null,
      studentId: target.student_id,
      studentName: profile?.name ?? profile?.email ?? '이름 없음',
      className: '개별 출제',
      startedAt: attempt?.started_at ?? null,
      submittedAt: attempt?.submitted_at ?? null,
      result: attempt?.result ?? 'pending',
      answers: attempt
        ? (answersByAttempt.get(attempt.id) ?? []).map((answer) => ({
            questionId: answer.question_id,
            content: answer.content,
          }))
        : [],
      reviewTask: reviewTask
        ? { id: reviewTask.id, status: reviewTask.status, submittedAt: reviewTask.submitted_at }
        : null,
    })
  }

  rows.sort((a, b) => a.studentName.localeCompare(b.studentName, 'ko'))

  return {
    session: summary,
    exam: {
      id: examId,
      title: examRow?.title ?? examRelation?.title ?? '제목 없음',
      description: examRow?.description ?? null,
      questions,
    },
    rows,
  }
}

export async function fetchPrincipalReviewTasks(examId?: string): Promise<PrincipalReviewTaskListItem[]> {
  const admin = createAdminClient()

  type Row = {
    id: string
    status: 'assigned' | 'submitted' | 'partial' | 'pass'
    assigned_at: string
    submitted_at: string | null
    exam_review_items: { id: string }[] | null
    exam_attempts:
      | {
          id: string
          student_id: string
          session_id: string
          profiles: { name: string | null; email: string | null } | { name: string | null; email: string | null }[] | null
          exam_sessions:
            | { id: string; exam_id: string; exams: { id: string; title: string } | { id: string; title: string }[] | null }
            | Array<{ id: string; exam_id: string; exams: { id: string; title: string } | { id: string; title: string }[] | null }>
            | null
        }
      | Array<{
          id: string
          student_id: string
          session_id: string
          profiles: { name: string | null; email: string | null } | { name: string | null; email: string | null }[] | null
          exam_sessions:
            | { id: string; exam_id: string; exams: { id: string; title: string } | { id: string; title: string }[] | null }
            | Array<{ id: string; exam_id: string; exams: { id: string; title: string } | { id: string; title: string }[] | null }>
            | null
        }>
      | null
  }

  let query = admin
    .from('exam_review_tasks')
    .select(
      `id, status, assigned_at, submitted_at,
       exam_review_items(id),
       exam_attempts!inner(
         id, student_id, session_id,
         profiles:profiles!exam_attempts_student_id_fkey(name, email),
         exam_sessions!inner(id, exam_id, exams(id, title))
       )`
    )

  if (examId) {
    query = query.eq('exam_attempts.exam_sessions.exam_id', examId)
  }

  const { data, error } = await query
    .order('submitted_at', { ascending: false, nullsFirst: false })
    .order('assigned_at', { ascending: false })

  if (error) {
    console.error('[exams] failed to fetch principal review tasks', error)
    return []
  }

  return ((data ?? []) as unknown as Row[]).map((row) => {
    const attempt = Array.isArray(row.exam_attempts) ? row.exam_attempts[0] : row.exam_attempts
    const profile = attempt
      ? Array.isArray(attempt.profiles)
        ? attempt.profiles[0]
        : attempt.profiles
      : null
    const session = attempt
      ? Array.isArray(attempt.exam_sessions)
        ? attempt.exam_sessions[0]
        : attempt.exam_sessions
      : null
    const exam = session ? (Array.isArray(session.exams) ? session.exams[0] : session.exams) : null

    return {
      reviewTaskId: row.id,
      examId: exam?.id ?? session?.exam_id ?? '',
      examTitle: exam?.title ?? '제목 없음',
      sessionId: attempt?.session_id ?? '',
      studentId: attempt?.student_id ?? '',
      studentName: profile?.name ?? profile?.email ?? '이름 없음',
      status: row.status,
      assignedAt: row.assigned_at,
      submittedAt: row.submitted_at,
      itemCount: row.exam_review_items?.length ?? 0,
    }
  })
}

export async function fetchReviewTaskDetailForPrincipal(
  reviewTaskId: string
): Promise<ReviewTaskDetailForPrincipal | null> {
  const admin = createAdminClient()

  const taskMap = await fetchReviewTaskViews([reviewTaskId])
  const task = taskMap.get(reviewTaskId)
  if (!task) {
    return null
  }

  type AttemptRow = {
    id: string
    student_id: string
    session_id: string
    profiles: { name: string | null; email: string | null } | { name: string | null; email: string | null }[] | null
    exam_sessions:
      | { id: string; exams: { title: string } | { title: string }[] | null }
      | Array<{ id: string; exams: { title: string } | { title: string }[] | null }>
      | null
  }

  const { data: attemptRow, error } = await admin
    .from('exam_attempts')
    .select(
      `id, student_id, session_id,
       profiles:profiles!exam_attempts_student_id_fkey(name, email),
       exam_sessions(id, exams(title))`
    )
    .eq('id', task.attemptId)
    .maybeSingle()

  if (error || !attemptRow) {
    if (error) console.error('[exams] failed to fetch attempt for review task', error)
    return null
  }

  const attempt = attemptRow as unknown as AttemptRow
  const profile = Array.isArray(attempt.profiles) ? attempt.profiles[0] : attempt.profiles
  const session = Array.isArray(attempt.exam_sessions) ? attempt.exam_sessions[0] : attempt.exam_sessions
  const exam = session ? (Array.isArray(session.exams) ? session.exams[0] : session.exams) : null

  return {
    task,
    examTitle: exam?.title ?? '제목 없음',
    sessionId: attempt.session_id,
    studentName: profile?.name ?? profile?.email ?? '이름 없음',
  }
}

async function fetchStudentClassIds(studentId: string): Promise<string[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('class_students')
    .select('class_id')
    .eq('student_id', studentId)

  if (error) {
    console.error('[exams] failed to fetch student classes', error)
    return []
  }

  return Array.from(new Set((data ?? []).map((row) => row.class_id).filter(Boolean)))
}

export async function fetchStudentExamList(studentId: string): Promise<StudentExamListItem[]> {
  const admin = createAdminClient()
  const classIds = await fetchStudentClassIds(studentId)

  const orFilters = [`student_id.eq.${studentId}`]
  if (classIds.length > 0) {
    orFilters.push(`class_id.in.(${classIds.join(',')})`)
  }

  const { data: targetRows, error: targetError } = await admin
    .from('exam_session_targets')
    .select('session_id')
    .or(orFilters.join(','))

  if (targetError) {
    console.error('[exams] failed to fetch session targets for student', targetError)
    return []
  }

  const sessionIds = Array.from(new Set((targetRows ?? []).map((row) => row.session_id)))
  if (sessionIds.length === 0) {
    return []
  }

  type SessionRow = {
    id: string
    duration_minutes: number
    opens_at: string
    closes_at: string
    status: 'open' | 'closed'
    created_at: string
    exams: { title: string; description: string | null } | { title: string; description: string | null }[] | null
  }

  const { data: sessionRows, error: sessionError } = await admin
    .from('exam_sessions')
    .select('id, duration_minutes, opens_at, closes_at, status, created_at, exams(title, description)')
    .in('id', sessionIds)
    .order('created_at', { ascending: false })

  if (sessionError) {
    console.error('[exams] failed to fetch sessions for student', sessionError)
    return []
  }

  type AttemptRow = {
    id: string
    session_id: string
    started_at: string | null
    submitted_at: string | null
    result: 'pending' | 'pass' | 'nonpass'
  }

  const { data: attemptRows, error: attemptError } = await admin
    .from('exam_attempts')
    .select('id, session_id, started_at, submitted_at, result')
    .eq('student_id', studentId)
    .in('session_id', sessionIds)

  if (attemptError) {
    console.error('[exams] failed to fetch attempts for student', attemptError)
  }

  const attemptBySession = new Map(
    ((attemptRows ?? []) as AttemptRow[]).map((attempt) => [attempt.session_id, attempt])
  )

  return ((sessionRows ?? []) as unknown as SessionRow[]).map((row) => {
    const exam = Array.isArray(row.exams) ? row.exams[0] : row.exams
    const attempt = attemptBySession.get(row.id) ?? null

    return {
      sessionId: row.id,
      examTitle: exam?.title ?? '제목 없음',
      examDescription: exam?.description ?? null,
      durationMinutes: row.duration_minutes,
      opensAt: row.opens_at,
      closesAt: row.closes_at,
      sessionStatus: row.status,
      attempt: attempt
        ? {
            id: attempt.id,
            startedAt: attempt.started_at,
            submittedAt: attempt.submitted_at,
            result: attempt.result,
          }
        : null,
    }
  })
}

export async function fetchStudentReviewTasks(studentId: string): Promise<StudentReviewTaskListItem[]> {
  const admin = createAdminClient()

  type Row = {
    id: string
    status: 'assigned' | 'submitted' | 'partial' | 'pass'
    assigned_at: string
    submitted_at: string | null
    exam_review_items: Array<{ id: string; result: string }> | null
    exam_attempts:
      | {
          student_id: string
          exam_sessions:
            | { exams: { title: string } | { title: string }[] | null }
            | Array<{ exams: { title: string } | { title: string }[] | null }>
            | null
        }
      | Array<{
          student_id: string
          exam_sessions:
            | { exams: { title: string } | { title: string }[] | null }
            | Array<{ exams: { title: string } | { title: string }[] | null }>
            | null
        }>
      | null
  }

  const { data, error } = await admin
    .from('exam_review_tasks')
    .select(
      `id, status, assigned_at, submitted_at,
       exam_review_items(id, result),
       exam_attempts!inner(
         student_id,
         exam_sessions(exams(title))
       )`
    )
    .eq('exam_attempts.student_id', studentId)
    .order('assigned_at', { ascending: false })

  if (error) {
    console.error('[exams] failed to fetch student review tasks', error)
    return []
  }

  return ((data ?? []) as unknown as Row[]).map((row) => {
    const attempt = Array.isArray(row.exam_attempts) ? row.exam_attempts[0] : row.exam_attempts
    const session = attempt
      ? Array.isArray(attempt.exam_sessions)
        ? attempt.exam_sessions[0]
        : attempt.exam_sessions
      : null
    const exam = session ? (Array.isArray(session.exams) ? session.exams[0] : session.exams) : null
    const items = row.exam_review_items ?? []

    return {
      reviewTaskId: row.id,
      examTitle: exam?.title ?? '제목 없음',
      status: row.status,
      assignedAt: row.assigned_at,
      submittedAt: row.submitted_at,
      itemCount: items.length,
      nonpassCount: items.filter((item) => item.result === 'nonpass').length,
    }
  })
}

export async function fetchStudentExamRunnerData(
  sessionId: string,
  studentId: string
): Promise<StudentExamRunnerData | null> {
  const admin = createAdminClient()

  const classIds = await fetchStudentClassIds(studentId)

  const orFilters = [`student_id.eq.${studentId}`]
  if (classIds.length > 0) {
    orFilters.push(`class_id.in.(${classIds.join(',')})`)
  }

  const { data: targetRow } = await admin
    .from('exam_session_targets')
    .select('id')
    .eq('session_id', sessionId)
    .or(orFilters.join(','))
    .limit(1)
    .maybeSingle()

  if (!targetRow) {
    return null
  }

  type SessionRow = {
    id: string
    exam_id: string
    duration_minutes: number
    opens_at: string
    closes_at: string
    status: 'open' | 'closed'
    exams: { title: string; description: string | null } | { title: string; description: string | null }[] | null
  }

  const { data: sessionRow, error } = await admin
    .from('exam_sessions')
    .select('id, exam_id, duration_minutes, opens_at, closes_at, status, exams(title, description)')
    .eq('id', sessionId)
    .maybeSingle()

  if (error || !sessionRow) {
    if (error) console.error('[exams] failed to fetch session for runner', error)
    return null
  }

  const session = sessionRow as unknown as SessionRow
  const exam = Array.isArray(session.exams) ? session.exams[0] : session.exams

  const questionMap = await fetchQuestionsForExams([session.exam_id])
  const questions = questionMap.get(session.exam_id) ?? []

  type AttemptRow = {
    id: string
    started_at: string | null
    submitted_at: string | null
    result: 'pending' | 'pass' | 'nonpass'
  }

  const { data: attemptRow } = await admin
    .from('exam_attempts')
    .select('id, started_at, submitted_at, result')
    .eq('session_id', sessionId)
    .eq('student_id', studentId)
    .maybeSingle()

  const attempt = attemptRow as AttemptRow | null

  let answers: Array<{ questionId: string; content: string | null }> = []
  if (attempt) {
    const { data: answerRows } = await admin
      .from('exam_answers')
      .select('question_id, content')
      .eq('attempt_id', attempt.id)

    answers = (answerRows ?? []).map((row) => ({
      questionId: row.question_id,
      content: row.content,
    }))
  }

  return {
    sessionId: session.id,
    examTitle: exam?.title ?? '제목 없음',
    examDescription: exam?.description ?? null,
    durationMinutes: session.duration_minutes,
    opensAt: session.opens_at,
    closesAt: session.closes_at,
    sessionStatus: session.status,
    questions,
    attempt: attempt
      ? {
          id: attempt.id,
          startedAt: attempt.started_at,
          submittedAt: attempt.submitted_at,
          result: attempt.result,
          answers,
        }
      : null,
    serverNow: new Date().toISOString(),
  }
}

export async function fetchStudentReviewTaskDetail(
  reviewTaskId: string,
  studentId: string
): Promise<StudentReviewTaskDetail | null> {
  const admin = createAdminClient()

  type Row = {
    id: string
    exam_attempts:
      | {
          student_id: string
          exam_sessions:
            | { exams: { title: string } | { title: string }[] | null }
            | Array<{ exams: { title: string } | { title: string }[] | null }>
            | null
        }
      | Array<{
          student_id: string
          exam_sessions:
            | { exams: { title: string } | { title: string }[] | null }
            | Array<{ exams: { title: string } | { title: string }[] | null }>
            | null
        }>
      | null
  }

  const { data, error } = await admin
    .from('exam_review_tasks')
    .select('id, exam_attempts!inner(student_id, exam_sessions(exams(title)))')
    .eq('id', reviewTaskId)
    .maybeSingle()

  if (error || !data) {
    if (error) console.error('[exams] failed to fetch review task for student', error)
    return null
  }

  const row = data as unknown as Row
  const attempt = Array.isArray(row.exam_attempts) ? row.exam_attempts[0] : row.exam_attempts
  if (!attempt || attempt.student_id !== studentId) {
    return null
  }

  const taskMap = await fetchReviewTaskViews([reviewTaskId])
  const task = taskMap.get(reviewTaskId)
  if (!task) {
    return null
  }

  const session = Array.isArray(attempt.exam_sessions) ? attempt.exam_sessions[0] : attempt.exam_sessions
  const exam = session ? (Array.isArray(session.exams) ? session.exams[0] : session.exams) : null

  return {
    task,
    examTitle: exam?.title ?? '제목 없음',
  }
}

export interface ExamClassOption {
  id: string
  name: string
  students: Array<{ id: string; name: string }>
}

export async function fetchClassOptionsForExam(): Promise<ExamClassOption[]> {
  const admin = createAdminClient()

  const { data: classRows, error } = await admin
    .from('classes')
    .select('id, name, class_students(student_id, profiles:profiles!class_students_student_id_fkey(id, name, email))')
    .order('name', { ascending: true })

  if (error) {
    console.error('[exams] failed to fetch class options', error)
    return []
  }

  type Row = {
    id: string
    name: string | null
    class_students: Array<{
      student_id: string
      profiles:
        | { id: string; name: string | null; email: string | null }
        | { id: string; name: string | null; email: string | null }[]
        | null
    }> | null
  }

  return ((classRows ?? []) as unknown as Row[]).map((row) => ({
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
