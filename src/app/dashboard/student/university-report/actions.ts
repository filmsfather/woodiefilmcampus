'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { getAuthContext } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { UNIVERSITY_REPORTS_BUCKET } from '@/lib/storage/buckets'
import { parseTranscriptPdf } from '@/lib/university-report/parser'
import { decryptPdfBase64, isPdfEncrypted } from '@/lib/university-report/pdf-security'
import {
  ACHIEVEMENTS,
  COURSE_TYPES,
  SUBJECT_AREAS,
  type ParsedCourse,
  type SnapshotStatus,
} from '@/lib/university-report/types'
import type { UserProfile } from '@/lib/supabase'

const STAFF_ROLES = new Set<UserProfile['role']>(['teacher', 'manager', 'principal'])

type UploadAccess =
  | { kind: 'denied'; error: string }
  | { kind: 'granted'; profile: UserProfile; isStaff: boolean; isSelf: boolean }

async function requireUploadAccess(studentId: string): Promise<UploadAccess> {
  const { profile } = await getAuthContext()

  if (!profile) {
    return { kind: 'denied', error: '로그인이 필요합니다.' }
  }

  const isStaff = STAFF_ROLES.has(profile.role)
  const isSelf = profile.id === studentId

  if (!isStaff && !isSelf) {
    return { kind: 'denied', error: '권한이 없습니다.' }
  }

  return { kind: 'granted', profile, isStaff, isSelf }
}

async function fetchSnapshotForAccess(snapshotId: string) {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('university_report_snapshots')
    .select('id, student_id, status')
    .eq('id', snapshotId)
    .maybeSingle()

  if (error) {
    console.error('[university-report] snapshot fetch error', error)
    return null
  }

  return data
}

function pathsRevalidate(studentId: string) {
  revalidatePath('/dashboard/student/university-report')
  revalidatePath(`/dashboard/principal/university-reports/${studentId}`)
  revalidatePath('/dashboard/principal/university-reports')
}

// ---------------- 0. 사전 조사 ----------------

const saveEligibilitySchema = z.object({
  studentId: z.string().uuid('유효한 학생 ID가 아닙니다.'),
  isGed: z.boolean(),
  ruralEligible: z.boolean(),
  lowIncomeEligible: z.boolean(),
})

export type SaveEligibilityResult = { success: true } | { error: string }

/**
 * 성적증명서 업로드 전 사전 조사(검정고시/농어촌/차상위) 응답을 저장한다.
 * 학생 본인 또는 교사/매니저/원장이 호출할 수 있으며, 학생당 1행으로 upsert 한다.
 */
export async function saveEligibility(payload: unknown): Promise<SaveEligibilityResult> {
  const parsed = saveEligibilitySchema.safeParse(payload)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return { error: issue?.message ?? '입력값을 다시 확인해주세요.' }
  }

  const { studentId, isGed, ruralEligible, lowIncomeEligible } = parsed.data
  const access = await requireUploadAccess(studentId)
  if (access.kind === 'denied') {
    return { error: access.error }
  }

  const supabase = createAdminClient()
  const now = new Date().toISOString()
  const { error } = await supabase
    .from('university_report_eligibility')
    .upsert(
      {
        student_id: studentId,
        is_ged: isGed,
        rural_eligible: ruralEligible,
        low_income_eligible: lowIncomeEligible,
        surveyed_at: now,
      },
      { onConflict: 'student_id' }
    )

  if (error) {
    console.error('[university-report] saveEligibility error', error)
    return { error: '사전 조사 응답을 저장하지 못했습니다.' }
  }

  pathsRevalidate(studentId)
  return { success: true }
}

// ---------------- 1. 업로드 ----------------

const createSnapshotSchema = z.object({
  studentId: z.string().uuid('유효한 학생 ID가 아닙니다.'),
  path: z.string().min(1, '파일 경로가 비어 있습니다.'),
  originalName: z.string().min(1).max(255),
  mimeType: z.string().min(1),
  size: z.number().int().nonnegative(),
})

export type CreateSnapshotResult =
  | { success: true; snapshotId: string }
  | { error: string }

/**
 * 학생 본인 또는 교사/매니저/원장이 PDF를 Storage에 업로드한 직후 호출.
 * 기존 활성 스냅샷은 archived 처리하고, 새 스냅샷을 status='parsing'으로 생성한 뒤
 * 자산 레코드까지 함께 적재한다.
 */
