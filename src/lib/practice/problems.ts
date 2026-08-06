import { createAdminClient } from '@/lib/supabase/admin'
import { createSignedUrlMap, normalizeMedia, resolveUniversityName, type AssetRow } from '@/lib/practice/shared'
import { UNIVERSITY_PRESETS } from '@/lib/university-policy/presets/universities'
import type {
  PracticeProblemAsset,
  PracticeProblemDetail,
  PracticeProblemItem,
  PracticeProblemSummary,
  PracticeRubricItem,
  PracticeType,
  PracticeUniversityOption,
} from '@/types/practice'

type MediaRow = { id: string; bucket: string | null; path: string | null }

type ProblemRow = {
  id: string
  university_id: string
  practice_type: PracticeType
  title: string
  description: string | null
  time_limit_minutes: number
  order_index: number
  is_active: boolean
  created_at: string
  profiles: { name: string | null; email: string | null } | { name: string | null; email: string | null }[] | null
  practice_problem_items: { id: string }[] | null
  practice_rubric_items: { id: string }[] | null
}

function firstOf<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null
  }
  return value ?? null
}

async function fetchUsageCounts(problemIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  if (problemIds.length === 0) {
    return counts
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('practice_bookings')
    .select('problem_id')
    .in('problem_id', problemIds)
    .neq('status', 'canceled')

  if (error) {
    console.error('[practice] failed to count problem usage', error)
    return counts
  }

  for (const row of (data ?? []) as Array<{ problem_id: string }>) {
    counts.set(row.problem_id, (counts.get(row.problem_id) ?? 0) + 1)
  }

  return counts
}

export async function fetchPracticeProblemSummaries(filters?: {
  universityId?: string | null
  practiceType?: PracticeType | null
  includeInactive?: boolean
}): Promise<PracticeProblemSummary[]> {
  const admin = createAdminClient()

  let query = admin
    .from('practice_problems')
    .select(
      `id, university_id, practice_type, title, description, time_limit_minutes, order_index,
       is_active, created_at,
       profiles:profiles!practice_problems_created_by_fkey(name, email),
       practice_problem_items(id),
       practice_rubric_items(id)`
    )
    .order('order_index', { ascending: true })
    .order('created_at', { ascending: true })

  if (filters?.universityId) {
    query = query.eq('university_id', filters.universityId)
  }
  if (filters?.practiceType) {
    query = query.eq('practice_type', filters.practiceType)
  }
  if (!filters?.includeInactive) {
    query = query.eq('is_active', true)
  }

  const { data, error } = await query

  if (error) {
    console.error('[practice] failed to fetch problems', error)
    return []
  }

  const rows = (data ?? []) as unknown as ProblemRow[]
  const usage = await fetchUsageCounts(rows.map((row) => row.id))

  return rows.map((row) => {
    const creator = firstOf(row.profiles)
    return {
      id: row.id,
      universityId: row.university_id,
      universityName: resolveUniversityName(row.university_id),
      practiceType: row.practice_type,
      title: row.title,
      description: row.description,
      timeLimitMinutes: row.time_limit_minutes,
      orderIndex: row.order_index,
      isActive: row.is_active,
      createdAt: row.created_at,
      createdByName: creator?.name ?? creator?.email ?? null,
      itemCount: row.practice_problem_items?.length ?? 0,
      rubricCount: row.practice_rubric_items?.length ?? 0,
      usageCount: usage.get(row.id) ?? 0,
    }
  })
}

export async function fetchPracticeProblemDetail(problemId: string): Promise<PracticeProblemDetail | null> {
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('practice_problems')
    .select(
      `id, university_id, practice_type, title, description, time_limit_minutes, order_index, is_active`
    )
    .eq('id', problemId)
    .maybeSingle()

  if (error || !data) {
    if (error) {
      console.error('[practice] failed to fetch problem detail', error)
    }
    return null
  }

  const row = data as unknown as {
    id: string
    university_id: string
    practice_type: PracticeType
    title: string
    description: string | null
    time_limit_minutes: number
    order_index: number
    is_active: boolean
  }

  const [items, assets, rubricItems, usage] = await Promise.all([
    fetchProblemItems([problemId]),
    fetchProblemAssets([problemId]),
    fetchProblemRubricItems([problemId]),
    fetchUsageCounts([problemId]),
  ])

  return {
    id: row.id,
    universityId: row.university_id,
    universityName: resolveUniversityName(row.university_id),
    practiceType: row.practice_type,
    title: row.title,
    description: row.description,
    timeLimitMinutes: row.time_limit_minutes,
    orderIndex: row.order_index,
    isActive: row.is_active,
    items: items.get(problemId) ?? [],
    assets: assets.get(problemId) ?? [],
    rubricItems: rubricItems.get(problemId) ?? [],
    usageCount: usage.get(problemId) ?? 0,
  }
}

export async function fetchProblemItems(problemIds: string[]): Promise<Map<string, PracticeProblemItem[]>> {
  const result = new Map<string, PracticeProblemItem[]>()
  if (problemIds.length === 0) {
    return result
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('practice_problem_items')
    .select('id, problem_id, order_index, prompt')
    .in('problem_id', problemIds)
    .order('order_index', { ascending: true })

  if (error) {
    console.error('[practice] failed to fetch problem items', error)
    return result
  }

  for (const row of (data ?? []) as Array<{
    id: string
    problem_id: string
    order_index: number
    prompt: string
  }>) {
    const list = result.get(row.problem_id) ?? []
    list.push({ id: row.id, orderIndex: row.order_index, prompt: row.prompt })
    result.set(row.problem_id, list)
  }

  return result
}

export async function fetchProblemAssets(problemIds: string[]): Promise<Map<string, PracticeProblemAsset[]>> {
  const result = new Map<string, PracticeProblemAsset[]>()
  if (problemIds.length === 0) {
    return result
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('practice_problem_assets')
    .select('id, problem_id, media_asset_id, order_index, media_assets(id, bucket, path)')
    .in('problem_id', problemIds)
    .order('order_index', { ascending: true })

  if (error) {
    console.error('[practice] failed to fetch problem assets', error)
    return result
  }

  const rows = (data ?? []) as unknown as Array<{
    id: string
    problem_id: string
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
    const list = result.get(row.problem_id) ?? []
    list.push({
      id: row.id,
      mediaAssetId: row.media_asset_id,
      orderIndex: row.order_index,
      url: urlMap.get(row.id) ?? null,
    })
    result.set(row.problem_id, list)
  }

  return result
}

export async function fetchProblemRubricItems(problemIds: string[]): Promise<Map<string, PracticeRubricItem[]>> {
  const result = new Map<string, PracticeRubricItem[]>()
  if (problemIds.length === 0) {
    return result
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('practice_rubric_items')
    .select('id, problem_id, order_index, label, max_score, description')
    .in('problem_id', problemIds)
    .order('order_index', { ascending: true })

  if (error) {
    console.error('[practice] failed to fetch rubric items', error)
    return result
  }

  for (const row of (data ?? []) as Array<{
    id: string
    problem_id: string
    order_index: number
    label: string
    max_score: number | string
    description: string | null
  }>) {
    const list = result.get(row.problem_id) ?? []
    list.push({
      id: row.id,
      orderIndex: row.order_index,
      label: row.label,
      maxScore: Number(row.max_score),
      description: row.description,
    })
    result.set(row.problem_id, list)
  }

  return result
}

/** 대학 프리셋 목록 + 문제 은행의 유형별 활성 문제 수 */
export async function fetchPracticeUniversityOptions(): Promise<PracticeUniversityOption[]> {
  const admin = createAdminClient()

  const { data: problemRows, error: problemError } = await admin
    .from('practice_problems')
    .select('university_id, practice_type')
    .eq('is_active', true)

  if (problemError) {
    console.error('[practice] failed to fetch problem counts', problemError)
  }

  const counts = new Map<string, { writing: number; interview: number }>()
  for (const row of (problemRows ?? []) as Array<{ university_id: string; practice_type: PracticeType }>) {
    const entry = counts.get(row.university_id) ?? { writing: 0, interview: 0 }
    entry[row.practice_type] += 1
    counts.set(row.university_id, entry)
  }

  return UNIVERSITY_PRESETS.map((preset) => {
    const entry = counts.get(preset.id) ?? { writing: 0, interview: 0 }
    return {
      id: preset.id,
      name: preset.name,
      writingProblemCount: entry.writing,
      interviewProblemCount: entry.interview,
    }
  })
}

/**
 * 학생이 해당 대학/유형에서 아직 응시하지 않은 문제 수.
 * 0이면 예약이 차단된다(문제 소진).
 */
export async function countAvailableProblemsForStudent(
  studentId: string,
  universityId: string,
  practiceType: PracticeType
): Promise<number> {
  const admin = createAdminClient()

  const { data: problemRows, error: problemError } = await admin
    .from('practice_problems')
    .select('id')
    .eq('university_id', universityId)
    .eq('practice_type', practiceType)
    .eq('is_active', true)

  if (problemError) {
    console.error('[practice] failed to fetch candidate problems', problemError)
    return 0
  }

  const candidateIds = new Set(((problemRows ?? []) as Array<{ id: string }>).map((row) => row.id))
  if (candidateIds.size === 0) {
    return 0
  }

  const { data: usedRows, error: usedError } = await admin
    .from('practice_bookings')
    .select('problem_id')
    .eq('student_id', studentId)
    .neq('status', 'canceled')

  if (usedError) {
    console.error('[practice] failed to fetch used problems', usedError)
    return candidateIds.size
  }

  for (const row of (usedRows ?? []) as Array<{ problem_id: string }>) {
    candidateIds.delete(row.problem_id)
  }

  return candidateIds.size
}
