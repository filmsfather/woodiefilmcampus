import { createAdminClient } from '@/lib/supabase/admin'
import {
  coerceFilmEntry,
  sanitizeFilmEntry,
  type FilmNoteEntry,
} from '@/lib/film-notes'

export interface StickerPeriod {
  id: string
  label: string
  startDate: string
  endDate: string
  isActive: boolean
}

export interface StickerBoardStudent {
  studentId: string
  name: string
  stickerCount: number
}

export interface StickerBoardNote {
  id: string
  content: FilmNoteEntry
  source: 'assignment' | 'personal'
  createdAt: string
  likeCount: number
  likedByMe: boolean
}

export interface HallOfFameEntry {
  studentId: string
  name: string
  stickerCount: number
}

export async function fetchAllPeriods(): Promise<StickerPeriod[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('sticker_periods')
    .select('id, label, start_date, end_date, is_active')
    .order('start_date', { ascending: false })

  if (error) {
    console.error('[fetchAllPeriods]', error)
    throw new Error('기간 목록을 불러오지 못했습니다.')
  }

  return (data ?? []).map((r) => ({
    id: r.id as string,
    label: r.label as string,
    startDate: r.start_date as string,
    endDate: r.end_date as string,
    isActive: r.is_active as boolean,
  }))
}

export async function fetchActivePeriod(): Promise<StickerPeriod | null> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('sticker_periods')
    .select('id, label, start_date, end_date, is_active')
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[fetchActivePeriod]', error)
    return null
  }

  if (!data) return null

  return {
    id: data.id as string,
    label: data.label as string,
    startDate: data.start_date as string,
    endDate: data.end_date as string,
    isActive: true,
  }
}

export async function fetchPeriodById(periodId: string): Promise<StickerPeriod | null> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('sticker_periods')
    .select('id, label, start_date, end_date, is_active')
    .eq('id', periodId)
    .maybeSingle()

  if (error) {
    console.error('[fetchPeriodById]', error)
    return null
  }

  if (!data) return null

  return {
    id: data.id as string,
    label: data.label as string,
    startDate: data.start_date as string,
    endDate: data.end_date as string,
    isActive: data.is_active as boolean,
  }
}

export async function fetchStickerBoard(period: StickerPeriod): Promise<StickerBoardStudent[]> {
  const admin = createAdminClient()

  const fetchAllNotes = async () => {
    const all: { student_id: unknown }[] = []
    const pageSize = 1000
    let from = 0
    for (;;) {
      const { data, error } = await admin
        .from('film_notes')
        .select('student_id')
        .eq('completed', true)
        .gte('created_at', period.startDate)
        .lte('created_at', period.endDate)
        .range(from, from + pageSize - 1)
      if (error) return { data: null, error }
      all.push(...(data ?? []))
      if (!data || data.length < pageSize) break
      from += pageSize
    }
    return { data: all, error: null }
  }

  const [notesResult, profilesResult] = await Promise.all([
    fetchAllNotes(),
    admin
      .from('profiles')
      .select('id, name')
      .eq('role', 'student')
      .eq('status', 'approved'),
  ])

  if (notesResult.error) {
    console.error('[fetchStickerBoard] failed to load film_notes', notesResult.error)
    throw new Error('스티커 보드를 불러오지 못했습니다.')
  }

  if (profilesResult.error) {
    console.error('[fetchStickerBoard] failed to load profiles', profilesResult.error)
    throw new Error('스티커 보드를 불러오지 못했습니다.')
  }

  const countMap = new Map<string, number>()
  for (const row of notesResult.data ?? []) {
    const sid = row.student_id as string
    countMap.set(sid, (countMap.get(sid) ?? 0) + 1)
  }

  const result: StickerBoardStudent[] = (profilesResult.data ?? [])
    .map((p) => ({
      studentId: p.id as string,
      name: (p.name as string) ?? '이름 없음',
      stickerCount: countMap.get(p.id as string) ?? 0,
    }))
    .sort((a, b) => b.stickerCount - a.stickerCount || a.name.localeCompare(b.name, 'ko'))

  return result
}

