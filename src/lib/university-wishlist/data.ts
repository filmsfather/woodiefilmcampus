/**
 * 희망대학 선정 협의(wishlist) 데이터 조회 헬퍼.
 *
 * 모든 읽기는 admin(service role) 클라이언트로 수행하며, 접근 제어는 호출하는
 * 서버 액션/페이지에서 역할(원장/학생 본인)로 강제한다. (publication.ts 패턴과 동일)
 *
 * 대학·모집단위 메타데이터는 프리셋(`presets/`)에서 조인한다.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import {
  PROGRAM_PRESETS,
  getProgramPreset,
  getUniversityPreset,
} from '@/lib/university-policy/presets'
import {
  isYedaeUniversity,
  resolveWishlistCategory,
  type WishlistCategory,
} from '@/lib/university-policy/yedae'

export type WishlistStatus = 'draft' | 'proposed' | 'revising' | 'confirmed'
export type WishlistAuthorRole = 'principal' | 'teacher' | 'student'
export type WishlistProposedBy = 'principal' | 'student'

export const WISHLIST_STATUS_LABELS: Record<WishlistStatus, string> = {
  draft: '추천 준비 중',
  proposed: '학생 검토 대기',
  revising: '원장 답변 대기',
  confirmed: '희망대학 확정',
}

export interface WishlistItem {
  id: string
  wishlistId: string
  programKey: string | null
  universityId: string | null
  category: WishlistCategory
  proposedBy: WishlistProposedBy
  sortOrder: number
  note: string | null
  createdAt: string
  // 프리셋 조인 (없으면 라벨/직접입력으로 폴백)
  universityName: string
  shortName: string | null
  programName: string
  admissionTrack: string
  programYear: number | null
  region: string | null
}

export interface WishlistMessage {
  id: string
  wishlistId: string
  authorId: string
  authorRole: WishlistAuthorRole
  authorName: string
  body: string
  createdAt: string
}

export interface Wishlist {
  id: string
  studentId: string
  snapshotId: string | null
  status: WishlistStatus
  createdBy: string
  confirmedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface WishlistDetail {
  wishlist: Wishlist
  items: WishlistItem[]
  messages: WishlistMessage[]
  generalCount: number
  specializedCount: number
  kartsCount: number
}

interface WishlistRow {
  id: string
  student_id: string
  snapshot_id: string | null
  status: WishlistStatus
  created_by: string
  confirmed_at: string | null
  created_at: string
  updated_at: string
}

interface WishlistItemRow {
  id: string
  wishlist_id: string
  program_key: string | null
  university_id: string | null
  university_label: string | null
  category: WishlistCategory
  proposed_by: WishlistProposedBy
  sort_order: number
  note: string | null
  created_at: string
}

interface WishlistMessageRow {
  id: string
  wishlist_id: string
  author_id: string
  author_role: WishlistAuthorRole
  body: string
  created_at: string
}

const WISHLIST_COLUMNS =
  'id, student_id, snapshot_id, status, created_by, confirmed_at, created_at, updated_at'
const ITEM_COLUMNS =
  'id, wishlist_id, program_key, university_id, university_label, category, proposed_by, sort_order, note, created_at'
const MESSAGE_COLUMNS = 'id, wishlist_id, author_id, author_role, body, created_at'

function toWishlist(row: WishlistRow): Wishlist {
  return {
    id: row.id,
    studentId: row.student_id,
    snapshotId: row.snapshot_id,
    status: row.status,
    createdBy: row.created_by,
    confirmedAt: row.confirmed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function enrichItem(row: WishlistItemRow): WishlistItem {
  const program = row.program_key ? getProgramPreset(row.program_key) : null
  const universityId = program?.universityId ?? row.university_id ?? null
  const university = universityId ? getUniversityPreset(universityId) : null

  return {
    id: row.id,
    wishlistId: row.wishlist_id,
    programKey: row.program_key,
    universityId,
    category: row.category,
    proposedBy: row.proposed_by,
    sortOrder: row.sort_order,
    note: row.note,
    createdAt: row.created_at,
    universityName: university?.name ?? row.university_label ?? universityId ?? '대학 미상',
    shortName: university?.shortName ?? null,
    programName: program?.name ?? row.university_label ?? '모집단위 미상',
    admissionTrack: program?.admissionTrack ?? '',
    programYear: program?.year ?? null,
    region: university?.region ?? null,
  }
}

function sortItems(items: WishlistItem[]): WishlistItem[] {
  return [...items].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
    return `${a.universityName} ${a.programName}`.localeCompare(
      `${b.universityName} ${b.programName}`,
      'ko'
    )
  })
}

/**
 * 학생의 협의 세션 + 항목 + 메시지를 한 번에 조회. 없으면 null.
 */
