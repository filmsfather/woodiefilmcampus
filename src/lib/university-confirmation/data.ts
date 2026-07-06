/**
 * 대학 "최종 확정"(university_final_confirmations) 데이터 조회·생성 헬퍼.
 *
 * 모든 읽기/쓰기는 admin(service role) 클라이언트로 수행하며, 접근 제어는 호출하는
 * 서버 액션/페이지에서 역할(원장/학생 본인/토큰 검증)로 강제한다.
 *
 * 대학·모집단위 메타데이터는 프리셋(`university-policy/presets`)에서 조인한다.
 */

import { randomUUID } from 'crypto'

import { createAdminClient } from '@/lib/supabase/admin'
import { getProgramPreset, getUniversityPreset } from '@/lib/university-policy/presets'
import { resolveWishlistCategory } from '@/lib/university-policy/yedae'

export type FinalConfirmationStatus = 'pending' | 'confirmed'
/** 확정 폼에 담기는 대학 카테고리(한예종은 별도 토글로 관리). */
export type FinalConfirmationCategory = 'general' | 'specialized'

export interface FinalConfirmationItem {
  id: string
  confirmationId: string
  programKey: string | null
  universityId: string | null
  category: FinalConfirmationCategory
  sortOrder: number
  note: string | null
  universityName: string
  shortName: string | null
  programName: string
  admissionTrack: string
  region: string | null
}