export async function createSnapshotFromUpload(payload: unknown): Promise<CreateSnapshotResult> {
  const parsed = createSnapshotSchema.safeParse(payload)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return { error: issue?.message ?? '입력값을 다시 확인해주세요.' }
  }

  const { studentId, path, originalName, mimeType, size } = parsed.data
  const access = await requireUploadAccess(studentId)
  if (access.kind === 'denied') {
    return { error: access.error }
  }

  const { profile } = access
  const supabase = createAdminClient()

  // 기존 활성 스냅샷 archive
  const { error: archiveError } = await supabase
    .from('university_report_snapshots')
    .update({ status: 'archived' satisfies SnapshotStatus })
    .eq('student_id', studentId)
    .not('status', 'in', '("archived","failed")')

  if (archiveError) {
    console.error('[university-report] archive previous error', archiveError)
    return { error: '기존 성적을 정리하지 못했습니다.' }
  }

  // 새 스냅샷
  const { data: snapshot, error: insertError } = await supabase
    .from('university_report_snapshots')
    .insert({
      student_id: studentId,
      uploaded_by: profile.id,
      status: 'parsing' satisfies SnapshotStatus,
    })
    .select('id')
    .single()

  if (insertError || !snapshot) {
    console.error('[university-report] insert snapshot error', insertError)
    return { error: '성적 분석 작업을 시작하지 못했습니다.' }
  }

  // 자산 레코드
  const { error: assetError } = await supabase.from('university_report_assets').insert({
    snapshot_id: snapshot.id,
    bucket: UNIVERSITY_REPORTS_BUCKET,
    path,
    original_name: originalName,
    mime_type: mimeType,
    size,
  })

  if (assetError) {
    console.error('[university-report] insert asset error', assetError)
    await supabase
      .from('university_report_snapshots')
      .update({ status: 'failed' satisfies SnapshotStatus, parse_error: '파일 정보를 저장하지 못했습니다.' })
      .eq('id', snapshot.id)
    return { error: '업로드 정보를 저장하지 못했습니다.' }
  }

  pathsRevalidate(studentId)
  return { success: true, snapshotId: snapshot.id }
}

// ---------------- 2. 파싱 ----------------

const parseSnapshotSchema = z.object({
  snapshotId: z.string().uuid('유효한 스냅샷 ID가 아닙니다.'),
  password: z.string().max(256).optional(),
})

export type ParseSnapshotErrorCode = 'password_required' | 'wrong_password'

export type ParseSnapshotResult =
  | { success: true; snapshotId: string; courseCount: number; warnings: string[] }
  | { error: string; code?: ParseSnapshotErrorCode }

/**
 * Storage에서 PDF를 내려받아 Gemini 멀티모달 파싱 호출.
 * 결과를 courses 테이블에 일괄 적재하고 status='parsed'로 업데이트한다.
 */
