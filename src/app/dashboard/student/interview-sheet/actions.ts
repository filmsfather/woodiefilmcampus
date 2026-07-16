'use server'

import { revalidatePath } from 'next/cache'

import { getAuthContext } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  attachAssetToInterviewSheetItem,
  getOrCreateInterviewSheet,
  nextItemOrderIndex,
} from '@/lib/interview-sheets'
import {
  addInterviewSheetItemAssetSchema,
  addStudentQuestionSchema,
  deleteInterviewSheetItemAssetSchema,
  deleteInterviewSheetItemSchema,
  updateStudentItemSchema,
  type AddInterviewSheetItemAssetInput,
  type AddStudentQuestionInput,
  type DeleteInterviewSheetItemAssetInput,
  type DeleteInterviewSheetItemInput,
  type UpdateStudentItemInput,
} from '@/lib/validation/interview-sheet'

type ActionResult = {
  success?: boolean
  error?: string
  id?: string
}

const STUDENT_SHEET_PATH = '/dashboard/student/interview-sheet'
const TEACHER_BASE_PATH = '/dashboard/teacher/mock-practice/interview-sheet'

async function ensureStudentProfile() {
  const { profile } = await getAuthContext()
  if (!profile || profile.role !== 'student') {
    return null
  }
  return profile
}

function revalidateSheetPaths(studentId: string) {
  revalidatePath(STUDENT_SHEET_PATH)
  revalidatePath(TEACHER_BASE_PATH)
  revalidatePath(`${TEACHER_BASE_PATH}/${studentId}`)
}

/** 본인 면접지에 속한 항목인지 확인하고 항목 정보를 돌려준다. */
async function fetchOwnItem(itemId: string, studentId: string) {
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('interview_sheet_items')
    .select('id, sheet_id, source, created_by, answer, interview_sheets(student_id)')
    .eq('id', itemId)
    .maybeSingle()

  if (error || !data) {
    if (error) console.error('[interview-sheets] failed to fetch item for student', error)
    return null
  }

  const sheet = Array.isArray(data.interview_sheets) ? data.interview_sheets[0] : data.interview_sheets
  if (!sheet || (sheet.student_id as string) !== studentId) {
    return null
  }

  return {
    id: data.id as string,
    sheetId: data.sheet_id as string,
    source: data.source as string,
    createdBy: (data.created_by as string | null) ?? null,
  }
}

export async function addMyInterviewQuestionAction(input: AddStudentQuestionInput): Promise<ActionResult> {
  const profile = await ensureStudentProfile()
  if (!profile) {
    return { error: '질문을 추가할 권한이 없습니다.' }
  }

  const parsed = addStudentQuestionSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다.' }
  }

  const sheetId = await getOrCreateInterviewSheet(profile.id)
  if (!sheetId) {
    return { error: '면접지를 준비하지 못했습니다.' }
  }

  const admin = createAdminClient()
  const orderIndex = await nextItemOrderIndex(sheetId)

  const { data: itemRow, error } = await admin
    .from('interview_sheet_items')
    .insert({
      sheet_id: sheetId,
      order_index: orderIndex,
      prompt: parsed.data.prompt,
      source: 'student',
      created_by: profile.id,
    })
    .select('id')
    .single()

  if (error || !itemRow?.id) {
    console.error('[interview-sheets] failed to add student question', error)
    return { error: '질문 추가에 실패했습니다.' }
  }

  revalidateSheetPaths(profile.id)
  return { success: true, id: itemRow.id as string }
}

export async function updateMyInterviewItemAction(input: UpdateStudentItemInput): Promise<ActionResult> {
  const profile = await ensureStudentProfile()
  if (!profile) {
    return { error: '항목을 수정할 권한이 없습니다.' }
  }

  const parsed = updateStudentItemSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다.' }
  }

  if (parsed.data.prompt === undefined && parsed.data.answer === undefined) {
    return { error: '변경할 내용이 없습니다.' }
  }

  const item = await fetchOwnItem(parsed.data.itemId, profile.id)
  if (!item) {
    return { error: '면접지 항목을 찾을 수 없습니다.' }
  }

  const patch: Record<string, unknown> = {}

  if (parsed.data.prompt !== undefined) {
    // 질문 내용은 본인이 만든 질문만 수정할 수 있다
    if (item.source !== 'student' || item.createdBy !== profile.id) {
      return { error: '선생님이 추가한 질문은 수정할 수 없습니다. 답변만 작성해주세요.' }
    }
    patch.prompt = parsed.data.prompt
  }

  if (parsed.data.answer !== undefined) {
    const answer = parsed.data.answer?.trim() || null
    patch.answer = answer
    patch.answered_at = answer ? new Date().toISOString() : null
  }

  const admin = createAdminClient()
  const { error } = await admin.from('interview_sheet_items').update(patch).eq('id', item.id)

  if (error) {
    console.error('[interview-sheets] failed to update student item', error)
    return { error: '저장에 실패했습니다.' }
  }

  revalidateSheetPaths(profile.id)
  return { success: true }
}

