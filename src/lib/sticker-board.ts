import { createAdminClient } from '@/lib/supabase/admin'
import {
  coerceFilmEntry,
  sanitizeFilmEntry,
  type FilmNoteEntry,
} from '@/lib/film-notes'

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

const STICKER_CUTOFF = '2026-03-09T00:00:00+09:00'

export async function fetchStickerBoard(): Promise<StickerBoardStudent[]> {
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
        .gte('created_at', STICKER_CUTOFF)
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

export async function fetchStudentNotesForBoard(
  studentId: string,
  currentUserId: string | null
): Promise<StickerBoardNote[]> {
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('film_notes')
    .select('id, content, source, created_at')
    .eq('student_id', studentId)
    .eq('completed', true)
    .gte('created_at', STICKER_CUTOFF)
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
