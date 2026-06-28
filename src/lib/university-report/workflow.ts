/**
 * 지원가능대학 레포트 워크플로우(6단계) 진행 현황 집계.
 *
 * 단계별 완료 여부는 단일 테이블이 아니라 여러 테이블을 학생별로 합성해 계산한다.
 * 모든 읽기는 admin(service role) 클라이언트로 수행하며, 접근 제어는 호출하는 페이지에서
 * 역할(원장)로 강제한다. (data.ts / publication.ts 패턴과 동일)
 *
 * 단계 정의:
 *  1. 성적표 제출   : 검정고시는 면제(완료) / 그 외는 활성 스냅샷 존재
 *  2. 성적 분석     : 검정고시는 발행 존재 / 그 외는 evaluations 1건 이상
 *  3. 컨설팅 방향   : consult_requests 행 존재
 *  4. 원장 추천     : wishlists.status in (proposed, revising, confirmed)
 *  5. 새 의견(주의) : 미확정 상태에서 원장이 아직 응답하지 않은 새 입력이 있을 때.
 *                    (wishlists.status='revising' 또는 원장 추천 전 consult_requests 제출)
 *  6. 대학 확정     : wishlists.status='confirmed'
 */

import { createAdminClient } from '@/lib/supabase/admin'

export interface StudentWorkflowRow {
  studentId: string
  name: string | null
  email: string
  className: string | null
  isGed: boolean
  stage1Submitted: boolean
  stage2Analyzed: boolean
  stage3ConsultSubmitted: boolean
  stage4Recommended: boolean
  stage5NewOpinion: boolean
  stage6Confirmed: boolean
}

