import { createAdminClient } from '@/lib/supabase/admin'
import {
  createSignedUrlMap,
  normalizeMedia,
  resolveUniversityName,
  toTimeLabel,
  type AssetRow,
} from '@/lib/practice/shared'
import { fetchProblemAssets, fetchProblemItems, fetchProblemRubricItems } from '@/lib/practice/problems'
import { fetchFeedbackAttemptIds, fetchStudentClassNames } from '@/lib/practice/slots'
import type {
  PracticeAttemptDetail,
  PracticeAttemptStatus,
  PracticeAttemptSubmissionImage,
  PracticeBookingStatus,
  PracticeBookingType,
  PracticeFeedbackView,
  PracticeOcrStatus,
  PracticeStudentBookingRow,
  PracticeStudentHistory,
  PracticeType,
} from '@/types/practice'

type MediaRow = { id: string; bucket: string | null; path: string | null }

function firstOf<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null
  }
  return value ?? null
}

const ATTEMPT_SELECT = `
  id, booking_id, student_id, problem_id, practice_type, opens_at, deadline_at,
  started_at, submitted_at, status, ocr_text, ocr_status, typed_answers,
  video_media_asset_id, recorded_at,
  media_assets:media_assets!practice_attempts_video_media_asset_id_fkey(id, bucket, path),
  practice_bookings!inner(
    id, status, booking_type, university_id, slot_id,
    practice_slots(
      id, slot_date, start_time, starts_at, teacher_id,
      profiles:profiles!practice_slots_teacher_id_fkey(id, name, email)
    )
  ),
  practice_problems(id, title, description, time_limit_minutes),
  profiles:profiles!practice_attempts_student_id_fkey(id, name, email)
`

type AttemptRow = {
  id: string
  booking_id: string
  student_id: string
  problem_id: string
  practice_type: PracticeType
  opens_at: string
  deadline_at: string
  started_at: string | null
  submitted_at: string | null
  status: PracticeAttemptStatus
  ocr_text: string | null
  ocr_status: PracticeOcrStatus
  typed_answers: Record<string, string> | null
  video_media_asset_id: string | null
  recorded_at: string | null
  media_assets: MediaRow | MediaRow[] | null
  practice_bookings:
    | {
        id: string
        status: PracticeBookingStatus
        booking_type: PracticeBookingType
        university_id: string
        slot_id: string
        practice_slots:
          | {
              id: string
              slot_date: string
              start_time: string
              starts_at: string
              teacher_id: string
              profiles: { id: string; name: string | null; email: string | null } | { id: string; name: string | null; email: string | null }[] | null
            }
          | Array<{
              id: string
              slot_date: string
              start_time: string
              starts_at: string
              teacher_id: string
              profiles: { id: string; name: string | null; email: string | null } | { id: string; name: string | null; email: string | null }[] | null
            }>
          | null
      }
    | Array<{
        id: string
        status: PracticeBookingStatus
        booking_type: PracticeBookingType
        university_id: string
        slot_id: string
        practice_slots: unknown
      }>
    | null
  practice_problems:
    | { id: string; title: string; description: string | null; time_limit_minutes: number }
    | Array<{ id: string; title: string; description: string | null; time_limit_minutes: number }>
    | null
  profiles: { id: string; name: string | null; email: string | null } | { id: string; name: string | null; email: string | null }[] | null
}

