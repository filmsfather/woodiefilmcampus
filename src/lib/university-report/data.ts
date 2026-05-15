/**
 * 학교생활기록부 스냅샷 관련 서버 측 데이터 조회 헬퍼.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import type { SnapshotStatus, SnapshotSummary } from '@/lib/university-report/types'

interface SnapshotRow {
  id: string
  student_id: string
  uploaded_by: string
  status: SnapshotStatus
  student_name_on_doc: string | null
  school_name: string | null
  doc_serial: string | null
  doc_verify_code: string | null
  parsed_at: string | null
  parse_error: string | null
  parser_model: string | null
  parser_warnings: string[] | null
  created_at: string
  updated_at: string
}

function toSummary(row: SnapshotRow, courseCount: number): SnapshotSummary {
  return {
    id: row.id,
    studentId: row.student_id,
    uploadedBy: row.uploaded_by,
    status: row.status,
    studentNameOnDoc: row.student_name_on_doc,
    schoolName: row.school_name,
    docSerial: row.doc_serial,
    docVerifyCode: row.doc_verify_code,
    parsedAt: row.parsed_at,
    parseError: row.parse_error,
    parserModel: row.parser_model,
    parserWarnings: row.parser_warnings ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    courseCount,
  }
}

/**
 * 학생의 활성 스냅샷(archived/failed 제외)을 반환.
 * 없으면 null. 활성 스냅샷은 unique index로 학생당 1개임이 보장됨.
 */
export async function fetchActiveSnapshot(studentId: string): Promise<SnapshotSummary | null> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('university_report_snapshots')
    .select(
      'id, student_id, uploaded_by, status, student_name_on_doc, school_name, doc_serial, doc_verify_code, parsed_at, parse_error, parser_model, parser_warnings, created_at, updated_at'
    )
    .eq('student_id', studentId)
    .not('status', 'in', '("archived","failed")')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[university-report] fetchActiveSnapshot error', error)
    return null
  }

  if (!data) {
    return null
  }

  const { count } = await supabase
    .from('university_report_courses')
    .select('id', { count: 'exact', head: true })
    .eq('snapshot_id', data.id)

  return toSummary(data, count ?? 0)
}

/**
 * 학생의 최신 스냅샷을 status 무관하게 반환.
 * 활성 스냅샷이 없고 마지막이 failed였던 경우 등을 보여주기 위해 사용.
 */
export async function fetchLatestSnapshot(studentId: string): Promise<SnapshotSummary | null> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('university_report_snapshots')
    .select(
      'id, student_id, uploaded_by, status, student_name_on_doc, school_name, doc_serial, doc_verify_code, parsed_at, parse_error, parser_model, parser_warnings, created_at, updated_at'
    )
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[university-report] fetchLatestSnapshot error', error)
    return null
  }

  if (!data) {
    return null
  }

  const { count } = await supabase
    .from('university_report_courses')
    .select('id', { count: 'exact', head: true })
    .eq('snapshot_id', data.id)

  return toSummary(data, count ?? 0)
}

export interface CourseRow {
  id: string
  position: number
  grade: number | null
  semester: number | null
  rawSubjectName: string
  subjectArea: string
  courseType: string
  isPassFail: boolean
  credits: number | null
  rank: number | null
  achievement: string | null
  rawScore: number | null
  subjectMean: number | null
  stdDev: number | null
  studentCount: number | null
  parserConfidence: 'high' | 'low'
  editedByUser: boolean
}

export async function fetchCoursesForSnapshot(snapshotId: string): Promise<CourseRow[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('university_report_courses')
    .select(
      'id, position, grade, semester, raw_subject_name, subject_area, course_type, is_pass_fail, credits, rank, achievement, raw_score, subject_mean, std_dev, student_count, parser_confidence, edited_by_user'
    )
    .eq('snapshot_id', snapshotId)
    .order('position', { ascending: true })

  if (error || !data) {
    if (error) {
      console.error('[university-report] fetchCoursesForSnapshot error', error)
    }
    return []
  }

  return data.map((row) => ({
    id: row.id,
    position: row.position,
    grade: row.grade,
    semester: row.semester,
    rawSubjectName: row.raw_subject_name,
    subjectArea: row.subject_area,
    courseType: row.course_type,
    isPassFail: row.is_pass_fail,
    credits: row.credits,
    rank: row.rank,
    achievement: row.achievement,
    rawScore: row.raw_score,
    subjectMean: row.subject_mean,
    stdDev: row.std_dev,
    studentCount: row.student_count,
    parserConfidence: row.parser_confidence === 'low' ? 'low' : 'high',
    editedByUser: row.edited_by_user,
  }))
}

export interface GradeSemesterCount {
  grade: number
  semester: number
  count: number
}

