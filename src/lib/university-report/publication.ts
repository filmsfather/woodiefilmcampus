/**
 * 지원가능대학 분석 리포트의 발행(공개) 레코드 조회 헬퍼.
 *
 * 발행은 원장이 승인한 경우에만 생성되며, 학생 대시보드 노출 여부를 결정합니다.
 * share_token은 추후 로그인 없는 공유 링크(/r/[token])를 위해 미리 발급해 둡니다.
 */

import { createAdminClient } from '@/lib/supabase/admin'

export type PublicationStatus = 'published' | 'revoked'

export interface ReportPublication {
  id: string
  snapshotId: string | null
  studentId: string
  publishedBy: string
  shareToken: string
  principalComment: string | null
  status: PublicationStatus
  publishedAt: string
  revokedAt: string | null
  expiresAt: string | null
  createdAt: string
  updatedAt: string
}

interface PublicationRow {
  id: string
  snapshot_id: string | null
  student_id: string
  published_by: string
  share_token: string
  principal_comment: string | null
  status: PublicationStatus
  published_at: string
  revoked_at: string | null
  expires_at: string | null
  created_at: string
  updated_at: string
}

function toPublication(row: PublicationRow): ReportPublication {
  return {
    id: row.id,
    snapshotId: row.snapshot_id,
    studentId: row.student_id,
    publishedBy: row.published_by,
    shareToken: row.share_token,
    principalComment: row.principal_comment,
    status: row.status,
    publishedAt: row.published_at,
    revokedAt: row.revoked_at,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

const PUBLICATION_COLUMNS =
  'id, snapshot_id, student_id, published_by, share_token, principal_comment, status, published_at, revoked_at, expires_at, created_at, updated_at'

/**
 * 학생의 현재 발행(published) 리포트를 반환. 없으면 null.
 * partial unique index로 학생당 published 1개가 보장됨.
 */
export async function fetchPublicationForStudent(
  studentId: string
): Promise<ReportPublication | null> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('university_report_publications')
    .select(PUBLICATION_COLUMNS)
    .eq('student_id', studentId)
    .eq('status', 'published')
    .maybeSingle()

  if (error) {
    console.error('[university-report] fetchPublicationForStudent error', error)
    return null
  }
  if (!data) return null
  return toPublication(data as PublicationRow)
}

/**
 * 학생의 가장 최근 발행 레코드를 status 무관하게 반환(원장 화면의 발행 상태 표시용).
 */
export async function fetchLatestPublicationForStudent(
  studentId: string
): Promise<ReportPublication | null> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('university_report_publications')
    .select(PUBLICATION_COLUMNS)
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[university-report] fetchLatestPublicationForStudent error', error)
    return null
  }
  if (!data) return null
  return toPublication(data as PublicationRow)
}

/**
 * 공유 토큰으로 발행 리포트를 조회(추후 /r/[token] 라우트용).
 * 현재는 학생 라우트만 소비하지만 시그니처를 미리 제공한다.
 */
export async function fetchPublicationByToken(
  token: string
): Promise<ReportPublication | null> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('university_report_publications')
    .select(PUBLICATION_COLUMNS)
    .eq('share_token', token)
    .eq('status', 'published')
    .maybeSingle()

  if (error) {
    console.error('[university-report] fetchPublicationByToken error', error)
    return null
  }
  if (!data) return null

  const publication = toPublication(data as PublicationRow)
  if (publication.expiresAt && new Date(publication.expiresAt).getTime() < Date.now()) {
    return null
  }
  return publication
}

/**
 * 학생이 공유 링크(/r/[token])에서 분류한 "지원 희망/희망하지 않음" 결과를
 * evaluation_id 기준으로 반환한다(값: true=지원 희망, false=희망하지 않음).
 *
 * 재발행으로 publication이 바뀌어도 학생의 최신 선택을 노출하기 위해 student_id로 조회하고,
 * evaluation_id별로 가장 최근(created_at desc) 항목만 채택한다.
 */
export async function fetchLatestUniversityWishMap(
  studentId: string
): Promise<Record<string, boolean>> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('university_report_university_wishes')
    .select('evaluation_id, wish, created_at')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[university-report] fetchLatestUniversityWishMap error', error)
    return {}
  }

  const map: Record<string, boolean> = {}
  for (const row of data ?? []) {
    const key = row.evaluation_id as string
    if (!(key in map)) {
      map[key] = row.wish as boolean
    }
  }
  return map
}