export async function parseSnapshot(payload: unknown): Promise<ParseSnapshotResult> {
  const parsedInput = parseSnapshotSchema.safeParse(payload)
  if (!parsedInput.success) {
    const issue = parsedInput.error.issues[0]
    return { error: issue?.message ?? '입력값을 다시 확인해주세요.' }
  }

  const { snapshotId, password } = parsedInput.data
  const snapshot = await fetchSnapshotForAccess(snapshotId)
  if (!snapshot) {
    return { error: '존재하지 않는 분석 작업입니다.' }
  }

  const access = await requireUploadAccess(snapshot.student_id)
  if (access.kind === 'denied') {
    return { error: access.error }
  }

  const supabase = createAdminClient()

  const { data: asset, error: assetError } = await supabase
    .from('university_report_assets')
    .select('id, bucket, path, mime_type')
    .eq('snapshot_id', snapshotId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (assetError || !asset) {
    console.error('[university-report] asset fetch error', assetError)
    await supabase
      .from('university_report_snapshots')
      .update({ status: 'failed' satisfies SnapshotStatus, parse_error: '원본 파일을 찾지 못했습니다.' })
      .eq('id', snapshotId)
    pathsRevalidate(snapshot.student_id)
    return { error: '업로드된 파일을 찾지 못했습니다.' }
  }

  const { data: download, error: downloadError } = await supabase.storage
    .from(asset.bucket)
    .download(asset.path)

  if (downloadError || !download) {
    console.error('[university-report] storage download error', downloadError)
    await supabase
      .from('university_report_snapshots')
      .update({ status: 'failed' satisfies SnapshotStatus, parse_error: '원본 파일을 다운로드하지 못했습니다.' })
      .eq('id', snapshotId)
    pathsRevalidate(snapshot.student_id)
    return { error: '업로드된 파일을 불러오지 못했습니다.' }
  }

  const arrayBuffer = await download.arrayBuffer()
  let pdfBase64 = Buffer.from(arrayBuffer).toString('base64')

  // 비밀번호로 보호된 PDF면, 제출된 비밀번호로 암호를 해제한다.
  // 해제에 성공하면 비암호화 버전으로 Storage 원본을 교체하여
  // 이후 재분석/원본 다운로드에서 다시 비밀번호를 요구하지 않도록 한다.
  if (isPdfEncrypted(pdfBase64)) {
    const trimmedPassword = password?.trim() ?? ''

    if (!trimmedPassword) {
      await supabase
        .from('university_report_snapshots')
        .update({
          status: 'failed' satisfies SnapshotStatus,
          parse_error: 'PDF에 비밀번호가 설정되어 있습니다. 비밀번호를 입력한 뒤 다시 분석해 주세요.',
        })
        .eq('id', snapshotId)
      pathsRevalidate(snapshot.student_id)
      return {
        error: 'PDF에 비밀번호가 설정되어 있습니다. 비밀번호를 입력해 주세요.',
        code: 'password_required',
      }
    }

    const decrypted = decryptPdfBase64(pdfBase64, trimmedPassword)

    if (!decrypted.ok) {
      if (decrypted.reason === 'wrong_password') {
        await supabase
          .from('university_report_snapshots')
          .update({
            status: 'failed' satisfies SnapshotStatus,
            parse_error: '비밀번호가 일치하지 않습니다.',
          })
          .eq('id', snapshotId)
        pathsRevalidate(snapshot.student_id)
        return {
          error: '비밀번호가 일치하지 않습니다. 다시 확인해 주세요.',
          code: 'wrong_password',
        }
      }

      if (decrypted.reason === 'not_encrypted') {
        // /Encrypt 휴리스틱 오탐: 암호화가 아니므로 원본 그대로 진행한다.
      } else {
        await supabase
          .from('university_report_snapshots')
          .update({
            status: 'failed' satisfies SnapshotStatus,
            parse_error: '비밀번호 해제 중 오류가 발생했습니다. 다시 시도해 주세요.',
          })
          .eq('id', snapshotId)
        pathsRevalidate(snapshot.student_id)
        return { error: '비밀번호 해제 중 오류가 발생했습니다. 다시 시도해 주세요.' }
      }
    } else {
      pdfBase64 = decrypted.pdfBase64

      // 비암호화 버전으로 Storage 원본 교체 (실패해도 분석은 계속 진행).
      const decryptedBytes = Buffer.from(pdfBase64, 'base64')
      const { error: replaceError } = await supabase.storage
        .from(asset.bucket)
        .upload(asset.path, decryptedBytes, {
          contentType: 'application/pdf',
          upsert: true,
        })

      if (replaceError) {
        console.error('[university-report] decrypted upload error', replaceError)
      } else {
        await supabase
          .from('university_report_assets')
          .update({ size: decryptedBytes.byteLength })
          .eq('id', asset.id)
      }
    }
  }

  const parseResult = await parseTranscriptPdf({ pdfBase64 })

  if (!parseResult.ok) {
    await supabase
      .from('university_report_snapshots')
      .update({
        status: 'failed' satisfies SnapshotStatus,
        parse_error: parseResult.error,
        parsed_at: new Date().toISOString(),
      })
      .eq('id', snapshotId)
    pathsRevalidate(snapshot.student_id)
    return { error: parseResult.error }
  }

  const transcript = parseResult.transcript

  await supabase
    .from('university_report_courses')
    .delete()
    .eq('snapshot_id', snapshotId)

  const courseRows = transcript.courses.map((course: ParsedCourse, index: number) => ({
    snapshot_id: snapshotId,
    position: index,
    grade: course.grade,
    semester: course.semester,
    raw_subject_name: course.rawSubjectName,
    subject_area: course.subjectArea,
    course_type: course.courseType,
    is_pass_fail: course.isPassFail,
    credits: course.credits,
    rank: course.rank,
    achievement: course.achievement,
    raw_score: course.rawScore,
    subject_mean: course.subjectMean,
    std_dev: course.stdDev,
    student_count: course.studentCount,
    parser_confidence: course.parserConfidence,
  }))

  if (courseRows.length > 0) {
    const { error: courseInsertError } = await supabase
      .from('university_report_courses')
      .insert(courseRows)

    if (courseInsertError) {
      console.error('[university-report] course insert error', courseInsertError)
      await supabase
        .from('university_report_snapshots')
        .update({
          status: 'failed' satisfies SnapshotStatus,
          parse_error: '추출 결과를 저장하지 못했습니다.',
          parsed_at: new Date().toISOString(),
        })
        .eq('id', snapshotId)
      pathsRevalidate(snapshot.student_id)
      return { error: '추출 결과를 저장하지 못했습니다.' }
    }
  }

  const { error: updateError } = await supabase
    .from('university_report_snapshots')
    .update({
      status: 'parsed' satisfies SnapshotStatus,
      parsed_at: new Date().toISOString(),
      parse_error: null,
      parser_model: parseResult.model,
      parser_warnings: transcript.warnings.length > 0 ? transcript.warnings : null,
      student_name_on_doc: transcript.meta.studentNameOnDoc,
      school_name: transcript.meta.schoolName,
      doc_serial: transcript.meta.docSerial,
      doc_verify_code: transcript.meta.docVerifyCode,
    })
    .eq('id', snapshotId)

  if (updateError) {
    console.error('[university-report] snapshot finalize error', updateError)
    return { error: '분석 결과 저장에 실패했습니다.' }
  }

  pathsRevalidate(snapshot.student_id)
  return {
    success: true,
    snapshotId,
    courseCount: courseRows.length,
    warnings: transcript.warnings,
  }
}

// ---------------- 3. 재업로드를 위한 archive ----------------

const archiveSnapshotSchema = z.object({
  studentId: z.string().uuid('유효한 학생 ID가 아닙니다.'),
})

export type ArchiveSnapshotResult = { success: true } | { error: string }

export async function archiveActiveSnapshot(payload: unknown): Promise<ArchiveSnapshotResult> {
  const parsed = archiveSnapshotSchema.safeParse(payload)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return { error: issue?.message ?? '입력값을 다시 확인해주세요.' }
  }

  const access = await requireUploadAccess(parsed.data.studentId)
  if (access.kind === 'denied') {
    return { error: access.error }
  }

  const supabase = createAdminClient()
  const { error } = await supabase
    .from('university_report_snapshots')
    .update({ status: 'archived' satisfies SnapshotStatus })
    .eq('student_id', parsed.data.studentId)
    .not('status', 'in', '("archived","failed")')

  if (error) {
    console.error('[university-report] archive error', error)
    return { error: '이전 성적을 정리하지 못했습니다.' }
  }

  pathsRevalidate(parsed.data.studentId)
  return { success: true }
}

