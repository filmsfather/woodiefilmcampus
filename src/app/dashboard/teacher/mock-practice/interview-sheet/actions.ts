'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { getAuthContext } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  applyTemplateItemsToSheet,
  attachAssetToInterviewSheetItem,
  getOrCreateInterviewSheet,
  nextItemOrderIndex,
} from '@/lib/interview-sheets'
import {
  addInterviewSheetItemAssetSchema,
  addInterviewSheetQuestionSchema,
  applyInterviewSheetTemplateSchema,
  createInterviewSheetTemplateSchema,
  deleteInterviewSheetItemAssetSchema,
  deleteInterviewSheetItemSchema,
  updateInterviewSheetItemSchema,
  updateInterviewSheetTemplateSchema,
  type AddInterviewSheetItemAssetInput,
  type AddInterviewSheetQuestionInput,
  type ApplyInterviewSheetTemplateInput,
  type CreateInterviewSheetTemplateInput,
  type DeleteInterviewSheetItemAssetInput,
  type DeleteInterviewSheetItemInput,
  type UpdateInterviewSheetItemInput,
  type UpdateInterviewSheetTemplateInput,
} from '@/lib/validation/interview-sheet'
import type { UserProfile } from '@/lib/supabase'

type ActionResult = {
  success?: boolean
  error?: string
  id?: string
}

const SHEET_BASE_PATH = '/dashboard/teacher/mock-practice/interview-sheet'
const STUDENT_SHEET_PATH = '/dashboard/student/interview-sheet'

const STAFF_ROLES = new Set<UserProfile['role']>(['teacher', 'manager', 'principal'])

async function ensureStaffProfile() {
  const { profile } = await getAuthContext()
  if (!profile || !STAFF_ROLES.has(profile.role)) {
    return null
  }
  return profile
}

function revalidateSheets(studentId?: string) {
  revalidatePath(SHEET_BASE_PATH)
  revalidatePath(STUDENT_SHEET_PATH)
  if (studentId) {
    revalidatePath(`${SHEET_BASE_PATH}/${studentId}`)
  }
}

function revalidateTemplates() {
  revalidatePath(`${SHEET_BASE_PATH}/templates`)
  revalidatePath(SHEET_BASE_PATH)
}

async function insertTemplateItems(templateId: string, items: CreateInterviewSheetTemplateInput['items']) {
  const admin = createAdminClient()

  const { error } = await admin.from('interview_sheet_template_items').insert(
    items.map((item, index) => ({
      template_id: templateId,
      order_index: index,
      prompt: item.prompt,
    }))
  )

  if (error) {
    console.error('[interview-sheets] failed to insert template items', error)
    throw new Error('템플릿 질문 저장에 실패했습니다.')
  }
}

async function unsetDefaultTemplate(exceptTemplateId?: string) {
  const admin = createAdminClient()

  let query = admin.from('interview_sheet_templates').update({ is_default: false }).eq('is_default', true)
  if (exceptTemplateId) {
    query = query.neq('id', exceptTemplateId)
  }

  const { error } = await query
  if (error) {
    console.error('[interview-sheets] failed to unset default template', error)
    throw new Error('기본 템플릿 설정 변경에 실패했습니다.')
  }
}

// 템플릿 ---------------------------------------------------------------------------

export async function createInterviewSheetTemplateAction(
  input: CreateInterviewSheetTemplateInput
): Promise<ActionResult> {
  const profile = await ensureStaffProfile()
  if (!profile) {
    return { error: '면접지 템플릿을 만들 권한이 없습니다.' }
  }

  const parsed = createInterviewSheetTemplateSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다.' }
  }

  const admin = createAdminClient()

  try {
    if (parsed.data.isDefault) {
      await unsetDefaultTemplate()
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : '기본 템플릿 설정에 실패했습니다.' }
  }

  const { data: templateRow, error: templateError } = await admin
    .from('interview_sheet_templates')
    .insert({
      title: parsed.data.title,
      description: parsed.data.description || null,
      is_default: parsed.data.isDefault,
      created_by: profile.id,
    })
    .select('id')
    .single()

  if (templateError || !templateRow?.id) {
    console.error('[interview-sheets] failed to insert template', templateError)
    return { error: '템플릿 저장에 실패했습니다.' }
  }

  const templateId = templateRow.id as string

  try {
    await insertTemplateItems(templateId, parsed.data.items)
  } catch (err) {
    await admin.from('interview_sheet_templates').delete().eq('id', templateId)
    return { error: err instanceof Error ? err.message : '템플릿 질문 저장에 실패했습니다.' }
  }

  revalidateTemplates()
  return { success: true, id: templateId }
}