export async function fetchWishlistDetailForStudent(
  studentId: string
): Promise<WishlistDetail | null> {
  const supabase = createAdminClient()
  const { data: wishlistRow, error } = await supabase
    .from('university_wishlists')
    .select(WISHLIST_COLUMNS)
    .eq('student_id', studentId)
    .maybeSingle()

  if (error) {
    console.error('[university-wishlist] fetchWishlistDetailForStudent error', error)
    return null
  }
  if (!wishlistRow) return null

  const wishlist = toWishlist(wishlistRow as WishlistRow)

  const [itemsResult, messagesResult] = await Promise.all([
    supabase
      .from('university_wishlist_items')
      .select(ITEM_COLUMNS)
      .eq('wishlist_id', wishlist.id),
    supabase
      .from('university_wishlist_messages')
      .select(MESSAGE_COLUMNS)
      .eq('wishlist_id', wishlist.id)
      .order('created_at', { ascending: true }),
  ])

  const items = sortItems(((itemsResult.data as WishlistItemRow[]) ?? []).map(enrichItem))

  const messageRows = (messagesResult.data as WishlistMessageRow[]) ?? []
  const authorIds = Array.from(new Set(messageRows.map((m) => m.author_id)))
  const nameMap = new Map<string, string>()
  if (authorIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, name, email')
      .in('id', authorIds)
    for (const p of profiles ?? []) {
      nameMap.set(p.id, p.name ?? p.email ?? '사용자')
    }
  }

  const messages: WishlistMessage[] = messageRows.map((m) => ({
    id: m.id,
    wishlistId: m.wishlist_id,
    authorId: m.author_id,
    authorRole: m.author_role,
    authorName: nameMap.get(m.author_id) ?? '사용자',
    body: m.body,
    createdAt: m.created_at,
  }))

  return {
    wishlist,
    items,
    messages,
    generalCount: items.filter((i) => i.category === 'general').length,
    specializedCount: items.filter((i) => i.category === 'specialized').length,
    kartsCount: items.filter((i) => i.category === 'karts').length,
  }
}

// ── 학생 공유 화면용 "원장 추천 대학 + 코멘트" 뷰모델 ─────────────────────────

export interface RecommendationItemView {
  id: string
  category: WishlistCategory
  universityName: string
  programName: string
  admissionTrack: string
  region: string | null
}

export interface ReportRecommendation {
  status: WishlistStatus
  comment: string | null
  items: RecommendationItemView[]
}

/**
 * 협의(wishlist) 상세를 학생·학부모 공유 화면의 "원장 추천 대학 및 코멘트" 뷰모델로 변환한다.
 * 아직 전송되지 않았거나(draft) 추천 항목이 없으면 null을 반환해 안내 플레이스홀더를 보여준다.
 */
export function buildReportRecommendation(
  detail: WishlistDetail | null
): ReportRecommendation | null {
  if (!detail) return null
  const status = detail.wishlist.status
  if (status === 'draft' || detail.items.length === 0) return null

  const staffMessages = detail.messages.filter(
    (m) => m.authorRole === 'principal' || m.authorRole === 'teacher'
  )
  const comment = staffMessages.length > 0 ? staffMessages[staffMessages.length - 1].body : null

  return {
    status,
    comment,
    items: detail.items.map((item) => ({
      id: item.id,
      category: item.category,
      universityName: item.universityName,
      programName: item.programName,
      admissionTrack: item.admissionTrack,
      region: item.region,
    })),
  }
}

// ── 모집단위 카탈로그 (추천/희망 선택용 슬림 데이터) ──────────────────────────

export interface WishlistCatalogEntry {
  programKey: string
  universityId: string
  universityName: string
  shortName: string | null
  region: string | null
  programName: string
  admissionTrack: string
  year: number
  category: WishlistCategory
}