export interface FinalConfirmation {
  id: string
  studentId: string
  shareToken: string
  status: FinalConfirmationStatus
  kartsApply: boolean
  weekdayPreferences: string[]
  confirmedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface FinalConfirmationDetail {
  confirmation: FinalConfirmation
  studentName: string
  items: FinalConfirmationItem[]
  generalItems: FinalConfirmationItem[]
  specializedItems: FinalConfirmationItem[]
}

interface ConfirmationRow {
  id: string
  student_id: string
  share_token: string
  status: FinalConfirmationStatus
  karts_apply: boolean
  weekday_preferences: string[] | null
  confirmed_at: string | null
  created_at: string
  updated_at: string
}

interface ConfirmationItemRow {
  id: string
  confirmation_id: string
  program_key: string | null
  university_id: string | null
  university_label: string | null
  category: FinalConfirmationCategory
  sort_order: number
  note: string | null
}

const CONFIRMATION_COLUMNS =
  'id, student_id, share_token, status, karts_apply, weekday_preferences, confirmed_at, created_at, updated_at'
const ITEM_COLUMNS =
  'id, confirmation_id, program_key, university_id, university_label, category, sort_order, note'

function toConfirmation(row: ConfirmationRow): FinalConfirmation {
  return {
    id: row.id,
    studentId: row.student_id,
    shareToken: row.share_token,
    status: row.status,
    kartsApply: row.karts_apply,
    weekdayPreferences: row.weekday_preferences ?? [],
    confirmedAt: row.confirmed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function enrichItem(row: ConfirmationItemRow): FinalConfirmationItem {
  const program = row.program_key ? getProgramPreset(row.program_key) : null
  const universityId = program?.universityId ?? row.university_id ?? null
  const university = universityId ? getUniversityPreset(universityId) : null

  return {
    id: row.id,
    confirmationId: row.confirmation_id,
    programKey: row.program_key,
    universityId,
    category: row.category,
    sortOrder: row.sort_order,
    note: row.note,
    universityName: university?.name ?? row.university_label ?? universityId ?? '대학 미상',
    shortName: university?.shortName ?? null,
    programName: program?.name ?? row.university_label ?? '모집단위 미상',
    admissionTrack: program?.admissionTrack ?? '',
    region: university?.region ?? null,
  }
}

function sortItems(items: FinalConfirmationItem[]): FinalConfirmationItem[] {
  return [...items].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
    return `${a.universityName} ${a.programName}`.localeCompare(
      `${b.universityName} ${b.programName}`,
      'ko'
    )
  })
}

function generateShareToken(): string {
  return `${randomUUID()}${randomUUID()}`.replace(/-/g, '')
}

/**
 * 학생의 최종 확정 세션을 가져오고, 없으면 원장 권한으로 생성한다.
 * 새로 생성할 때는 컨설팅(wishlist) 항목을 초기값으로 복사해 폼을 프리필한다.
 * (한예종 항목은 카테고리 토글로 관리하므로 karts_apply로 반영한다.)
 */
export async function ensureFinalConfirmation(
  studentId: string,
  createdBy: string
): Promise<FinalConfirmation | null> {
  const supabase = createAdminClient()

  const { data: existing, error: existingError } = await supabase
    .from('university_final_confirmations')
    .select(CONFIRMATION_COLUMNS)
    .eq('student_id', studentId)
    .maybeSingle()

  if (existingError) {
    console.error('[final-confirmation] ensure fetch error', existingError)
    return null
  }
  if (existing) return toConfirmation(existing as ConfirmationRow)

  const { data: created, error: createError } = await supabase
    .from('university_final_confirmations')
    .insert({
      student_id: studentId,
      share_token: generateShareToken(),
      status: 'pending',
      created_by: createdBy,
    })
    .select(CONFIRMATION_COLUMNS)
    .single()

  if (createError || !created) {
    console.error('[final-confirmation] ensure insert error', createError)
    return null
  }

  const confirmation = toConfirmation(created as ConfirmationRow)

  // 컨설팅 협의(wishlist) 항목을 초기값으로 복사한다.
  const { data: wishlist } = await supabase
    .from('university_wishlists')
    .select('id')
    .eq('student_id', studentId)
    .maybeSingle()

  if (wishlist) {
    const { data: wishlistItems } = await supabase
      .from('university_wishlist_items')
      .select('program_key, university_id, university_label, category, sort_order, note')
      .eq('wishlist_id', wishlist.id)
      .order('sort_order', { ascending: true })

    const rows = (wishlistItems ?? [])
      // 한예종(karts) 항목은 확정 폼에서 별도 토글로 관리하므로 karts_apply로 반영.
      .filter((item) => item.category === 'general' || item.category === 'specialized')
      .map((item, index) => ({
        confirmation_id: confirmation.id,
        program_key: item.program_key,
        university_id: item.university_id,
        university_label: item.university_label,
        category: item.category,
        sort_order: item.sort_order ?? index,
        note: item.note,
      }))

    const kartsApply = (wishlistItems ?? []).some((item) => item.category === 'karts')

    if (rows.length > 0) {
      const { error: copyError } = await supabase
        .from('university_final_confirmation_items')
        .insert(rows)
      if (copyError) {
        console.error('[final-confirmation] copy wishlist items error', copyError)
      }
    }

    if (kartsApply) {
      await supabase
        .from('university_final_confirmations')
        .update({ karts_apply: true })
        .eq('id', confirmation.id)
      confirmation.kartsApply = true
    }
  }

  return confirmation
}

async function fetchStudentName(studentId: string): Promise<string> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('profiles')
    .select('name, email')
    .eq('id', studentId)
    .maybeSingle()
  return data?.name ?? data?.email ?? '학생'
}

async function fetchItems(confirmationId: string): Promise<FinalConfirmationItem[]> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('university_final_confirmation_items')
    .select(ITEM_COLUMNS)
    .eq('confirmation_id', confirmationId)
  return sortItems(((data as ConfirmationItemRow[]) ?? []).map(enrichItem))
}

/** 확정 폼 렌더용 상세를 토큰으로 조회. 없으면 null. */
export async function fetchFinalConfirmationByToken(
  token: string
): Promise<FinalConfirmationDetail | null> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('university_final_confirmations')
    .select(CONFIRMATION_COLUMNS)
    .eq('share_token', token)
    .maybeSingle()

  if (error) {
    console.error('[final-confirmation] fetchByToken error', error)
    return null
  }
  if (!data) return null

  const confirmation = toConfirmation(data as ConfirmationRow)
  const [studentName, items] = await Promise.all([
    fetchStudentName(confirmation.studentId),
    fetchItems(confirmation.id),
  ])

  return {
    confirmation,
    studentName,
    items,
    generalItems: items.filter((i) => i.category === 'general'),
    specializedItems: items.filter((i) => i.category === 'specialized'),
  }
}