// ---------------- 4. 행 단위 수정 / 삭제 ----------------

const optionalNumber = z
  .union([z.number().finite(), z.null()])
  .optional()
  .transform((v) => (v === undefined ? null : v))

const optionalInt = z
  .union([z.number().int(), z.null()])
  .optional()
  .transform((v) => (v === undefined ? null : v))

const courseUpdateSchema = z.object({
  id: z.string().uuid('유효한 과목 ID가 아닙니다.'),
  rawSubjectName: z.string().trim().min(1, '과목명을 입력해주세요.').max(120),
  subjectArea: z.enum(SUBJECT_AREAS as readonly [string, ...string[]]),
  courseType: z.enum(COURSE_TYPES as readonly [string, ...string[]]),
  isPassFail: z.boolean(),
  credits: optionalNumber,
  rank: optionalInt.transform((v) => (v == null ? null : v)),
  achievement: z
    .union([z.enum(ACHIEVEMENTS as readonly [string, ...string[]]), z.null()])
    .optional()
    .transform((v) => (v === undefined ? null : v)),
  rawScore: optionalNumber,
  subjectMean: optionalNumber,
  stdDev: optionalNumber,
  studentCount: optionalInt,
})

const updateCoursesSchema = z.object({
  studentId: z.string().uuid('유효한 학생 ID가 아닙니다.'),
  courses: z.array(courseUpdateSchema).min(1, '수정할 과목이 없습니다.'),
})

export type UpdateCoursesResult = { success: true } | { error: string }

