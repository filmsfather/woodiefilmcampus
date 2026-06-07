import type { SupabaseClient } from '@supabase/supabase-js'

export {
  SPECIAL_LECTURE_VIDEOS_BUCKET,
  SPECIAL_LECTURE_MAX_VIDEO_SIZE,
  SPECIAL_LECTURE_SIGNED_URL_TTL_SECONDS,
  SPECIAL_LECTURE_DEFAULT_GRANT_HOURS,
  SPECIAL_LECTURE_MAX_GRANT_HOURS,
  SPECIAL_LECTURE_MANAGE_ROLES,
  SPECIAL_LECTURE_AUDIENCE_MODES,
  SPECIAL_LECTURE_AUDIENCE_LABELS,
  isSpecialLectureManageRole,
  isSpecialLectureAudienceMode,
  type SpecialLectureManageRole,
  type SpecialLectureAudienceMode,
} from '@/lib/special-lectures-shared'

import {
  SPECIAL_LECTURE_VIDEOS_BUCKET,
  SPECIAL_LECTURE_SIGNED_URL_TTL_SECONDS,
  type SpecialLectureAudienceMode,
} from '@/lib/special-lectures-shared'

export interface SpecialLectureVideoAsset {
  id: string
  bucket: string
  path: string
  mimeType: string | null
  size: number | null
  originalName: string | null
}

export interface SpecialLecture {
  id: string
  title: string
  description: string | null
  created_by: string
  created_at: string
  updated_at: string
  video_asset_id: string | null
  video_asset: SpecialLectureVideoAsset | null
}

interface SpecialLectureRow {
  id: string
  title: string
  description: string | null
  created_by: string
  created_at: string
  updated_at: string
  video_asset_id: string | null
  video_asset:
    | {
        id: string
        bucket: string | null
        path: string | null
        mime_type: string | null
        size: number | null
        metadata: Record<string, unknown> | null
      }
    | Array<{
        id: string
        bucket: string | null
        path: string | null
        mime_type: string | null
        size: number | null
        metadata: Record<string, unknown> | null
      }>
    | null
}

function deriveOriginalName(metadata: Record<string, unknown> | null | undefined): string | null {
  if (!metadata) return null
  const candidate = (metadata as { originalName?: unknown }).originalName
  if (typeof candidate === 'string' && candidate.length > 0) {
    return candidate
  }
  return null
}

function normalizeRow(row: SpecialLectureRow | null | undefined): SpecialLecture | null {
  if (!row) return null
  const mediaRelation = Array.isArray(row.video_asset) ? row.video_asset[0] : row.video_asset
  const video: SpecialLectureVideoAsset | null = mediaRelation && mediaRelation.bucket && mediaRelation.path
    ? {
        id: String(mediaRelation.id),
        bucket: String(mediaRelation.bucket),
        path: String(mediaRelation.path),
        mimeType: mediaRelation.mime_type ?? null,
        size: typeof mediaRelation.size === 'number' ? mediaRelation.size : null,
        originalName: deriveOriginalName(mediaRelation.metadata ?? null),
      }
    : null

  return {
    id: String(row.id),
    title: row.title,
    description: row.description,
    created_by: String(row.created_by),
    created_at: row.created_at,
    updated_at: row.updated_at,
    video_asset_id: row.video_asset_id ? String(row.video_asset_id) : null,
    video_asset: video,
  }
}

const SPECIAL_LECTURE_SELECT = `
  id,
  title,
  description,
  created_by,
  created_at,
  updated_at,
  video_asset_id,
  video_asset:media_assets(id, bucket, path, mime_type, size, metadata)
`

export async function fetchSpecialLectures(supabase: SupabaseClient): Promise<SpecialLecture[]> {
  const { data, error } = await supabase
    .from('special_lectures')
    .select(SPECIAL_LECTURE_SELECT)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[special-lectures] failed to fetch list', error)
    throw error
  }

  return (data ?? [])
    .map((row) => normalizeRow(row as SpecialLectureRow))
    .filter((row): row is SpecialLecture => row !== null)
}

export async function getSpecialLecture(
  supabase: SupabaseClient,
  id: string
): Promise<SpecialLecture | null> {
  const { data, error } = await supabase
    .from('special_lectures')
    .select(SPECIAL_LECTURE_SELECT)
    .eq('id', id)
    .maybeSingle()

  if (error) {
    console.error('[special-lectures] failed to fetch one', error)
    throw error
  }

  return normalizeRow(data as SpecialLectureRow | null)
}