export async function updateInterviewSheetTemplateAction(
  input: UpdateInterviewSheetTemplateInput
): Promise<ActionResult> {
  const profile = await ensureStaffProfile()
  if (!profile) {
    return { error: '면접지 템플릿을 수정할 권한이 없습니다.' }
  }

  const parsed = updateInterviewSheetTemplateSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다.' }
  }

  const admin = createAdminClient()
  const templateId = parsed.data.templateId

  const { data: templateRow } = await admin
    .from('interview_sheet_templates')
    .select('id')
    .eq('id', templateId)
    .maybeSingle()

  if (!templateRow) {
    return { error: '템플릿을 찾을 수 없습니다.' }
  }

  try {
    if (parsed.data.isDefault) {
      await unsetDefaultTemplate(templateId)
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : '기본 템플릿 설정에 실패했습니다.' }
  }

  const { error: updateError } = await admin
    .from('interview_sheet_templates')
    .update({
      title: parsed.data.title,
      description: parsed.data.description || null,
      is_default: parsed.data.isDefault,
    })
    .eq('id', templateId)

  if (updateError) {
    console.error('[interview-sheets] failed to update template', updateError)
    return { error: '템플릿 수정에 실패했습니다.' }
  }

  // 기존 문항을 지우고 새로 저장한다.
  // 이미 학생 면접지에 복사된 항목은 template_item_id만 null이 되고 내용은 유지된다.
  const { error: deleteError } = await admin
    .from('interview_sheet_template_items')
    .delete()
    .eq('template_id', templateId)

  if (deleteError) {
    console.error('[interview-sheets] failed to reset template items', deleteError)
    return { error: '기존 템플릿 질문 정리에 실패했습니다.' }
  }

  try {
    await insertTemplateItems(templateId, parsed.data.items)
  } catch (err) {
    return { error: err instanceof Error ? err.message : '템플릿 질문 저장에 실패했습니다.' }
  }

  revalidateTemplates()
  return { success: true, id: templateId }
}

export async function deleteInterviewSheetTemplateAction(templateId: string): Promise<ActionResult> {
  const profile = await ensureStaffProfile()
  if (!profile) {
    return { error: '면접지 템플릿을 삭제할 권한이 없습니다.' }
  }

  const idParse = z.string().uuid().safeParse(templateId)
  if (!idParse.success) {
    return { error: '잘못된 요청입니다.' }
  }

  const admin = createAdminClient()

  const { error } = await admin.from('interview_sheet_templates').delete().eq('id', templateId)
  if (error) {
    console.error('[interview-sheets] failed to delete template', error)
    return { error: '템플릿 삭제에 실패했습니다.' }
  }

  revalidateTemplates()
  return { success: true }
}

export async function setDefaultInterviewSheetTemplateAction(templateId: string): Promise<ActionResult> {
  const profile = await ensureStaffProfile()
  if (!profile) {
    return { error: '기본 템플릿을 설정할 권한이 없습니다.' }
  }

  const idParse = z.string().uuid().safeParse(templateId)
  if (!idParse.success) {
    return { error: '잘못된 요청입니다.' }
  }

  const admin = createAdminClient()

  try {
    await unsetDefaultTemplate(templateId)
  } catch (err) {
    return { error: err instanceof Error ? err.message : '기본 템플릿 설정에 실패했습니다.' }
  }

  const { error } = await admin
    .from('interview_sheet_templates')
    .update({ is_default: true })
    .eq('id', templateId)

  if (error) {
    console.error('[interview-sheets] failed to set default template', error)
    return { error: '기본 템플릿 설정에 실패했습니다.' }
  }

  revalidateTemplates()
  return { success: true }
}

// 학생 면접지 관리 --------------------------------------------------------------------

export async function applyInterviewSheetTemplateAction(
  input: ApplyInterviewSheetTemplateInput
): Promise<ActionResult> {
  const profile = await ensureStaffProfile()
  if (!profile) {
    return { error: '템플릿을 적용할 권한이 없습니다.' }
  }

  const parsed = applyInterviewSheetTemplateSchema.safeParse(input)
  if (!parsed.success) {
    return { error: '잘못된 요청입니다.' }
  }

  const sheetId = await getOrCreateInterviewSheet(parsed.data.studentId)
  if (!sheetId) {
    return { error: '학생 면접지를 준비하지 못했습니다.' }
  }

  try {
    const addedCount = await applyTemplateItemsToSheet(sheetId, parsed.data.templateId)
    if (addedCount === 0) {
      return { error: '추가할 질문이 없습니다. 이미 적용된 템플릿이거나 질문이 비어 있습니다.' }
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : '템플릿 적용에 실패했습니다.' }
  }

  revalidateSheets(parsed.data.studentId)
  return { success: true }
}

export async function addInterviewSheetQuestionAction(
  input: AddInterviewSheetQuestionInput
): Promise<ActionResult> {
  const profile = await ensureStaffProfile()
  if (!profile) {
    return { error: '질문을 추가할 권한이 없습니다.' }
  }

  const parsed = addInterviewSheetQuestionSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다.' }
  }

  const sheetId = await getOrCreateInterviewSheet(parsed.data.studentId)
  if (!sheetId) {
    return { error: '학생 면접지를 준비하지 못했습니다.' }
  }

  const admin = createAdminClient()
  const orderIndex = await nextItemOrderIndex(sheetId)

  const { data: itemRow, error } = await admin
    .from('interview_sheet_items')
    .insert({
      sheet_id: sheetId,
      order_index: orderIndex,
      prompt: parsed.data.prompt,
      source: 'teacher',
      created_by: profile.id,
    })
    .select('id')
    .single()

  if (error || !itemRow?.id) {
    console.error('[interview-sheets] failed to add teacher question', error)
    return { error: '질문 추가에 실패했습니다.' }
  }

  revalidateSheets(parsed.data.studentId)
  return { success: true, id: itemRow.id as string }
}

