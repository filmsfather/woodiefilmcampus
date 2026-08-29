import { createAdminClient } from '@/lib/supabase/admin'
import { buildDayTimeline, resolveUniversityName, toTimeLabel } from '@/lib/practice/shared'
import type {
  PracticeAttemptStatus,
  PracticeAudience,
  PracticeBookingOpening,
  PracticeBookingStatus,
  PracticeBookingType,
  PracticeDayBoard,
  PracticeFreeSlotOption,
  PracticeSlotBlockSummary,
  PracticeSlotBooking,
  PracticeSlotStatus,
  PracticeSlotView,
  PracticeStudentOption,
  PracticeType,
} from '@/types/practice'

function firstOf<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null
  }
  return value ?? null
}

/** 학생 -> 반 이름 (여러 반이면 첫 번째) */
export async function fetchStudentClassNames(studentIds: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  if (studentIds.length === 0) {
    return result
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('class_students')
    .select('student_id, classes(name)')
    .in('student_id', studentIds)

  if (error) {
    console.error('[practice] failed to fetch student classes', error)
    return result
  }

  for (const row of (data ?? []) as unknown as Array<{
    student_id: string
    classes: { name: string } | { name: string }[] | null
  }>) {
    if (result.has(row.student_id)) continue
    const cls = firstOf(row.classes)
    if (cls?.name) {
      result.set(row.student_id, cls.name)
    }
  }

  return result
}

type SlotRow = {
  id: string
  teacher_id: string
  room_no: number | null
  slot_date: string
  start_time: string
  duration_minutes: number
  starts_at: string
  status: PracticeSlotStatus
  free_booking_opens_at: string | null
  phase2_opens_at: string | null
  booking_closes_at: string | null
  audience: PracticeAudience
  profiles: { id: string; name: string | null; email: string | null } | { id: string; name: string | null; email: string | null }[] | null
}

type BookingRow = {
  id: string
  slot_id: string
  student_id: string
  university_id: string
  problem_id: string
  practice_type: PracticeType
  booking_type: PracticeBookingType
  status: PracticeBookingStatus
  profiles: { id: string; name: string | null; email: string | null } | { id: string; name: string | null; email: string | null }[] | null
  practice_problems: { id: string; title: string } | { id: string; title: string }[] | null
  // booking_id가 unique라 PostgREST가 1:1로 판단해 단일 객체로 반환한다.
  practice_attempts:
    | {
        id: string
        status: PracticeAttemptStatus
        opens_at: string
        deadline_at: string
        submitted_at: string | null
      }
    | Array<{
        id: string
        status: PracticeAttemptStatus
        opens_at: string
        deadline_at: string
        submitted_at: string | null
      }>
    | null
}

async function fetchBookingsBySlotIds(slotIds: string[]): Promise<Map<string, PracticeSlotBooking>> {
  const result = new Map<string, PracticeSlotBooking>()
  if (slotIds.length === 0) {
    return result
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('practice_bookings')
    .select(
      `id, slot_id, student_id, university_id, problem_id, practice_type, booking_type, status,
       profiles:profiles!practice_bookings_student_id_fkey(id, name, email),
       practice_problems(id, title),
       practice_attempts(id, status, opens_at, deadline_at, submitted_at)`
    )
    .in('slot_id', slotIds)
    .eq('status', 'reserved')

  if (error) {
    console.error('[practice] failed to fetch slot bookings', error)
    return result
  }

  const rows = (data ?? []) as unknown as BookingRow[]
  const classNames = await fetchStudentClassNames(rows.map((row) => row.student_id))

  const attemptIds = rows
    .map((row) => firstOf(row.practice_attempts)?.id)
    .filter((value): value is string => Boolean(value))
  const feedbackSet = await fetchFeedbackAttemptIds(attemptIds)

  for (const row of rows) {
    const student = firstOf(row.profiles)
    const problem = firstOf(row.practice_problems)
    const attempt = firstOf(row.practice_attempts)

    result.set(row.slot_id, {
      id: row.id,
      studentId: row.student_id,
      studentName: student?.name ?? student?.email ?? '이름 없음',
      className: classNames.get(row.student_id) ?? null,
      universityId: row.university_id,
      universityName: resolveUniversityName(row.university_id),
      problemId: row.problem_id,
      problemTitle: problem?.title ?? '문제 없음',
      practiceType: row.practice_type,
      bookingType: row.booking_type,
      status: row.status,
      attemptId: attempt?.id ?? null,
      attemptStatus: attempt?.status ?? null,
      opensAt: attempt?.opens_at ?? null,
      deadlineAt: attempt?.deadline_at ?? null,
      submittedAt: attempt?.submitted_at ?? null,
      hasFeedback: attempt ? feedbackSet.has(attempt.id) : false,
    })
  }

  return result
}

export async function fetchFeedbackAttemptIds(attemptIds: string[]): Promise<Set<string>> {
  const result = new Set<string>()
  if (attemptIds.length === 0) {
    return result
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('practice_feedbacks')
    .select('attempt_id')
    .in('attempt_id', attemptIds)

  if (error) {
    console.error('[practice] failed to fetch feedback flags', error)
    return result
  }

  for (const row of (data ?? []) as Array<{ attempt_id: string }>) {
    result.add(row.attempt_id)
  }

  return result
}

/** 특정 날짜의 슬롯 보드 (선생님 열 x 15분 행) */
export async function fetchPracticeDayBoard(
  slotDate: string,
  options?: { teacherId?: string | null }
): Promise<PracticeDayBoard> {
  const admin = createAdminClient()

  let query = admin
    .from('practice_slots')
    .select(
      `id, teacher_id, room_no, slot_date, start_time, duration_minutes, starts_at, status,
       free_booking_opens_at, phase2_opens_at, booking_closes_at, audience,
       profiles:profiles!practice_slots_teacher_id_fkey(id, name, email)`
    )
    .eq('slot_date', slotDate)
    .order('start_time', { ascending: true })

  if (options?.teacherId) {
    query = query.eq('teacher_id', options.teacherId)
  }

  const { data, error } = await query

  if (error) {
    console.error('[practice] failed to fetch day board', error)
    return { slotDate, teachers: [], timeLabels: [], slots: [] }
  }

  const rows = (data ?? []) as unknown as SlotRow[]
  const bookings = await fetchBookingsBySlotIds(rows.map((row) => row.id))

  const teacherMap = new Map<string, string>()
  const slots: PracticeSlotView[] = rows.map((row) => {
    const teacher = firstOf(row.profiles)
    const teacherName = teacher?.name ?? teacher?.email ?? '이름 없음'
    teacherMap.set(row.teacher_id, teacherName)

    return {
      id: row.id,
      teacherId: row.teacher_id,
      teacherName,
      roomNo: row.room_no,
      slotDate: row.slot_date,
      startTime: toTimeLabel(row.start_time),
      durationMinutes: row.duration_minutes,
      startsAt: row.starts_at,
      status: row.status,
      freeBookingOpensAt: row.free_booking_opens_at,
      phase2OpensAt: row.phase2_opens_at,
      bookingClosesAt: row.booking_closes_at,
      audience: row.audience ?? 'regular',
      booking: bookings.get(row.id) ?? null,
    }
  })

  const usedLabels = Array.from(new Set(slots.map((slot) => slot.startTime))).sort()
  const timeLabels = usedLabels.length > 0 ? usedLabels : buildDayTimeline()

  const teachers = Array.from(teacherMap.entries())
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'))

  return { slotDate, teachers, timeLabels, slots }
}

export async function fetchPracticeSlotBlocks(
  rangeStart: string,
  rangeEnd: string
): Promise<PracticeSlotBlockSummary[]> {
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('practice_slot_blocks')
    .select(
      `id, block_date, start_time, end_time, slot_minutes,
       free_booking_opens_at, phase2_opens_at, booking_closes_at, audience, notes,
       practice_slot_block_teachers(teacher_id, room_no, break_times, profiles(id, name, email)),
       practice_slots(id)`
    )
    .gte('block_date', rangeStart)
    .lte('block_date', rangeEnd)
    .order('block_date', { ascending: true })
    .order('start_time', { ascending: true })

  if (error) {
    console.error('[practice] failed to fetch slot blocks', error)
    return []
  }

  const rows = (data ?? []) as unknown as Array<{
    id: string
    block_date: string
    start_time: string
    end_time: string
    slot_minutes: number
    free_booking_opens_at: string | null
    phase2_opens_at: string | null
    booking_closes_at: string | null
    audience: PracticeAudience
    notes: string | null
    practice_slot_block_teachers:
      | Array<{
          teacher_id: string
          room_no: number | null
          break_times: string[] | null
          profiles: { id: string; name: string | null; email: string | null } | { id: string; name: string | null; email: string | null }[] | null
        }>
      | null
    practice_slots: Array<{ id: string }> | null
  }>

  return rows.map((row) => ({
    id: row.id,
    blockDate: row.block_date,
    startTime: toTimeLabel(row.start_time),
    endTime: toTimeLabel(row.end_time),
    slotMinutes: row.slot_minutes,
    freeBookingOpensAt: row.free_booking_opens_at,
    phase2OpensAt: row.phase2_opens_at,
    bookingClosesAt: row.booking_closes_at,
    audience: row.audience ?? 'regular',
    notes: row.notes,
    teachers: (row.practice_slot_block_teachers ?? [])
      .map((entry) => {
        const profile = firstOf(entry.profiles)
        return {
          teacherId: entry.teacher_id,
          name: profile?.name ?? profile?.email ?? '이름 없음',
          roomNo: entry.room_no,
          breakTimes: (entry.break_times ?? []).map(toTimeLabel).sort(),
        }
      })
      .sort((a, b) => (a.roomNo ?? 99) - (b.roomNo ?? 99)),
    slotCount: row.practice_slots?.length ?? 0,
  }))
}

/** 슬롯 개설 대상이 되는 교직원 목록 */
export async function fetchPracticeTeacherOptions(): Promise<Array<{ id: string; name: string }>> {
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('profiles')
    .select('id, name, email, role')
    .in('role', ['teacher', 'manager', 'principal'])
    .eq('status', 'approved')
    .order('name', { ascending: true })

  if (error) {
    console.error('[practice] failed to fetch teachers', error)
    return []
  }

  return ((data ?? []) as Array<{ id: string; name: string | null; email: string | null }>).map((row) => ({
    id: row.id,
    name: row.name ?? row.email ?? '이름 없음',
  }))
}

/**
 * 예약 배정 대상 학생 목록.
 * teacherId를 주면 그 선생님의 담임 반 학생을 앞쪽에 표시하도록 플래그를 붙인다.
 */
export async function fetchPracticeStudentOptions(teacherId?: string | null): Promise<PracticeStudentOption[]> {
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('profiles')
    .select('id, name, email')
    .eq('role', 'student')
    .eq('status', 'approved')
    .order('name', { ascending: true })

  if (error) {
    console.error('[practice] failed to fetch students', error)
    return []
  }

  const rows = (data ?? []) as Array<{ id: string; name: string | null; email: string | null }>
  const classNames = await fetchStudentClassNames(rows.map((row) => row.id))
  const homeroomStudents = teacherId ? await fetchHomeroomStudentIds(teacherId) : new Set<string>()

  return rows.map((row) => ({
    id: row.id,
    name: row.name ?? row.email ?? '이름 없음',
    className: classNames.get(row.id) ?? null,
    isHomeroomStudent: homeroomStudents.has(row.id),
  }))
}

/** 담임을 맡고 있는 반의 학생 id 집합 */
export async function fetchHomeroomStudentIds(teacherId: string): Promise<Set<string>> {
  const admin = createAdminClient()
  const result = new Set<string>()

  const [byClass, byJunction] = await Promise.all([
    admin.from('classes').select('id').eq('homeroom_teacher_id', teacherId),
    admin.from('class_teachers').select('class_id').eq('teacher_id', teacherId).eq('is_homeroom', true),
  ])

  if (byClass.error) {
    console.error('[practice] failed to fetch homeroom classes', byClass.error)
  }
  if (byJunction.error) {
    console.error('[practice] failed to fetch homeroom junction', byJunction.error)
  }

  const classIds = new Set<string>()
  for (const row of ((byClass.data ?? []) as Array<{ id: string }>)) {
    classIds.add(row.id)
  }
  for (const row of ((byJunction.data ?? []) as Array<{ class_id: string }>)) {
    classIds.add(row.class_id)
  }

  if (classIds.size === 0) {
    return result
  }

  const { data, error } = await admin
    .from('class_students')
    .select('student_id')
    .in('class_id', Array.from(classIds))

  if (error) {
    console.error('[practice] failed to fetch homeroom students', error)
    return result
  }

  for (const row of (data ?? []) as Array<{ student_id: string }>) {
    result.add(row.student_id)
  }

  return result
}

/**
 * 아직 열리지 않은 예약 창 중 가장 이른 것.
 * 1차(free_booking_opens_at)와 2차(phase2_opens_at)를 모두 후보로 두고 더 가까운 쪽을 고른다.
 */
export async function fetchNextPracticeBookingOpening(
  audience: PracticeAudience = 'regular'
): Promise<PracticeBookingOpening | null> {
  const admin = createAdminClient()
  const nowIso = new Date().toISOString()

  const pickEarliest = async (column: 'free_booking_opens_at' | 'phase2_opens_at') => {
    const { data, error } = await admin
      .from('practice_slots')
      .select(`slot_date, ${column}`)
      .eq('status', 'open')
      .eq('audience', audience)
      .gt(column, nowIso)
      .gt('starts_at', nowIso)
      .order(column, { ascending: true })
      .limit(1)
      .maybeSingle()

    if (error) {
      console.error('[practice] failed to fetch next opening', error)
      return null
    }

    const row = data as unknown as Record<string, string | null> | null
    const opensAt = row?.[column]
    return row?.slot_date && opensAt ? { slotDate: row.slot_date, opensAt } : null
  }

  const [phase1, phase2] = await Promise.all([
    pickEarliest('free_booking_opens_at'),
    pickEarliest('phase2_opens_at'),
  ])

  const candidates: PracticeBookingOpening[] = []
  if (phase1) {
    candidates.push({ phase: 1, ...phase1 })
  }
  if (phase2) {
    candidates.push({ phase: 2, ...phase2 })
  }

  return candidates.sort((a, b) => a.opensAt.localeCompare(b.opensAt))[0] ?? null
}

/** 학생 자유 예약 화면에 보여줄 빈 슬롯. 소속(일반/온라인반)에 맞는 슬롯만 보여준다. */
export async function fetchFreeBookableSlots(
  audience: PracticeAudience = 'regular'
): Promise<PracticeFreeSlotOption[]> {
  const admin = createAdminClient()
  const nowIso = new Date().toISOString()

  const { data, error } = await admin
    .from('practice_slots')
    .select(
      `id, teacher_id, room_no, slot_date, start_time, starts_at, status,
       free_booking_opens_at, phase2_opens_at, booking_closes_at, audience,
       profiles:profiles!practice_slots_teacher_id_fkey(id, name, email)`
    )
    .eq('status', 'open')
    .eq('audience', audience)
    .not('free_booking_opens_at', 'is', null)
    .lte('free_booking_opens_at', nowIso)
    .gt('starts_at', nowIso)
    // 마감된 주는 학생이 더 이상 예약할 수 없다.
    .or(`booking_closes_at.is.null,booking_closes_at.gt.${nowIso}`)
    .order('starts_at', { ascending: true })
    .limit(500)

  if (error) {
    console.error('[practice] failed to fetch free slots', error)
    return []
  }

  return ((data ?? []) as unknown as SlotRow[]).map((row) => {
    const teacher = firstOf(row.profiles)
    return {
      id: row.id,
      teacherId: row.teacher_id,
      teacherName: teacher?.name ?? teacher?.email ?? '이름 없음',
      roomNo: row.room_no,
      slotDate: row.slot_date,
      startTime: toTimeLabel(row.start_time),
      startsAt: row.starts_at,
      phase2OpensAt: row.phase2_opens_at,
      bookingClosesAt: row.booking_closes_at,
    }
  })
}