export async function getSignedSpecialLectureVideoUrl(
  supabase: SupabaseClient,
  path: string,
  ttl: number = SPECIAL_LECTURE_SIGNED_URL_TTL_SECONDS
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(SPECIAL_LECTURE_VIDEOS_BUCKET)
    .createSignedUrl(path, ttl)

  if (error) {
    console.error('[special-lectures] failed to sign video url', error)
    return null
  }

  return data?.signedUrl ?? null
}

// ----- Grant 모델 ---------------------------------------------------------

export interface SpecialLectureGrant {
  id: string
  specialLectureId: string
  audienceMode: SpecialLectureAudienceMode
  expiresAt: string
  revokedAt: string | null
  createdAt: string
  createdBy: string
  classIds: string[]
  studentIds: string[]
}

export interface SpecialLectureActiveGrantSummary {
  activeGrantCount: number
  latestExpiresAt: string | null
}

interface SpecialLectureGrantRow {
  id: string
  special_lecture_id: string
  audience_mode: string
  expires_at: string
  revoked_at: string | null
  created_at: string
  created_by: string
}

function toAudienceMode(value: string | null | undefined): SpecialLectureAudienceMode {
  if (value === 'all_students' || value === 'class' || value === 'student') {
    return value
  }
  return 'class'
}

export async function fetchSpecialLectureGrants(
  supabase: SupabaseClient,
  lectureId: string
): Promise<SpecialLectureGrant[]> {
  const { data, error } = await supabase
    .from('special_lecture_grants')
    .select('id, special_lecture_id, audience_mode, expires_at, revoked_at, created_at, created_by')
    .eq('special_lecture_id', lectureId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[special-lectures] failed to fetch grants', error)
    return []
  }

  const grants = (data ?? []) as SpecialLectureGrantRow[]
  if (grants.length === 0) {
    return []
  }

  const grantIds = grants.map((row) => String(row.id))

  const [classRows, studentRows] = await Promise.all([
    supabase
      .from('special_lecture_grant_classes')
      .select('grant_id, class_id')
      .in('grant_id', grantIds),
    supabase
      .from('special_lecture_grant_students')
      .select('grant_id, student_id')
      .in('grant_id', grantIds),
  ])

  if (classRows.error) {
    console.error('[special-lectures] failed to fetch grant classes', classRows.error)
  }
  if (studentRows.error) {
    console.error('[special-lectures] failed to fetch grant students', studentRows.error)
  }

  const classMap = new Map<string, string[]>()
  for (const row of (classRows.data ?? []) as Array<{ grant_id: string; class_id: string }>) {
    const list = classMap.get(String(row.grant_id)) ?? []
    list.push(String(row.class_id))
    classMap.set(String(row.grant_id), list)
  }

  const studentMap = new Map<string, string[]>()
  for (const row of (studentRows.data ?? []) as Array<{ grant_id: string; student_id: string }>) {
    const list = studentMap.get(String(row.grant_id)) ?? []
    list.push(String(row.student_id))
    studentMap.set(String(row.grant_id), list)
  }

  return grants.map((row) => ({
    id: String(row.id),
    specialLectureId: String(row.special_lecture_id),
    audienceMode: toAudienceMode(row.audience_mode),
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at ?? null,
    createdAt: row.created_at,
    createdBy: String(row.created_by),
    classIds: classMap.get(String(row.id)) ?? [],
    studentIds: studentMap.get(String(row.id)) ?? [],
  }))
}

export async function fetchSpecialLectureActiveGrantSummary(
  supabase: SupabaseClient,
  lectureIds: string[]
): Promise<Map<string, SpecialLectureActiveGrantSummary>> {
  const result = new Map<string, SpecialLectureActiveGrantSummary>()
  if (lectureIds.length === 0) return result

  for (const id of lectureIds) {
    result.set(id, { activeGrantCount: 0, latestExpiresAt: null })
  }

  const nowIso = new Date().toISOString()
  const { data, error } = await supabase
    .from('special_lecture_grants')
    .select('special_lecture_id, expires_at')
    .in('special_lecture_id', lectureIds)
    .is('revoked_at', null)
    .gt('expires_at', nowIso)

  if (error) {
    console.error('[special-lectures] failed to fetch active grant summary', error)
    return result
  }

  for (const row of (data ?? []) as Array<{ special_lecture_id: string; expires_at: string }>) {
    const id = String(row.special_lecture_id)
    const current = result.get(id) ?? { activeGrantCount: 0, latestExpiresAt: null }
    current.activeGrantCount += 1
    if (!current.latestExpiresAt || row.expires_at > current.latestExpiresAt) {
      current.latestExpiresAt = row.expires_at
    }
    result.set(id, current)
  }

  return result
}