export async function deleteMyInterviewItemAction(input: DeleteInterviewSheetItemInput): Promise<ActionResult> {
  const profile = await ensureStudentProfile()
  if (!profile) {
    return { error: '항목을 삭제할 권한이 없습니다.' }
  }

  const parsed = deleteInterviewSheetItemSchema.safeParse(input)
  if (!parsed.success) {
    return { error: '잘못된 요청입니다.' }
  }

  const item = await fetchOwnItem(parsed.data.itemId, profile.id)
  if (!item) {
    return { error: '면접지 항목을 찾을 수 없습니다.' }
  }

  if (item.source !== 'student' || item.createdBy !== profile.id) {
    return { error: '본인이 만든 질문만 삭제할 수 있습니다.' }
  }

  const admin = createAdminClient()
  const { error } = await admin.from('interview_sheet_items').delete().eq('id', item.id)

  if (error) {
    console.error('[interview-sheets] failed to delete student item', error)
    return { error: '항목 삭제에 실패했습니다.' }
  }

  revalidateSheetPaths(profile.id)
  return { success: true }
}

export async function addMyInterviewItemAssetAction(
  input: AddInterviewSheetItemAssetInput
): Promise<ActionResult> {
  const profile = await ensureStudentProfile()
  if (!profile) {
    return { error: '첨부를 추가할 권한이 없습니다.' }
  }

  const parsed = addInterviewSheetItemAssetSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다.' }
  }

  const item = await fetchOwnItem(parsed.data.itemId, profile.id)
  if (!item) {
    return { error: '면접지 항목을 찾을 수 없습니다.' }
  }

  try {
    await attachAssetToInterviewSheetItem({
      itemId: item.id,
      sheetId: item.sheetId,
      ownerId: profile.id,
      asset: parsed.data.asset,
    })
  } catch (err) {
    return { error: err instanceof Error ? err.message : '첨부 추가에 실패했습니다.' }
  }

  revalidateSheetPaths(profile.id)
  return { success: true }
}

export async function deleteMyInterviewItemAssetAction(
  input: DeleteInterviewSheetItemAssetInput
): Promise<ActionResult> {
  const profile = await ensureStudentProfile()
  if (!profile) {
    return { error: '첨부를 삭제할 권한이 없습니다.' }
  }

  const parsed = deleteInterviewSheetItemAssetSchema.safeParse(input)
  if (!parsed.success) {
    return { error: '잘못된 요청입니다.' }
  }

  const admin = createAdminClient()

  const { data: assetRow } = await admin
    .from('interview_sheet_item_assets')
    .select('id, created_by, interview_sheet_items(interview_sheets(student_id))')
    .eq('id', parsed.data.assetId)
    .maybeSingle()

  if (!assetRow) {
    return { error: '첨부를 찾을 수 없습니다.' }
  }

  const itemRel = Array.isArray(assetRow.interview_sheet_items)
    ? assetRow.interview_sheet_items[0]
    : assetRow.interview_sheet_items
  const sheetRel = itemRel
    ? Array.isArray(itemRel.interview_sheets)
      ? itemRel.interview_sheets[0]
      : itemRel.interview_sheets
    : null

  if (!sheetRel || (sheetRel.student_id as string) !== profile.id) {
    return { error: '첨부를 찾을 수 없습니다.' }
  }

  if ((assetRow.created_by as string | null) !== profile.id) {
    return { error: '본인이 추가한 첨부만 삭제할 수 있습니다.' }
  }

  const { error } = await admin.from('interview_sheet_item_assets').delete().eq('id', parsed.data.assetId)

  if (error) {
    console.error('[interview-sheets] failed to delete student asset', error)
    return { error: '첨부 삭제에 실패했습니다.' }
  }

  revalidateSheetPaths(profile.id)
  return { success: true }
}