export async function fetchSubmissionImages(
  attemptIds: string[]
): Promise<Map<string, PracticeAttemptSubmissionImage[]>> {
  const result = new Map<string, PracticeAttemptSubmissionImage[]>()
  if (attemptIds.length === 0) {
    return result
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('practice_submission_assets')
    .select('id, attempt_id, media_asset_id, order_index, media_assets(id, bucket, path)')
    .in('attempt_id', attemptIds)
    .order('order_index', { ascending: true })

  if (error) {
    console.error('[practice] failed to fetch submission assets', error)
    return result
  }

  const rows = (data ?? []) as unknown as Array<{
    id: string
    attempt_id: string
    media_asset_id: string
    order_index: number
    media_assets: MediaRow | MediaRow[] | null
  }>

  const mediaRows: AssetRow[] = rows.map((row) => {
    const media = normalizeMedia(row.media_assets)
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

async function fetchFeedbackForAttempt(attemptId: string): Promise<PracticeFeedbackView | null> {
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('practice_feedbacks')
    .select(
      `id, teacher_id, feedback_text, comment, total_score, created_at, updated_at,
       profiles:profiles!practice_feedbacks_teacher_id_fkey(id, name, email),
       practice_feedback_scores(rubric_item_id, score, note)`
    )
    .eq('attempt_id', attemptId)
    .maybeSingle()

  if (error) {
    console.error('[practice] failed to fetch feedback', error)
    return null
  }
  if (!data) {
    return null
  }

  const row = data as unknown as {
    id: string
    teacher_id: string | null
    feedback_text: string | null
    comment: string | null
    total_score: number | string | null
    created_at: string
    updated_at: string
    profiles: { id: string; name: string | null; email: string | null } | { id: string; name: string | null; email: string | null }[] | null
    practice_feedback_scores: Array<{ rubric_item_id: string; score: number | string; note: string | null }> | null
  }

  const teacher = firstOf(row.profiles)

  return {
    id: row.id,
    teacherId: row.teacher_id,
    teacherName: teacher?.name ?? teacher?.email ?? null,
    feedbackText: row.feedback_text,
    comment: row.comment,
    totalScore: row.total_score === null ? null : Number(row.total_score),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    scores: (row.practice_feedback_scores ?? []).map((score) => ({
      rubricItemId: score.rubric_item_id,
      score: Number(score.score),
      note: score.note,
    })),
  }
}

export async function fetchPracticeAttemptDetail(attemptId: string): Promise<PracticeAttemptDetail | null> {
  const admin = createAdminClient()

  const { data, error } = await admin.from('practice_attempts').select(ATTEMPT_SELECT).eq('id', attemptId).maybeSingle()

  if (error || !data) {
    if (error) {
      console.error('[practice] failed to fetch attempt detail', error)
    }
    return null
  }

  const row = data as unknown as AttemptRow
  const booking = firstOf(row.practice_bookings) as
    | {
        id: string
        status: PracticeBookingStatus
        booking_type: PracticeBookingType
        university_id: string
        slot_id: string
        practice_slots: unknown
      }
    | null

  if (!booking) {
    return null
  }

  const slot = firstOf(
    booking.practice_slots as
      | {
          id: string
          slot_date: string
          start_time: string
          starts_at: string
          teacher_id: string
          profiles: { id: string; name: string | null; email: string | null } | { id: string; name: string | null; email: string | null }[] | null
        }
      | Array<{
          id: string
          slot_date: string
          start_time: string
          starts_at: string
          teacher_id: string
          profiles: { id: string; name: string | null; email: string | null } | { id: string; name: string | null; email: string | null }[] | null
        }>
      | null
  )

  const problem = firstOf(row.practice_problems)
  const student = firstOf(row.profiles)
  const teacher = slot ? firstOf(slot.profiles) : null

  const [items, assets, rubricItems, submissionImages, classNames, feedback] = await Promise.all([
    fetchProblemItems([row.problem_id]),
    fetchProblemAssets([row.problem_id]),
    fetchProblemRubricItems([row.problem_id]),
    fetchSubmissionImages([row.id]),
    fetchStudentClassNames([row.student_id]),
    fetchFeedbackForAttempt(row.id),
  ])

  let videoUrl: string | null = null
  const videoMedia = normalizeMedia(row.media_assets)
  if (videoMedia?.bucket && videoMedia.path) {
    const { data: signed, error: signError } = await admin.storage
      .from(videoMedia.bucket)
      .createSignedUrl(videoMedia.path, 60 * 60)
    if (signError) {
      console.error('[practice] failed to sign recording url', signError)
    } else {
      videoUrl = signed?.signedUrl ?? null
    }
  }

  return {
    attemptId: row.id,
    bookingId: row.booking_id,
    studentId: row.student_id,
    studentName: student?.name ?? student?.email ?? '이름 없음',
    className: classNames.get(row.student_id) ?? null,
    teacherId: slot?.teacher_id ?? '',
    teacherName: teacher?.name ?? teacher?.email ?? '이름 없음',
    practiceType: row.practice_type,
    universityName: resolveUniversityName(booking.university_id),
    problem: {
      id: row.problem_id,
      title: problem?.title ?? '문제 없음',
      description: problem?.description ?? null,
      timeLimitMinutes: problem?.time_limit_minutes ?? 0,
      items: items.get(row.problem_id) ?? [],
      assets: assets.get(row.problem_id) ?? [],
      rubricItems: rubricItems.get(row.problem_id) ?? [],
    },
    slotDate: slot?.slot_date ?? '',
    startTime: slot ? toTimeLabel(slot.start_time) : '',
    startsAt: slot?.starts_at ?? row.deadline_at,
    opensAt: row.opens_at,
    deadlineAt: row.deadline_at,
    startedAt: row.started_at,
    submittedAt: row.submitted_at,
    status: row.status,
    bookingStatus: booking.status,
    ocrText: row.ocr_text,
    ocrStatus: row.ocr_status,
    typedAnswers: row.typed_answers ?? {},
    submissionImages: submissionImages.get(row.id) ?? [],
    videoUrl,
    recordedAt: row.recorded_at,
    feedback,
  }
}

type BookingListRow = {
  id: string
  student_id: string
  profiles: { id: string; name: string | null; email: string | null } | { id: string; name: string | null; email: string | null }[] | null
  practice_type: PracticeType
  booking_type: PracticeBookingType
  status: PracticeBookingStatus
  university_id: string
  practice_problems: { id: string; title: string } | { id: string; title: string }[] | null
  practice_slots:
    | {
        id: string
        slot_date: string
        start_time: string
        starts_at: string
        profiles: { id: string; name: string | null; email: string | null } | { id: string; name: string | null; email: string | null }[] | null
      }
    | Array<{
        id: string
        slot_date: string
        start_time: string
        starts_at: string
        profiles: { id: string; name: string | null; email: string | null } | { id: string; name: string | null; email: string | null }[] | null
      }>
    | null
  practice_attempts:
    | Array<{
        id: string
        status: PracticeAttemptStatus
        opens_at: string
        deadline_at: string
        submitted_at: string | null
      }>
    | null
}

const BOOKING_LIST_SELECT = `
  id, student_id, practice_type, booking_type, status, university_id,
  profiles:profiles!practice_bookings_student_id_fkey(id, name, email),
  practice_problems(id, title),
  practice_slots(
    id, slot_date, start_time, starts_at,
    profiles:profiles!practice_slots_teacher_id_fkey(id, name, email)
  ),
  practice_attempts(id, status, opens_at, deadline_at, submitted_at)
`

async function mapBookingRows(rows: BookingListRow[]): Promise<PracticeStudentBookingRow[]> {
  const attemptIds = rows
    .map((row) => row.practice_attempts?.[0]?.id)
    .filter((value): value is string => Boolean(value))
  const [feedbackSet, classNames] = await Promise.all([
    fetchFeedbackAttemptIds(attemptIds),
    fetchStudentClassNames(rows.map((row) => row.student_id)),
  ])

  return rows.map((row) => {
    const slot = firstOf(row.practice_slots)
    const teacher = slot ? firstOf(slot.profiles) : null
    const problem = firstOf(row.practice_problems)
    const student = firstOf(row.profiles)
    const attempt = row.practice_attempts?.[0] ?? null

    return {
      bookingId: row.id,
      attemptId: attempt?.id ?? null,
      studentId: row.student_id,
      studentName: student?.name ?? student?.email ?? '이름 없음',
      className: classNames.get(row.student_id) ?? null,
      practiceType: row.practice_type,
      universityName: resolveUniversityName(row.university_id),
      problemTitle: problem?.title ?? null,
      teacherName: teacher?.name ?? teacher?.email ?? '이름 없음',
      slotDate: slot?.slot_date ?? '',
      startTime: slot ? toTimeLabel(slot.start_time) : '',
      startsAt: slot?.starts_at ?? '',
      opensAt: attempt?.opens_at ?? null,
      deadlineAt: attempt?.deadline_at ?? null,
      submittedAt: attempt?.submitted_at ?? null,
      attemptStatus: attempt?.status ?? null,
      bookingStatus: row.status,
      bookingType: row.booking_type,
      hasFeedback: attempt ? feedbackSet.has(attempt.id) : false,
    }
  })
}

export async function fetchStudentPracticeBookings(
  studentId: string,
  options?: { includeCanceled?: boolean }
): Promise<PracticeStudentBookingRow[]> {
  const admin = createAdminClient()

  let query = admin.from('practice_bookings').select(BOOKING_LIST_SELECT).eq('student_id', studentId)

  if (!options?.includeCanceled) {
    query = query.neq('status', 'canceled')
  }

  const { data, error } = await query

  if (error) {
    console.error('[practice] failed to fetch student bookings', error)
    return []
  }

  const mapped = await mapBookingRows((data ?? []) as unknown as BookingListRow[])
  return mapped.sort((a, b) => b.startsAt.localeCompare(a.startsAt))
}

export async function fetchPracticeStudentHistory(studentId: string): Promise<PracticeStudentHistory | null> {
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('profiles')
    .select('id, name, email')
    .eq('id', studentId)
    .maybeSingle()

  if (error || !data) {
    if (error) {
      console.error('[practice] failed to fetch student profile', error)
    }
    return null
  }

  const profile = data as { id: string; name: string | null; email: string | null }
  const [rows, classNames] = await Promise.all([
    fetchStudentPracticeBookings(studentId),
    fetchStudentClassNames([studentId]),
  ])

  return {
    studentId: profile.id,
    studentName: profile.name ?? profile.email ?? '이름 없음',
    className: classNames.get(studentId) ?? null,
    totalCount: rows.length,
    submittedCount: rows.filter((row) => Boolean(row.submittedAt)).length,
    feedbackCount: rows.filter((row) => row.hasFeedback).length,
    rows,
  }
}

/** 모의실기를 한 번이라도 예약한 학생 목록 (교사 관리 화면) */
export async function fetchPracticeStudentsWithBookings(): Promise<
  Array<{ studentId: string; studentName: string; className: string | null; totalCount: number; feedbackCount: number }>
> {
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('practice_bookings')
    .select(
      `student_id, status,
       profiles:profiles!practice_bookings_student_id_fkey(id, name, email),
       practice_attempts(id)`
    )
    .neq('status', 'canceled')

  if (error) {
    console.error('[practice] failed to fetch practice students', error)
    return []
  }

  const rows = (data ?? []) as unknown as Array<{
    student_id: string
    profiles: { id: string; name: string | null; email: string | null } | { id: string; name: string | null; email: string | null }[] | null
    practice_attempts: Array<{ id: string }> | null
  }>

  const attemptIds = rows
    .map((row) => row.practice_attempts?.[0]?.id)
    .filter((value): value is string => Boolean(value))
  const [feedbackSet, classNames] = await Promise.all([
    fetchFeedbackAttemptIds(attemptIds),
    fetchStudentClassNames(rows.map((row) => row.student_id)),
  ])

  const grouped = new Map<
    string,
    { studentId: string; studentName: string; className: string | null; totalCount: number; feedbackCount: number }
  >()

  for (const row of rows) {
    const profile = firstOf(row.profiles)
    const entry = grouped.get(row.student_id) ?? {
      studentId: row.student_id,
      studentName: profile?.name ?? profile?.email ?? '이름 없음',
      className: classNames.get(row.student_id) ?? null,
      totalCount: 0,
      feedbackCount: 0,
    }
    entry.totalCount += 1
    const attemptId = row.practice_attempts?.[0]?.id
    if (attemptId && feedbackSet.has(attemptId)) {
      entry.feedbackCount += 1
    }
    grouped.set(row.student_id, entry)
  }

  return Array.from(grouped.values()).sort((a, b) => a.studentName.localeCompare(b.studentName, 'ko'))
}

/** 선생님의 특정 날짜 진행 목록 */
export async function fetchTeacherPracticeSchedule(
  teacherId: string,
  slotDate: string
): Promise<PracticeStudentBookingRow[]> {
  const admin = createAdminClient()

  const { data: slotRows, error: slotError } = await admin
    .from('practice_slots')
    .select('id')
    .eq('teacher_id', teacherId)
    .eq('slot_date', slotDate)

  if (slotError) {
    console.error('[practice] failed to fetch teacher slots', slotError)
    return []
  }

  const slotIds = ((slotRows ?? []) as Array<{ id: string }>).map((row) => row.id)
  if (slotIds.length === 0) {
    return []
  }

  const { data, error } = await admin
    .from('practice_bookings')
    .select(BOOKING_LIST_SELECT)
    .in('slot_id', slotIds)
    .neq('status', 'canceled')

  if (error) {
    console.error('[practice] failed to fetch teacher schedule', error)
    return []
  }

  const mapped = await mapBookingRows((data ?? []) as unknown as BookingListRow[])
  return mapped.sort((a, b) => a.startsAt.localeCompare(b.startsAt))
}

/** 학생이 진행 중(응시 가능)인 응시 1건 */
export async function fetchStudentActiveAttempt(studentId: string): Promise<PracticeStudentBookingRow | null> {
  const rows = await fetchStudentPracticeBookings(studentId)
  const now = Date.now()

  const candidates = rows.filter((row) => {
    if (!row.opensAt || !row.deadlineAt || row.submittedAt) {
      return false
    }
    return Date.parse(row.opensAt) <= now
  })

  if (candidates.length === 0) {
    return null
  }

  return candidates.sort((a, b) => (a.deadlineAt ?? '').localeCompare(b.deadlineAt ?? ''))[0]
}