/** 원장 화면(재확정/상태 표시)용으로 학생 ID로 상세를 조회. */
export async function fetchFinalConfirmationForStudent(
  studentId: string
): Promise<FinalConfirmationDetail | null> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('university_final_confirmations')
    .select(CONFIRMATION_COLUMNS)
    .eq('student_id', studentId)
    .maybeSingle()

  if (error) {
    console.error('[final-confirmation] fetchForStudent error', error)
    return null
  }
  if (!data) return null

  const confirmation = toConfirmation(data as ConfirmationRow)
  const [studentName, items] = await Promise.all([
    fetchStudentName(confirmation.studentId),
    fetchItems(confirmation.id),
  ])

  return {
    confirmation,
    studentName,
    items,
    generalItems: items.filter((i) => i.category === 'general'),
    specializedItems: items.filter((i) => i.category === 'specialized'),
  }
}

// ── 확정 리스트 집계 (원장 반편성/합격추적) ──────────────────────────────────

export interface ConfirmedFinalSummary {
  studentId: string
  studentName: string
  email: string
  className: string | null
  confirmedAt: string | null
  kartsApply: boolean
  weekdayPreferences: string[]
  generalItems: FinalConfirmationItem[]
  specializedItems: FinalConfirmationItem[]
}

/**
 * 최종 확정(confirmed)된 모든 학생의 지원 대학·요일 선호를 학생별로 집계해 반환한다.
 * wishlists 페이지의 단일 출처이며, 컨설팅 단계의 이전 기록(university_wishlists)은 사용하지 않는다.
 */
export async function fetchConfirmedFinalSummaries(): Promise<ConfirmedFinalSummary[]> {
  const supabase = createAdminClient()

  const { data: confirmations, error } = await supabase
    .from('university_final_confirmations')
    .select('id, student_id, karts_apply, weekday_preferences, confirmed_at')
    .eq('status', 'confirmed')

  if (error || !confirmations || confirmations.length === 0) {
    if (error) {
      console.error('[final-confirmation] fetchConfirmedFinalSummaries error', error)
    }
    return []
  }

  const confirmationIds = confirmations.map((c) => c.id)
  const studentIds = Array.from(new Set(confirmations.map((c) => c.student_id)))

  const [itemsResult, studentsResult] = await Promise.all([
    supabase
      .from('university_final_confirmation_items')
      .select(ITEM_COLUMNS)
      .in('confirmation_id', confirmationIds),
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

  const itemsByConfirmation = new Map<string, FinalConfirmationItem[]>()
  for (const row of (itemsResult.data as ConfirmationItemRow[]) ?? []) {
    const list = itemsByConfirmation.get(row.confirmation_id) ?? []
    list.push(enrichItem(row))
    itemsByConfirmation.set(row.confirmation_id, list)
  }

  return confirmations
    .map<ConfirmedFinalSummary>((c) => {
      const items = sortItems(itemsByConfirmation.get(c.id) ?? [])
      const student = studentMap.get(c.student_id)
      return {
        studentId: c.student_id,
        studentName: student?.name ?? student?.email ?? '학생',
        email: student?.email ?? '',
        className: student?.className ?? null,
        confirmedAt: c.confirmed_at,
        kartsApply: Boolean(c.karts_apply),
        weekdayPreferences: (c.weekday_preferences as string[] | null) ?? [],
        generalItems: items.filter((i) => i.category === 'general'),
        specializedItems: items.filter((i) => i.category === 'specialized'),
      }
    })
    .sort((a, b) => a.studentName.localeCompare(b.studentName, 'ko'))
}

/** 최종 확정을 완료한 학생 ID 집합(워크플로우 상태 집계용). */
export async function fetchFinalConfirmedStudentIds(
  studentIds: string[]
): Promise<Set<string>> {
  if (studentIds.length === 0) return new Set()

  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('university_final_confirmations')
    .select('student_id')
    .eq('status', 'confirmed')
    .in('student_id', studentIds)

  if (error) {
    console.error('[final-confirmation] fetchFinalConfirmedStudentIds error', error)
    return new Set()
  }

  return new Set((data ?? []).map((row) => row.student_id as string))
}