async function fetchItemWithSheet(itemId: string) {
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('interview_sheet_items')
    .select('id, sheet_id, source, created_by, interview_sheets(id, student_id)')
    .eq('id', itemId)
    .maybeSingle()

  if (error || !data) {
    if (error) console.error('[interview-sheets] failed to fetch item', error)
    return null
  }

  const sheet = Array.isArray(data.interview_sheets) ? data.interview_sheets[0] : data.interview_sheets
  if (!sheet) {
    return null
  }

  return {
    id: data.id as string,
    sheetId: data.sheet_id as string,
    source: data.source as string,
    createdBy: (data.created_by as string | null) ?? null,
    studentId: sheet.student_id as string,
  }
}

export async function updateInterviewSheetItemAction(
  input: UpdateInterviewSheetItemInput
): Promise<ActionResult> {
  const profile = await ensureStaffProfile()
  if (!profile) {
    return { error: '항목을 수정할 권한이 없습니다.' }
  }

  const parsed = updateInterviewSheetItemSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다.' }
  }

  if (parsed.data.prompt === undefined && parsed.data.feedback === undefined) {
    return { error: '변경할 내용이 없습니다.' }
  }

  const item = await fetchItemWithSheet(parsed.data.itemId)
  if (!item) {
    return { error: '면접지 항목을 찾을 수 없습니다.' }
  }

  const admin = createAdminClient()
  const patch: Record<string, unknown> = {}

  if (parsed.data.prompt !== undefined) {
    patch.prompt = parsed.data.prompt
  }

  if (parsed.data.feedback !== undefined) {
    const feedback = parsed.data.feedback?.trim() || null
    patch.teacher_feedback = feedback
    patch.feedback_by = feedback ? profile.id : null
    patch.feedback_at = feedback ? new Date().toISOString() : null
  }

  const { error } = await admin.from('interview_sheet_items').update(patch).eq('id', item.id)

  if (error) {
    console.error('[interview-sheets] failed to update item', error)
    return { error: '항목 수정에 실패했습니다.' }
  }

  revalidateSheets(item.studentId)
  return { success: true }
}

export async function deleteInterviewSheetItemAction(
  input: DeleteInterviewSheetItemInput
): Promise<ActionResult> {
  const profile = await ensureStaffProfile()
  if (!profile) {
    return { error: '항목을 삭제할 권한이 없습니다.' }
  }

  const parsed = deleteInterviewSheetItemSchema.safeParse(input)
  if (!parsed.success) {
    return { error: '잘못된 요청입니다.' }
  }

  const item = await fetchItemWithSheet(parsed.data.itemId)
  if (!item) {
    return { error: '면접지 항목을 찾을 수 없습니다.' }
  }

  const admin = createAdminClient()
  const { error } = await admin.from('interview_sheet_items').delete().eq('id', item.id)

  if (error) {
    console.error('[interview-sheets] failed to delete item', error)
    return { error: '항목 삭제에 실패했습니다.' }
  }

  revalidateSheets(item.studentId)
  return { success: true }
}

export async function addInterviewSheetItemAssetAction(
  input: AddInterviewSheetItemAssetInput
): Promise<ActionResult> {
  const profile = await ensureStaffProfile()
  if (!profile) {
    return { error: '첨부를 추가할 권한이 없습니다.' }
  }

  const parsed = addInterviewSheetItemAssetSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? '입력값이 올바르지 않습니다.' }
  }

  const item = await fetchItemWithSheet(parsed.data.itemId)
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

  revalidateSheets(item.studentId)
  return { success: true }
}

export async function deleteInterviewSheetItemAssetAction(
  input: DeleteInterviewSheetItemAssetInput
): Promise<ActionResult> {
  const profile = await ensureStaffProfile()
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
    .select('id, item_id, interview_sheet_items(sheet_id, interview_sheets(student_id))')
    .eq('id', parsed.data.assetId)
    .maybeSingle()

  if (!assetRow) {
    return { error: '첨부를 찾을 수 없습니다.' }
  }

  const { error } = await admin.from('interview_sheet_item_assets').delete().eq('id', parsed.data.assetId)

  if (error) {
    console.error('[interview-sheets] failed to delete asset', error)
    return { error: '첨부 삭제에 실패했습니다.' }
  }

  const itemRel = Array.isArray(assetRow.interview_sheet_items)
    ? assetRow.interview_sheet_items[0]
    : assetRow.interview_sheet_items
  const sheetRel = itemRel
    ? Array.isArray(itemRel.interview_sheets)
      ? itemRel.interview_sheets[0]
      : itemRel.interview_sheets
    : null

  revalidateSheets((sheetRel?.student_id as string | undefined) ?? undefined)
  return { success: true }
}
