'use server'

import { z } from 'zod'

import { getAuthContext } from '@/lib/auth'
import {
  fetchStudentNotesForBoard,
  toggleFilmNoteLike,
  type StickerBoardNote,
} from '@/lib/sticker-board'

const fetchNotesSchema = z.object({
  studentId: z.string().uuid(),
})

type FetchNotesResult =
  | { success: true; notes: StickerBoardNote[] }
  | { success: false; error: string }

export async function fetchStudentNotes(
  input: z.infer<typeof fetchNotesSchema>
): Promise<FetchNotesResult> {
  const { session, profile } = await getAuthContext()

  if (!session || !profile) {
    return { success: false, error: '로그인이 필요합니다.' }
  }

  const parsed = fetchNotesSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: '잘못된 요청입니다.' }
  }

  try {
    const notes = await fetchStudentNotesForBoard(parsed.data.studentId, profile.id)
    return { success: true, notes }
  } catch {
    return { success: false, error: '감상지 목록을 불러오지 못했습니다.' }
  }
}

const toggleLikeSchema = z.object({
  filmNoteId: z.string().uuid(),
})

type ToggleLikeResult =
  | { success: true; liked: boolean; likeCount: number }
  | { success: false; error: string }

export async function toggleLike(
  input: z.infer<typeof toggleLikeSchema>
): Promise<ToggleLikeResult> {
  const { session, profile } = await getAuthContext()

  if (!session || !profile) {
    return { success: false, error: '로그인이 필요합니다.' }
  }

  const parsed = toggleLikeSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: '잘못된 요청입니다.' }
  }

  try {
    const result = await toggleFilmNoteLike(parsed.data.filmNoteId, profile.id)
    return { success: true, ...result }
  } catch {
    return { success: false, error: '좋아요 처리에 실패했습니다.' }
  }
}