export async function updateCourses(payload: unknown): Promise<UpdateCoursesResult> {
  const parsed = updateCoursesSchema.safeParse(payload)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return { error: issue?.message ?? '입력값을 다시 확인해주세요.' }
  }

  const { studentId, courses } = parsed.data
  const access = await requireUploadAccess(studentId)
  if (access.kind === 'denied') {
    return { error: access.error }
  }

  const supabase = createAdminClient()

  // 수정 대상 과목들이 동일 학생 소속의 스냅샷인지 확인 (권한 우회 방지)
  const courseIds = courses.map((c) => c.id)
  const { data: existing, error: existingError } = await supabase
    .from('university_report_courses')
    .select('id, snapshot_id, university_report_snapshots!inner(student_id)')
    .in('id', courseIds)

  if (existingError) {
    console.error('[university-report] updateCourses fetch error', existingError)
    return { error: '과목 정보를 확인하지 못했습니다.' }
  }

  if (!existing || existing.length !== courseIds.length) {
    return { error: '일부 과목을 찾을 수 없습니다.' }
  }

  for (const row of existing) {
    const snap = Array.isArray(row.university_report_snapshots)
      ? row.university_report_snapshots[0]
      : row.university_report_snapshots
    if (!snap || snap.student_id !== studentId) {
      return { error: '권한이 없습니다.' }
    }
  }

  for (const course of courses) {
    const { error: updateError } = await supabase
      .from('university_report_courses')
      .update({
        raw_subject_name: course.rawSubjectName,
        subject_area: course.subjectArea,
        course_type: course.courseType,
        is_pass_fail: course.isPassFail,
        credits: course.credits,
        rank: course.rank,
        achievement: course.achievement,
        raw_score: course.rawScore,
        subject_mean: course.subjectMean,
        std_dev: course.stdDev,
        student_count: course.studentCount,
        edited_by_user: true,
      })
      .eq('id', course.id)

    if (updateError) {
      console.error('[university-report] updateCourse error', updateError)
      return { error: '과목 정보를 저장하지 못했습니다.' }
    }
  }

  pathsRevalidate(studentId)
  return { success: true }
}

const deleteCoursesSchema = z.object({
  studentId: z.string().uuid('유효한 학생 ID가 아닙니다.'),
  courseIds: z.array(z.string().uuid()).min(1, '삭제할 과목이 없습니다.'),
})

export type DeleteCoursesResult = { success: true } | { error: string }

export async function deleteCourses(payload: unknown): Promise<DeleteCoursesResult> {
  const parsed = deleteCoursesSchema.safeParse(payload)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return { error: issue?.message ?? '입력값을 다시 확인해주세요.' }
  }

  const { studentId, courseIds } = parsed.data
  const access = await requireUploadAccess(studentId)
  if (access.kind === 'denied') {
    return { error: access.error }
  }

  const supabase = createAdminClient()

  const { data: existing, error: existingError } = await supabase
    .from('university_report_courses')
    .select('id, snapshot_id, university_report_snapshots!inner(student_id)')
    .in('id', courseIds)

  if (existingError) {
    console.error('[university-report] deleteCourses fetch error', existingError)
    return { error: '과목 정보를 확인하지 못했습니다.' }
  }

  for (const row of existing ?? []) {
    const snap = Array.isArray(row.university_report_snapshots)
      ? row.university_report_snapshots[0]
      : row.university_report_snapshots
    if (!snap || snap.student_id !== studentId) {
      return { error: '권한이 없습니다.' }
    }
  }

  const { error: deleteError } = await supabase
    .from('university_report_courses')
    .delete()
    .in('id', courseIds)

  if (deleteError) {
    console.error('[university-report] deleteCourses error', deleteError)
    return { error: '과목을 삭제하지 못했습니다.' }
  }

  pathsRevalidate(studentId)
  return { success: true }
}

// ---------------- 5. PDF 다운로드용 서명 URL ----------------

const downloadUrlSchema = z.object({
  snapshotId: z.string().uuid('유효한 스냅샷 ID가 아닙니다.'),
})

export type SnapshotDownloadResult =
  | { success: true; url: string; originalName: string | null }
  | { error: string }

export async function createSnapshotDownloadUrl(payload: unknown): Promise<SnapshotDownloadResult> {
  const parsed = downloadUrlSchema.safeParse(payload)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return { error: issue?.message ?? '입력값을 다시 확인해주세요.' }
  }

  const snapshot = await fetchSnapshotForAccess(parsed.data.snapshotId)
  if (!snapshot) {
    return { error: '존재하지 않는 스냅샷입니다.' }
  }

  const access = await requireUploadAccess(snapshot.student_id)
  if (access.kind === 'denied') {
    return { error: access.error }
  }

  const supabase = createAdminClient()
  const { data: asset, error: assetError } = await supabase
    .from('university_report_assets')
    .select('id, bucket, path, original_name')
    .eq('snapshot_id', parsed.data.snapshotId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (assetError || !asset) {
    return { error: '원본 파일을 찾을 수 없습니다.' }
  }

  const { data: signed, error: signError } = await supabase.storage
    .from(asset.bucket)
    .createSignedUrl(asset.path, 60 * 10, {
      download: asset.original_name ?? '성적증명서.pdf',
    })

  if (signError || !signed?.signedUrl) {
    console.error('[university-report] sign download url error', signError)
    return { error: '다운로드 링크를 생성하지 못했습니다.' }
  }

  return { success: true, url: signed.signedUrl, originalName: asset.original_name }
}