export async function fetchHallOfFame(periodId: string, period: StickerPeriod): Promise<HallOfFameEntry[]> {
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('sticker_hall_of_fame')
    .select('student_id')
    .eq('period_id', periodId)

  if (error) {
    console.error('[fetchHallOfFame]', error)
    return []
  }

  if (!data || data.length === 0) return []

  const studentIds = data.map((r) => r.student_id as string)

  const [profilesResult, notesResult] = await Promise.all([
    admin.from('profiles').select('id, name').in('id', studentIds),
    admin
      .from('film_notes')
      .select('student_id')
      .eq('completed', true)
      .gte('created_at', period.startDate)
      .lte('created_at', period.endDate)
      .in('student_id', studentIds),
  ])

  if (profilesResult.error) {
    console.error('[fetchHallOfFame] profiles', profilesResult.error)
    return []
  }

  const countMap = new Map<string, number>()
  for (const row of notesResult.data ?? []) {
    const sid = row.student_id as string
    countMap.set(sid, (countMap.get(sid) ?? 0) + 1)
  }

  return (profilesResult.data ?? [])
    .map((p) => ({
      studentId: p.id as string,
      name: (p.name as string) ?? '이름 없음',
      stickerCount: countMap.get(p.id as string) ?? 0,
    }))
    .sort((a, b) => b.stickerCount - a.stickerCount || a.name.localeCompare(b.name, 'ko'))
}

export async function fetchStudentNotesForBoard(
  studentId: string,
  currentUserId: string | null,
  period: StickerPeriod
): Promise<StickerBoardNote[]> {
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('film_notes')
    .select('id, content, source, created_at')
    .eq('student_id', studentId)
    .eq('completed', true)
    .gte('created_at', period.startDate)
    .lte('created_at', period.endDate)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[fetchStudentNotesForBoard] failed to load film_notes', error)
    throw new Error('감상지 목록을 불러오지 못했습니다.')
  }

  const noteIds = (data ?? []).map((row) => row.id as string)

  if (noteIds.length === 0) {
    return []
  }

  const { data: likes, error: likesError } = await admin
    .from('film_note_likes')
    .select('film_note_id, user_id')
    .in('film_note_id', noteIds)

  if (likesError) {
    console.error('[fetchStudentNotesForBoard] failed to load likes', likesError)
  }

  const likeCountMap = new Map<string, number>()
  const myLikeSet = new Set<string>()
  for (const like of likes ?? []) {
    const nid = like.film_note_id as string
    likeCountMap.set(nid, (likeCountMap.get(nid) ?? 0) + 1)
    if (currentUserId && (like.user_id as string) === currentUserId) {
      myLikeSet.add(nid)
    }
  }

  return (data ?? []).map((row) => {
    const id = row.id as string
    return {
      id,
      content: sanitizeFilmEntry(coerceFilmEntry(row.content)),
      source: (row.source === 'assignment' ? 'assignment' : 'personal') as 'assignment' | 'personal',
      createdAt: row.created_at as string,
      likeCount: likeCountMap.get(id) ?? 0,
      likedByMe: myLikeSet.has(id),
    }
  })
}

export async function toggleFilmNoteLike(
  filmNoteId: string,
  userId: string
): Promise<{ liked: boolean; likeCount: number }> {
  const admin = createAdminClient()

  const { data: existing } = await admin
    .from('film_note_likes')
    .select('id')
    .eq('film_note_id', filmNoteId)
    .eq('user_id', userId)
    .maybeSingle()

  if (existing) {
    await admin
      .from('film_note_likes')
      .delete()
      .eq('film_note_id', filmNoteId)
      .eq('user_id', userId)
  } else {
    await admin
      .from('film_note_likes')
      .insert({ film_note_id: filmNoteId, user_id: userId })
  }

  const { count } = await admin
    .from('film_note_likes')
    .select('id', { count: 'exact', head: true })
    .eq('film_note_id', filmNoteId)

  return { liked: !existing, likeCount: count ?? 0 }
}

export async function createStickerPeriod(
  label: string,
  startDate: string,
  endDate: string,
  createdBy: string
): Promise<StickerPeriod> {
  const admin = createAdminClient()

  await admin
    .from('sticker_periods')
    .update({ is_active: false })
    .eq('is_active', true)

  const { data, error } = await admin
    .from('sticker_periods')
    .insert({
      label,
      start_date: startDate,
      end_date: endDate,
      is_active: true,
      created_by: createdBy,
    })
    .select('id, label, start_date, end_date, is_active')
    .single()

  if (error) {
    console.error('[createStickerPeriod]', error)
    throw new Error('기간 생성에 실패했습니다.')
  }

  return {
    id: data.id as string,
    label: data.label as string,
    startDate: data.start_date as string,
    endDate: data.end_date as string,
    isActive: data.is_active as boolean,
  }
}

export async function updateHallOfFameEntries(
  periodId: string,
  studentIds: string[]
): Promise<void> {
  const admin = createAdminClient()

  await admin
    .from('sticker_hall_of_fame')
    .delete()
    .eq('period_id', periodId)

  if (studentIds.length > 0) {
    const rows = studentIds.map((sid) => ({
      period_id: periodId,
      student_id: sid,
    }))

    const { error } = await admin
      .from('sticker_hall_of_fame')
      .insert(rows)

    if (error) {
      console.error('[updateHallOfFameEntries]', error)
      throw new Error('명예의 전당 저장에 실패했습니다.')
    }
  }
}