// ----- Audience 옵션 (반·학생 목록 조회) ---------------------------------

export interface SpecialLectureViewLogEntry {
  id: string
  viewedAt: string
  userAgent: string | null
  ip: string | null
  viewerId: string
  viewerName: string | null
  viewerEmail: string | null
  viewerRole: string | null
}

export interface SpecialLectureClassOption {
  id: string
  name: string
  studentCount: number
}

export interface SpecialLectureStudentOption {
  id: string
  name: string | null
  email: string | null
  classNames: string[]
}

export async function fetchSpecialLectureAudienceOptions(supabase: SupabaseClient): Promise<{
  classes: SpecialLectureClassOption[]
  students: SpecialLectureStudentOption[]
}> {
  const [classesResult, studentsResult, classStudentsResult] = await Promise.all([
    supabase
      .from('classes')
      .select('id, name')
      .order('name', { ascending: true }),
    supabase
      .from('profiles')
      .select('id, name, email')
      .eq('role', 'student')
      .eq('status', 'approved')
      .order('name', { ascending: true, nullsFirst: false }),
    supabase
      .from('class_students')
      .select('class_id, student_id'),
  ])

  if (classesResult.error) {
    console.error('[special-lectures] failed to load classes', classesResult.error)
  }
  if (studentsResult.error) {
    console.error('[special-lectures] failed to load students', studentsResult.error)
  }
  if (classStudentsResult.error) {
    console.error('[special-lectures] failed to load class_students', classStudentsResult.error)
  }

  const classesData = (classesResult.data ?? []) as Array<{ id: string; name: string }>
  const studentsData = (studentsResult.data ?? []) as Array<{
    id: string
    name: string | null
    email: string | null
  }>
  const classStudentsData = (classStudentsResult.data ?? []) as Array<{
    class_id: string
    student_id: string
  }>

  const studentCountByClass = new Map<string, number>()
  const classNamesByStudent = new Map<string, string[]>()
  const classNameById = new Map<string, string>()

  for (const klass of classesData) {
    classNameById.set(String(klass.id), klass.name)
  }

  for (const link of classStudentsData) {
    const classId = String(link.class_id)
    const studentId = String(link.student_id)
    studentCountByClass.set(classId, (studentCountByClass.get(classId) ?? 0) + 1)
    const className = classNameById.get(classId)
    if (className) {
      const list = classNamesByStudent.get(studentId) ?? []
      list.push(className)
      classNamesByStudent.set(studentId, list)
    }
  }

  return {
    classes: classesData.map((klass) => ({
      id: String(klass.id),
      name: klass.name,
      studentCount: studentCountByClass.get(String(klass.id)) ?? 0,
    })),
    students: studentsData.map((student) => ({
      id: String(student.id),
      name: student.name,
      email: student.email,
      classNames: classNamesByStudent.get(String(student.id)) ?? [],
    })),
  }
}

export async function fetchSpecialLectureViewLog(
  supabase: SupabaseClient,
  lectureId: string,
  limit = 200
): Promise<SpecialLectureViewLogEntry[]> {
  const { data, error } = await supabase
    .from('special_lecture_views')
    .select(
      `id,
       viewed_at,
       user_agent,
       ip,
       viewer_id,
       viewer:profiles!special_lecture_views_viewer_id_fkey(id, name, email, role)
      `
    )
    .eq('special_lecture_id', lectureId)
    .order('viewed_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('[special-lectures] failed to fetch view log', error)
    return []
  }

  type Row = {
    id: string
    viewed_at: string
    user_agent: string | null
    ip: string | null
    viewer_id: string
    viewer:
      | { id: string; name: string | null; email: string | null; role: string | null }
      | Array<{ id: string; name: string | null; email: string | null; role: string | null }>
      | null
  }

  return (data ?? []).map((rawRow) => {
    const row = rawRow as Row
    const viewerRelation = Array.isArray(row.viewer) ? row.viewer[0] : row.viewer
    return {
      id: String(row.id),
      viewedAt: row.viewed_at,
      userAgent: row.user_agent,
      ip: row.ip,
      viewerId: String(row.viewer_id),
      viewerName: viewerRelation?.name ?? null,
      viewerEmail: viewerRelation?.email ?? null,
      viewerRole: viewerRelation?.role ?? null,
    }
  })
}