/**
 * 추천/희망 선택 UI에 넘길 모집단위 카탈로그. 상세(details)는 제외해 직렬화 비용을 줄인다.
 */
export function listWishlistCatalog(): WishlistCatalogEntry[] {
  return PROGRAM_PRESETS.map((program) => {
    const university = getUniversityPreset(program.universityId)
    return {
      programKey: program.key,
      universityId: program.universityId,
      universityName: university?.name ?? program.universityId,
      shortName: university?.shortName ?? null,
      region: university?.region ?? null,
      programName: program.name,
      admissionTrack: program.admissionTrack,
      year: program.year,
      category: resolveWishlistCategory(program.universityId),
    }
  }).sort((a, b) => {
    if (a.category !== b.category) return a.category === 'general' ? -1 : 1
    return `${a.universityName} ${a.programName}`.localeCompare(
      `${b.universityName} ${b.programName}`,
      'ko'
    )
  })
}

// ── 확정 희망대학 집계 (원장 리스트 / 반편성·합격추적) ────────────────────────

export interface ConfirmedWishlistSummary {
  studentId: string
  studentName: string
  email: string
  className: string | null
  confirmedAt: string | null
  generalItems: WishlistItem[]
  specializedItems: WishlistItem[]
  kartsItems: WishlistItem[]
}

/**
 * 확정(confirmed)된 모든 학생의 희망대학 목록을 학생별로 집계해 반환한다.
 */
export async function fetchConfirmedWishlistSummaries(): Promise<ConfirmedWishlistSummary[]> {
  const supabase = createAdminClient()

  const { data: wishlistRows, error } = await supabase
    .from('university_wishlists')
    .select('id, student_id, confirmed_at')
    .eq('status', 'confirmed')

  if (error || !wishlistRows || wishlistRows.length === 0) {
    if (error) {
      console.error('[university-wishlist] fetchConfirmedWishlistSummaries error', error)
    }
    return []
  }

  const wishlistIds = wishlistRows.map((w) => w.id)
  const studentIds = Array.from(new Set(wishlistRows.map((w) => w.student_id)))

  const [itemsResult, studentsResult] = await Promise.all([
    supabase.from('university_wishlist_items').select(ITEM_COLUMNS).in('wishlist_id', wishlistIds),
    supabase.from('profiles').select('id, name, email, class_id').in('id', studentIds),
  ])

  const classIds = Array.from(
    new Set(
      (studentsResult.data ?? [])
        .map((s) => s.class_id)
        .filter((id): id is string => Boolean(id))
    )
  )
  const classNameMap = new Map<string, string>()
  if (classIds.length > 0) {
    const { data: classes } = await supabase.from('classes').select('id, name').in('id', classIds)
    for (const c of classes ?? []) classNameMap.set(c.id, c.name)
  }

  const studentMap = new Map(
    (studentsResult.data ?? []).map((s) => [
      s.id,
      {
        name: s.name as string | null,
        email: s.email as string,
        className: s.class_id ? classNameMap.get(s.class_id) ?? null : null,
      },
    ])
  )

  const itemsByWishlist = new Map<string, WishlistItem[]>()
  for (const row of (itemsResult.data as WishlistItemRow[]) ?? []) {
    const list = itemsByWishlist.get(row.wishlist_id) ?? []
    list.push(enrichItem(row))
    itemsByWishlist.set(row.wishlist_id, list)
  }

  return wishlistRows
    .map<ConfirmedWishlistSummary>((w) => {
      const items = sortItems(itemsByWishlist.get(w.id) ?? [])
      const student = studentMap.get(w.student_id)
      return {
        studentId: w.student_id,
        studentName: student?.name ?? student?.email ?? '학생',
        email: student?.email ?? '',
        className: student?.className ?? null,
        confirmedAt: w.confirmed_at,
        generalItems: items.filter((i) => i.category === 'general'),
        specializedItems: items.filter((i) => i.category === 'specialized'),
        kartsItems: items.filter((i) => i.category === 'karts'),
      }
    })
    .sort((a, b) => a.studentName.localeCompare(b.studentName, 'ko'))
}

export { isYedaeUniversity }
export type { WishlistCategory }