export async function fetchGradeSemesterCounts(snapshotId: string): Promise<GradeSemesterCount[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('university_report_courses')
    .select('grade, semester')
    .eq('snapshot_id', snapshotId)

  if (error || !data) {
    if (error) {
      console.error('[university-report] fetchGradeSemesterCounts error', error)
    }
    return []
  }

  const buckets = new Map<string, GradeSemesterCount>()
  for (const row of data) {
    if (row.grade == null || row.semester == null) continue
    const key = `${row.grade}-${row.semester}`
    const existing = buckets.get(key)
    if (existing) {
      existing.count += 1
    } else {
      buckets.set(key, { grade: row.grade, semester: row.semester, count: 1 })
    }
  }

  return Array.from(buckets.values()).sort((a, b) => {
    if (a.grade !== b.grade) return a.grade - b.grade
    return a.semester - b.semester
  })
}

export interface StudentSnapshotStatusRow {
  studentId: string
  name: string | null
  email: string
  className: string | null
  snapshotStatus: SnapshotStatus | null
  courseCount: number
  schoolName: string | null
  studentNameOnDoc: string | null
  updatedAt: string | null
  parseError: string | null
}

/**
 * 교장 페이지의 학생별 스냅샷 상태 목록 조회.
 * 활성 스냅샷이 없으면 가장 최근 스냅샷(있다면)을 폴백으로 반영.
 */
export async function fetchStudentSnapshotStatuses(): Promise<StudentSnapshotStatusRow[]> {
  const supabase = createAdminClient()

  const { data: students, error: studentsError } = await supabase
    .from('profiles')
    .select('id, name, email, class_id')
    .eq('role', 'student')
    .eq('status', 'approved')

  if (studentsError || !students) {
    if (studentsError) {
      console.error('[university-report] fetchStudentSnapshotStatuses students error', studentsError)
    }
    return []
  }

  const classIds = Array.from(new Set(students.map((s) => s.class_id).filter(Boolean) as string[]))
  let classNameMap = new Map<string, string>()
  if (classIds.length > 0) {
    const { data: classes } = await supabase
      .from('classes')
      .select('id, name')
      .in('id', classIds)
    classNameMap = new Map((classes ?? []).map((c) => [c.id, c.name]))
  }

  const studentIds = students.map((s) => s.id)
  if (studentIds.length === 0) {
    return []
  }

  const { data: snapshots } = await supabase
    .from('university_report_snapshots')
    .select(
      'id, student_id, status, student_name_on_doc, school_name, parse_error, parsed_at, updated_at, created_at'
    )
    .in('student_id', studentIds)
    .order('created_at', { ascending: false })

  // 학생별 최신 우선 정렬 후 그룹핑
  const latestActive = new Map<string, NonNullable<typeof snapshots>[number]>()
  const latestAny = new Map<string, NonNullable<typeof snapshots>[number]>()
  for (const snap of snapshots ?? []) {
    if (!latestAny.has(snap.student_id)) {
      latestAny.set(snap.student_id, snap)
    }
    if (
      snap.status !== 'archived' &&
      snap.status !== 'failed' &&
      !latestActive.has(snap.student_id)
    ) {
      latestActive.set(snap.student_id, snap)
    }
  }

  const snapshotIdsForCount: string[] = []
  for (const snap of latestActive.values()) {
    snapshotIdsForCount.push(snap.id)
  }

  const courseCountMap = new Map<string, number>()
  if (snapshotIdsForCount.length > 0) {
    const { data: courseRows } = await supabase
      .from('university_report_courses')
      .select('snapshot_id')
      .in('snapshot_id', snapshotIdsForCount)
    for (const row of courseRows ?? []) {
      courseCountMap.set(row.snapshot_id, (courseCountMap.get(row.snapshot_id) ?? 0) + 1)
    }
  }

  return students
    .map<StudentSnapshotStatusRow>((student) => {
      const activeSnap = latestActive.get(student.id)
      const anySnap = latestAny.get(student.id)
      const snap = activeSnap ?? anySnap ?? null

      return {
        studentId: student.id,
        name: student.name,
        email: student.email,
        className: student.class_id ? classNameMap.get(student.class_id) ?? null : null,
        snapshotStatus: snap?.status ?? null,
        courseCount: activeSnap ? courseCountMap.get(activeSnap.id) ?? 0 : 0,
        schoolName: snap?.school_name ?? null,
        studentNameOnDoc: snap?.student_name_on_doc ?? null,
        updatedAt: snap?.updated_at ?? null,
        parseError: snap?.parse_error ?? null,
      }
    })
    .sort((a, b) => {
      const aName = a.name ?? a.email
      const bName = b.name ?? b.email
      return aName.localeCompare(bName, 'ko')
    })
}