export async function fetchStudentWorkflowStatuses(): Promise<StudentWorkflowRow[]> {
  const supabase = createAdminClient()

  const { data: students, error: studentsError } = await supabase
    .from('profiles')
    .select('id, name, email, class_id')
    .eq('role', 'student')
    .eq('status', 'approved')

  if (studentsError || !students) {
    if (studentsError) {
      console.error('[university-report] fetchStudentWorkflowStatuses students error', studentsError)
    }
    return []
  }

  const studentIds = students.map((s) => s.id)
  if (studentIds.length === 0) {
    return []
  }

  const classIds = Array.from(new Set(students.map((s) => s.class_id).filter(Boolean) as string[]))
  let classNameMap = new Map<string, string>()
  if (classIds.length > 0) {
    const { data: classes } = await supabase.from('classes').select('id, name').in('id', classIds)
    classNameMap = new Map((classes ?? []).map((c) => [c.id, c.name]))
  }

  // 사전조사(검정고시)
  const { data: eligibilityRows } = await supabase
    .from('university_report_eligibility')
    .select('student_id, is_ged')
    .in('student_id', studentIds)
  const gedSet = new Set(
    (eligibilityRows ?? []).filter((row) => row.is_ged).map((row) => row.student_id)
  )

  // 활성 스냅샷(최신 우선, archived/failed 제외)
  const { data: snapshots } = await supabase
    .from('university_report_snapshots')
    .select('id, student_id, status, created_at')
    .in('student_id', studentIds)
    .order('created_at', { ascending: false })
  const activeSnapshotByStudent = new Map<string, string>()
  for (const snap of snapshots ?? []) {
    if (snap.status === 'archived' || snap.status === 'failed') continue
    if (!activeSnapshotByStudent.has(snap.student_id)) {
      activeSnapshotByStudent.set(snap.student_id, snap.id)
    }
  }

  // 활성 스냅샷별 평가(evaluations) 존재 여부
  const activeSnapshotIds = Array.from(activeSnapshotByStudent.values())
  const snapshotsWithEvaluations = new Set<string>()
  if (activeSnapshotIds.length > 0) {
    const { data: evaluationRows } = await supabase
      .from('university_report_evaluations')
      .select('snapshot_id')
      .in('snapshot_id', activeSnapshotIds)
    for (const row of evaluationRows ?? []) {
      snapshotsWithEvaluations.add(row.snapshot_id)
    }
  }

  // 발행(published) 학생 집합 (검정고시 2단계 및 향후 링크 발송 판정용)
  const { data: publicationRows } = await supabase
    .from('university_report_publications')
    .select('student_id')
    .eq('status', 'published')
    .in('student_id', studentIds)
  const publishedSet = new Set((publicationRows ?? []).map((row) => row.student_id))

  // 컨설팅 방향 제출
  const { data: consultRows } = await supabase
    .from('university_report_consult_requests')
    .select('student_id, status')
    .in('student_id', studentIds)
  const consultSubmittedSet = new Set<string>()
  const consultRequestedSet = new Set<string>()
  for (const row of consultRows ?? []) {
    consultSubmittedSet.add(row.student_id)
    if (row.status === 'requested') consultRequestedSet.add(row.student_id)
  }

  // 희망대학 협의(wishlist) 상태
  const { data: wishlistRows } = await supabase
    .from('university_wishlists')
    .select('student_id, status, record_request_status')
    .in('student_id', studentIds)
  const wishlistStatusByStudent = new Map<string, string>()
  const recordSubmittedSet = new Set<string>()
  for (const row of wishlistRows ?? []) {
    wishlistStatusByStudent.set(row.student_id, row.status)
    if (row.record_request_status === 'submitted') recordSubmittedSet.add(row.student_id)
  }

  const rows = students
    .map<StudentWorkflowRow>((student) => {
      const isGed = gedSet.has(student.id)
      const hasActiveSnapshot = activeSnapshotByStudent.has(student.id)
      const activeSnapshotId = activeSnapshotByStudent.get(student.id)
      const hasEvaluations = activeSnapshotId
        ? snapshotsWithEvaluations.has(activeSnapshotId)
        : false
      const wishlistStatus = wishlistStatusByStudent.get(student.id) ?? null

      const isPublished = publishedSet.has(student.id)
      const stage1Submitted = isGed || hasActiveSnapshot
      // 비검정고시: 활성 스냅샷에 평가가 있으면 분석 완료.
      // 단, 발행(published)은 발행 시점에 평가가 1건 이상 존재해야만 가능하므로
      // (publishReportAction의 evalCount 가드) "발행됨"은 분석 완료의 충분조건이다.
      // 과거 데이터 변경 등으로 평가 행이 유실되어도 이미 분석·발행된 학생은 완료로 표시한다.
      const stage2Analyzed = isGed ? isPublished : hasEvaluations || isPublished
      const stage3ConsultSubmitted = consultSubmittedSet.has(student.id)
      const stage4Recommended =
        wishlistStatus === 'proposed' ||
        wishlistStatus === 'revising' ||
        wishlistStatus === 'confirmed'
      const stage6Confirmed = wishlistStatus === 'confirmed'
      // 새 의견은 "원장이 아직 응답하지 않은 새 입력"이 있을 때만 표시한다.
      //  - 학생이 추천을 보고 수정 요청을 한 경우(wishlist='revising')
      //  - 또는 원장 추천 전 단계에서 컨설팅 방향이 제출된 경우
      //  - 또는 학생이 생기부를 제출한 경우(record_request_status='submitted')
      // 원장이 추천을 (다시) 전송하면 wishlist 상태가 'proposed'로 바뀌어 해소되고,
      // 확정(confirmed) 이후에는 항상 제외한다.
      const stage5NewOpinion =
        !stage6Confirmed &&
        (wishlistStatus === 'revising' ||
          recordSubmittedSet.has(student.id) ||
          (consultRequestedSet.has(student.id) && !stage4Recommended))

      return {
        studentId: student.id,
        name: student.name,
        email: student.email,
        className: student.class_id ? classNameMap.get(student.class_id) ?? null : null,
        isGed,
        stage1Submitted,
        stage2Analyzed,
        stage3ConsultSubmitted,
        stage4Recommended,
        stage5NewOpinion,
        stage6Confirmed,
      }
    })
    .sort((a, b) => (a.name ?? a.email).localeCompare(b.name ?? b.email, 'ko'))

  return rows
}
