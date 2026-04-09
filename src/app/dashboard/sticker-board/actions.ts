'use server'

import { z } from 'zod'

import { getAuthContext } from '@/lib/auth'
import {
  fetchStudentNotesForBoard,
  toggleFilmNoteLike,
  createStickerPeriod,
  updateHallOfFameEntries,
  fetchPeriodById,
  type StickerBoardNote,
  type StickerPeriod,
} from '@/lib/sticker-board'
import { revalidatePath } from 'next/cache'

const STAFF_ROLES = new Set(['principal', 'manager', 'teacher'])

const fetchNotesSchema = z.object({
  studentId: z.string().uuid(),
  periodId: z.string().uuid(),
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
    const period = await fetchPeriodById(parsed.data.periodId)
    if (!period) {
      return { success: false, error: '기간 정보를 찾을 수 없습니다.' }
    }
    const notes = await fetchStudentNotesForBoard(parsed.data.studentId, profile.id, period)
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

const createPeriodSchema = z.object({
  label: z.string().min(1).max(50),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
})

type CreatePeriodResult =
  | { success: true; period: StickerPeriod }
  | { success: false; error: string }

export async function createPeriodAction(
  input: z.infer<typeof createPeriodSchema>
): Promise<CreatePeriodResult> {
  const { session, profile } = await getAuthContext()

  if (!session || !profile || !STAFF_ROLES.has(profile.role)) {
    return { success: false, error: '권한이 없습니다.' }
  }

  const parsed = createPeriodSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: '입력값이 올바르지 않습니다.' }
  }

  try {
    const period = await createStickerPeriod(
      parsed.data.label,
      parsed.data.startDate,
      parsed.data.endDate,
      profile.id
    )
    revalidatePath('/dashboard/sticker-board')
    return { success: true, period }
  } catch {
    return { success: false, error: '기간 생성에 실패했습니다.' }
  }
}

const updateHallOfFameSchema = z.object({
  periodId: z.string().uuid(),
  studentIds: z.array(z.string().uuid()),
})

type UpdateHallOfFameResult =
  | { success: true }
  | { success: false; error: string }

export async function updateHallOfFameAction(
  input: z.infer<typeof updateHallOfFameSchema>
): Promise<UpdateHallOfFameResult> {
  const { session, profile } = await getAuthContext()

  if (!session || !profile || !STAFF_ROLES.has(profile.role)) {
    return { success: false, error: '권한이 없습니다.' }
  }

  const parsed = updateHallOfFameSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: '입력값이 올바르지 않습니다.' }
  }

  try {
    await updateHallOfFameEntries(parsed.data.periodId, parsed.data.studentIds)
    revalidatePath('/dashboard/sticker-board')
    return { success: true }
  } catch {
    return { success: false, error: '명예의 전당 저장에 실패했습니다.' }
  }
}
