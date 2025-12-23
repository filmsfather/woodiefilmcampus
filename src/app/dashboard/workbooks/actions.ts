'use server'

import { randomUUID } from 'crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { getAuthContext } from '@/lib/auth'
import { WORKBOOK_SUBJECTS, WORKBOOK_TYPES } from '@/lib/validation/workbook'
import { createClient as createServerSupabase } from '@/lib/supabase/server'

const srsAnswerTypeSchema = z.enum(['multiple_choice', 'short_answer'])

const workbookChoiceSchema = z.object({
  content: z.string().min(1),
  isCorrect: z.boolean(),
})

const workbookShortFieldSchema = z.object({
  label: z.string().optional(),
  answer: z.string().min(1),
})

const workbookItemSchema = z.object({
  prompt: z.string().min(1),
  explanation: z.string().optional(),
  gradingCriteria: z
    .object({
      high: z.string(),
      mid: z.string(),
      low: z.string(),
    })
    .optional(),
  answerType: srsAnswerTypeSchema.optional(),
  choices: z.array(workbookChoiceSchema).optional(),
  shortFields: z.array(workbookShortFieldSchema).optional(),
})

const filmFiltersSchema = z.object({
  country: z.string().optional(),
  director: z.string().optional(),
  genre: z.string().optional(),
  subgenre: z.string().optional(),
})

const workbookConfigSchema = z.object({
  srs: z.object({ allowMultipleCorrect: z.boolean() }).optional(),
  pdf: z.object({ instructions: z.string().optional() }).optional(),
  writing: z
    .object({
      instructions: z.string().optional(),
      maxCharacters: z.number().optional(),
    })
    .optional(),
  film: z
    .object({
      noteCount: z.number().int().min(1).max(5),
      filters: filmFiltersSchema.optional(),
    })
    .optional(),
  lecture: z
    .object({
      youtubeUrl: z.string().optional(),
      instructions: z.string().optional(),
    })
    .optional(),
})

const MAX_ASSET_FILE_SIZE = 20 * 1024 * 1024 // 20MB, 버킷 제한과 동일하게 유지

const workbookAssetSchema = z.object({
  bucket: z.string().min(1),
  path: z.string().min(1),
  mimeType: z.string().optional().nullable(),
  size: z.number().int().nonnegative(),
  name: z.string().min(1),
  itemPosition: z.number().int().min(1),
  order: z.number().int().min(0),
})

const createWorkbookInputSchema = z.object({
  title: z.string().min(1),
  subject: z.enum(WORKBOOK_SUBJECTS),
  type: z.enum(WORKBOOK_TYPES),
  authorId: z.string().uuid().optional().nullable(),
  weekLabel: z.string().optional(),
  tags: z.array(z.string()),
  description: z.string().optional(),
  config: workbookConfigSchema,
  items: z.array(workbookItemSchema).min(1),
  assets: z.array(workbookAssetSchema).optional().default([]),
})

export type CreateWorkbookInput = z.infer<typeof createWorkbookInputSchema>

const updateWorkbookInputSchema = z.object({
  workbookId: z.string().uuid('유효한 문제집 ID가 아닙니다.'),
  title: z.string().min(1),
  subject: z.enum(WORKBOOK_SUBJECTS),
  authorId: z.string().uuid().optional().nullable(),
  weekLabel: z.string().optional(),
  tags: z.array(z.string()),
  description: z.string().optional(),
  config: workbookConfigSchema,
})

export type UpdateWorkbookInput = z.infer<typeof updateWorkbookInputSchema>

const srsChoiceUpdateSchema = z.object({
  content: z.string().min(1),
  isCorrect: z.boolean(),
})

const shortFieldUpdateSchema = z.object({
  label: z.string().optional(),
  answer: z.string().min(1),
})

const workbookItemUpdateSchema = z.object({
  id: z.string().uuid('유효한 문항 ID가 아닙니다.').optional(),
  prompt: z.string().min(1),
  explanation: z.string().optional(),
  gradingCriteria: z
    .object({
      high: z.string(),
      mid: z.string(),
      low: z.string(),
    })
    .optional(),
  answerType: srsAnswerTypeSchema.optional(),
  choices: z.array(srsChoiceUpdateSchema).optional(),
  shortFields: z.array(shortFieldUpdateSchema).optional(),
})

const updateWorkbookItemsInputSchema = z.object({
  workbookId: z.string().uuid('유효한 문제집 ID가 아닙니다.'),
  items: z.array(workbookItemUpdateSchema).min(1),
})

export type UpdateWorkbookItemsInput = z.infer<typeof updateWorkbookItemsInputSchema>

export async function createWorkbook(input: CreateWorkbookInput) {
  const parseResult = createWorkbookInputSchema.safeParse(input)

  if (!parseResult.success) {
    const firstIssue = parseResult.error.issues[0]
    return {
      error: firstIssue?.message ?? '입력 값을 확인해주세요.',
    }
  }

  const payload = parseResult.data
  const assets = payload.assets ?? []

  console.log('[createWorkbook] Payload items:', JSON.stringify(payload.items, null, 2))

  const supabase = await createServerSupabase()
  const { profile } = await getAuthContext()

  const allowedRoles = new Set(['teacher', 'principal', 'manager'])

  if (!profile || !allowedRoles.has(profile.role)) {
    await removeStoragePaths(supabase, assets.map((asset) => ({ bucket: asset.bucket, path: asset.path })))
    return {
      error: '문제집을 생성할 권한이 없습니다.',
    }
  }

  const isAllowedMimeType = (mimeType?: string | null) => {
    if (!mimeType) {
      return false
    }
    if (mimeType.startsWith('image/')) {
      return true
    }
    return mimeType === 'application/pdf'
  }

  const maxItemPosition = payload.items.length

  for (const asset of assets) {
    const sizeExceeded = asset.size > MAX_ASSET_FILE_SIZE
    const invalidMime = !isAllowedMimeType(asset.mimeType)
    const invalidPosition = asset.itemPosition < 1 || asset.itemPosition > maxItemPosition

    if (sizeExceeded || invalidMime || invalidPosition) {
      await removeStoragePaths(supabase, assets.map(({ bucket, path }) => ({ bucket, path })))

      if (invalidPosition) {
        return { error: '첨부 파일이 잘못된 문항에 연결됐습니다. 다시 시도해주세요.' }
      }

      if (sizeExceeded) {
        return { error: '첨부 파일 용량은 최대 20MB까지 지원합니다.' }
      }

      return { error: '지원하지 않는 파일 형식입니다. 이미지 또는 PDF 파일만 업로드해주세요.' }
    }
  }

  const addPath = (map: Map<string, Set<string>>, bucket: string, path: string) => {
    const set = map.get(bucket) ?? new Set<string>()
    set.add(path)
    map.set(bucket, set)
  }

  const deletePath = (map: Map<string, Set<string>>, bucket: string, path: string) => {
    const set = map.get(bucket)
    if (!set) {
      return
    }
    set.delete(path)
    if (set.size === 0) {
      map.delete(bucket)
    }
  }

  const tempRemovalMap = new Map<string, Set<string>>()
  const finalRemovalMap = new Map<string, Set<string>>()
  const insertedAssetIds: string[] = []

  assets.forEach((asset) => addPath(tempRemovalMap, asset.bucket, asset.path))

  const cleanupStorage = async () => {
    await removeStorageMap(supabase, tempRemovalMap)
    await removeStorageMap(supabase, finalRemovalMap)
  }

  let workbookId: string | null = null

  const failAndCleanup = async (message: string, removeWorkbook = false) => {
    if (insertedAssetIds.length > 0) {
      await supabase.from('media_assets').delete().in('id', insertedAssetIds)
    }

    if (removeWorkbook && workbookId) {
      await supabase.from('workbook_items').delete().eq('workbook_id', workbookId)
      await supabase.from('workbooks').delete().eq('id', workbookId)
    }

    await cleanupStorage()

    return { error: message }
  }

  try {
    const workbookConfig: Record<string, unknown> = {}

    if (payload.config.srs) {
      workbookConfig.srs = payload.config.srs
    }

    if (payload.config.pdf?.instructions) {
      workbookConfig.pdf = payload.config.pdf
    }

    if (payload.config.writing && (payload.config.writing.instructions || payload.config.writing.maxCharacters)) {
      workbookConfig.writing = payload.config.writing
    }

    if (payload.config.film) {
      workbookConfig.film = {
        noteCount: payload.config.film.noteCount,
        filters: payload.config.film.filters ?? {},
      }
    }

    if (payload.config.lecture && (payload.config.lecture.youtubeUrl || payload.config.lecture.instructions)) {
      workbookConfig.lecture = payload.config.lecture
    }

    const { data: workbook, error: workbookError } = await supabase
      .from('workbooks')
      .insert({
        teacher_id: profile.id,
        author_id: payload.authorId ?? null,
        title: payload.title,
        subject: payload.subject,
        week_label: payload.weekLabel ?? null,
        type: payload.type,
        tags: payload.tags,
        description: payload.description ?? null,
        config: workbookConfig,
      })
      .select('id')
      .maybeSingle()

    if (workbookError || !workbook) {
      console.error('[createWorkbook] failed to create workbook', workbookError)
      await cleanupStorage()
      return {
        error: '문제집 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
      }
    }

    workbookId = workbook.id

    const itemByPosition = new Map<number, typeof payload.items[number]>()

    const itemRows = payload.items.map((item, index) => {
      const position = index + 1
      itemByPosition.set(position, item)

      const answerType =
        payload.type === 'srs' ? item.answerType ?? 'multiple_choice' : payload.type

      return {
        workbook_id: workbook.id,
        position,
        prompt: item.prompt,
        answer_type: answerType,
        explanation: item.explanation ?? null,
        grading_criteria: item.gradingCriteria ?? null,
        srs_settings:
          payload.type === 'srs'
            ? {
              allowMultipleCorrect: payload.config.srs?.allowMultipleCorrect ?? false,
            }
            : null,
      }
    })

    const { data: insertedItems, error: itemsError } = await supabase
      .from('workbook_items')
      .insert(itemRows)
      .select('id, position')

    if (itemsError || !insertedItems) {
      console.error('[createWorkbook] failed to insert items', itemsError)
      return await failAndCleanup('문항 저장 중 오류가 발생했습니다.', true)
    }

    if (payload.type === 'srs') {
      const choiceRows: Array<{ item_id: string; label: string; content: string; is_correct: boolean }> = []
      const shortFieldRows: Array<{ item_id: string; label: string | null; answer: string; position: number }> = []

      insertedItems.forEach((inserted) => {
        const originalItem = itemByPosition.get(inserted.position)
        const answerType = originalItem?.answerType ?? 'multiple_choice'

        if (answerType === 'short_answer') {
          const fields = originalItem?.shortFields ?? []
          fields.forEach((field, fieldIndex) => {
            shortFieldRows.push({
              item_id: inserted.id,
              label: field.label && field.label.trim().length > 0 ? field.label.trim() : null,
              answer: field.answer.trim(),
              position: fieldIndex,
            })
          })
          return
        }

        const choices = originalItem?.choices ?? []
        choices.forEach((choice, choiceIndex) => {
          choiceRows.push({
            item_id: inserted.id,
            label: String.fromCharCode(65 + choiceIndex),
            content: choice.content,
            is_correct: choice.isCorrect,
          })
        })
      })

      if (choiceRows.length > 0) {
        const { error: choicesError } = await supabase.from('workbook_item_choices').insert(choiceRows)

        if (choicesError) {
          console.error('[createWorkbook] failed to insert choices', choicesError)
          return await failAndCleanup('객관식 보기 저장 중 오류가 발생했습니다.', true)
        }
      }

      if (shortFieldRows.length > 0) {
        const { error: shortFieldError } = await supabase.from('workbook_item_short_fields').insert(shortFieldRows)

        if (shortFieldError) {
          console.error('[createWorkbook] failed to insert short fields', shortFieldError)
          return await failAndCleanup('단답 필드 저장 중 오류가 발생했습니다.', true)
        }
      }
    }

    const itemIdByPosition = new Map<number, string>()
    insertedItems.forEach((item) => itemIdByPosition.set(item.position, item.id))

    const itemMediaRows: Array<{ item_id: string; asset_id: string; position: number }> = []

    for (const asset of assets) {
      const itemId = itemIdByPosition.get(asset.itemPosition)

      if (!itemId) {
        // Clean up orphaned upload and skip
        await supabase.storage.from(asset.bucket).remove([asset.path])
        deletePath(tempRemovalMap, asset.bucket, asset.path)
        continue
      }

      const sourceFileName = asset.path.split('/').pop() ?? `${randomUUID()}-asset`
      const targetPath = `workbooks/${workbook.id}/items/${itemId}/${randomUUID()}-${sourceFileName}`

      const { error: moveError } = await supabase.storage.from(asset.bucket).move(asset.path, targetPath)

      if (moveError) {
        console.error('[createWorkbook] storage move error', moveError)
        return await failAndCleanup('첨부 파일 이동 중 오류가 발생했습니다.', true)
      }

      deletePath(tempRemovalMap, asset.bucket, asset.path)
      addPath(finalRemovalMap, asset.bucket, targetPath)

      const mediaAssetId = randomUUID()

      const { error: mediaError } = await supabase.from('media_assets').insert({
        id: mediaAssetId,
        owner_id: profile.id,
        scope: 'workbook_item',
        bucket: asset.bucket,
        path: targetPath,
        mime_type: asset.mimeType ?? null,
        size: asset.size,
        metadata: { original_name: asset.name },
      })

      if (mediaError) {
        console.error('[createWorkbook] media asset insert error', mediaError)
        return await failAndCleanup('첨부 파일 저장 중 오류가 발생했습니다.', true)
      }

      insertedAssetIds.push(mediaAssetId)

      itemMediaRows.push({
        item_id: itemId,
        asset_id: mediaAssetId,
        position: asset.order,
      })
    }

    if (itemMediaRows.length > 0) {
      const { error: mediaLinkError } = await supabase
        .from('workbook_item_media')
        .insert(itemMediaRows)

      if (mediaLinkError) {
        console.error('[createWorkbook] workbook_item_media insert error', mediaLinkError)
        return await failAndCleanup('첨부 파일 연결 중 오류가 발생했습니다.', true)
      }
    }

    const targetsToRevalidate = ['/dashboard/teacher', '/dashboard/workbooks']
    targetsToRevalidate.forEach((path) => revalidatePath(path))

    return {
      success: true as const,
      workbookId: workbook.id as string,
    }
  } catch (error) {
    console.error('[createWorkbook] unexpected error', error)
    if (workbookId) {
      await supabase.from('workbook_items').delete().eq('workbook_id', workbookId)
      await supabase.from('workbooks').delete().eq('id', workbookId)
    }
    await cleanupStorage()
    return {
      error: '문제집 생성 중 예상치 못한 오류가 발생했습니다.',
    }
  }
}

export async function updateWorkbook(input: UpdateWorkbookInput) {
  const parseResult = updateWorkbookInputSchema.safeParse(input)

  if (!parseResult.success) {
    const firstIssue = parseResult.error.issues[0]
    return {
      error: firstIssue?.message ?? '입력 값을 확인해주세요.',
    }
  }

  const payload = parseResult.data

  const supabase = await createServerSupabase()
  const { profile } = await getAuthContext()

  const allowedRoles = new Set(['teacher', 'principal', 'manager'])

  if (!profile || !allowedRoles.has(profile.role)) {
    return {
      error: '문제집을 수정할 권한이 없습니다.',
    }
  }

  const { data: workbook, error: fetchError } = await supabase
    .from('workbooks')
    .select('id, teacher_id, type')
    .eq('id', payload.workbookId)
    .maybeSingle()

  if (fetchError) {
    console.error('[updateWorkbook] fetch error', fetchError)
    return {
      error: '문제집 정보를 불러오지 못했습니다.',
    }
  }

  if (!workbook) {
    return {
      error: '수정할 문제집을 찾을 수 없습니다.',
    }
  }

  const workbookConfig: Record<string, unknown> = {}

  switch (workbook.type) {
    case 'srs':
      if (payload.config.srs) {
        workbookConfig.srs = payload.config.srs
      }
      break
    case 'pdf':
      if (payload.config.pdf?.instructions) {
        workbookConfig.pdf = payload.config.pdf
      }
      break
    case 'writing':
      if (payload.config.writing && (payload.config.writing.instructions || payload.config.writing.maxCharacters)) {
        workbookConfig.writing = payload.config.writing
      }
      break
    case 'film':
      if (payload.config.film) {
        workbookConfig.film = {
          noteCount: payload.config.film.noteCount,
          filters: payload.config.film.filters ?? {},
        }
      }
      break
    case 'lecture':
      if (payload.config.lecture && (payload.config.lecture.youtubeUrl || payload.config.lecture.instructions)) {
        workbookConfig.lecture = payload.config.lecture
      }
      break
    default:
      break
  }

  const updateQuery = supabase
    .from('workbooks')
    .update({
      title: payload.title,
      subject: payload.subject,
      author_id: payload.authorId ?? null,
      week_label: payload.weekLabel ?? null,
      tags: payload.tags,
      description: payload.description ?? null,
      config: workbookConfig,
    })
    .eq('id', payload.workbookId)

  const { error: updateError } = await updateQuery

  if (updateError) {
    console.error('[updateWorkbook] update error', updateError)
    return {
      error: '문제집 수정 중 오류가 발생했습니다.',
    }
  }

  const targetsToRevalidate = [
    '/dashboard/workbooks',
    `/dashboard/workbooks/${payload.workbookId}`,
    '/dashboard/teacher',
  ]
  targetsToRevalidate.forEach((path) => revalidatePath(path))

  return {
    success: true as const,
  }
}

export async function updateWorkbookItems(input: UpdateWorkbookItemsInput) {
  const parseResult = updateWorkbookItemsInputSchema.safeParse(input)

  if (!parseResult.success) {
    const firstIssue = parseResult.error.issues[0]
    return {
      error: firstIssue?.message ?? '입력 값을 확인해주세요.',
    }
  }

  const payload = parseResult.data

  const supabase = await createServerSupabase()
  const { profile } = await getAuthContext()

  const allowedRoles = new Set(['teacher', 'principal', 'manager'])

  if (!profile || !allowedRoles.has(profile.role)) {
    return {
      error: '문항을 수정할 권한이 없습니다.',
    }
  }

  const { data: workbook, error: fetchWorkbookError } = await supabase
    .from('workbooks')
    .select('id, teacher_id, type, config')
    .eq('id', payload.workbookId)
    .maybeSingle()

  if (fetchWorkbookError) {
    console.error('[updateWorkbookItems] fetch workbook error', fetchWorkbookError)
    return {
      error: '문제집 정보를 불러오지 못했습니다.',
    }
  }

  if (!workbook) {
    return {
      error: '수정할 문제집을 찾을 수 없습니다.',
    }
  }

  const { data: existingItems, error: fetchItemsError } = await supabase
    .from('workbook_items')
    .select('id')
    .eq('workbook_id', payload.workbookId)

  if (fetchItemsError) {
    console.error('[updateWorkbookItems] fetch items error', fetchItemsError)
    return {
      error: '문항 정보를 불러오지 못했습니다.',
    }
  }

  const existingItemIds = new Set((existingItems ?? []).map((item) => item.id))

  const itemsToUpdate = payload.items.filter((item): item is typeof item & { id: string } => !!item.id)
  const itemsToCreate = payload.items.filter((item) => !item.id)

  for (const item of itemsToUpdate) {
    if (!existingItemIds.has(item.id)) {
      return {
        error: '존재하지 않는 문항이 포함되어 있습니다.',
      }
    }
  }

  const isSrsWorkbook = workbook.type === 'srs'
  const allowMultipleCorrect = Boolean(workbook.config?.srs?.allowMultipleCorrect)

  if (isSrsWorkbook) {
    for (const item of payload.items) {
      const answerType = item.answerType ?? 'multiple_choice'

      if (answerType === 'multiple_choice') {
        const choices = item.choices ?? []
        if (choices.length < 2) {
          return {
            error: 'SRS 문항은 최소 2개 이상의 보기가 필요합니다.',
          }
        }

        const correctCount = choices.filter((choice) => choice.isCorrect).length
        if (correctCount === 0) {
          return {
            error: 'SRS 문항의 정답을 최소 1개 이상 선택해주세요.',
          }
        }

        if (!allowMultipleCorrect && correctCount > 1) {
          return {
            error: '단일 정답 모드에서는 하나의 정답만 설정할 수 있습니다.',
          }
        }
      } else {
        const shortFields = item.shortFields ?? []

        if (shortFields.length === 0) {
          return {
            error: '단답 필드를 최소 1개 이상 추가해주세요.',
          }
        }

        for (const field of shortFields) {
          if (!field.answer || field.answer.trim().length === 0) {
            return {
              error: '단답 정답을 입력해주세요.',
            }
          }
        }
      }
    }
  }

  try {
    // 1. Update existing items
    for (const item of itemsToUpdate) {
      const answerType = item.answerType ?? 'multiple_choice'

      const updatePayload: Record<string, unknown> = {
        prompt: item.prompt,
        explanation: item.explanation ?? null,
        grading_criteria: item.gradingCriteria ?? null,
      }

      if (isSrsWorkbook) {
        updatePayload.answer_type = answerType
      }

      const { error: updateItemError } = await supabase
        .from('workbook_items')
        .update(updatePayload)
        .eq('id', item.id)
        .eq('workbook_id', payload.workbookId)

      if (updateItemError) {
        console.error('[updateWorkbookItems] update item error', updateItemError)
        return {
          error: '문항 수정 중 오류가 발생했습니다.',
        }
      }

      if (isSrsWorkbook) {
        if (answerType === 'multiple_choice') {
          const choices = item.choices ?? []

          const { error: deleteShortFieldsError } = await supabase
            .from('workbook_item_short_fields')
            .delete()
            .eq('item_id', item.id)

          if (deleteShortFieldsError) {
            console.error('[updateWorkbookItems] delete short fields error', deleteShortFieldsError)
            return {
              error: '기존 단답 필드 삭제 중 오류가 발생했습니다.',
            }
          }

          const { error: deleteChoicesError } = await supabase
            .from('workbook_item_choices')
            .delete()
            .eq('item_id', item.id)

          if (deleteChoicesError) {
            console.error('[updateWorkbookItems] delete choices error', deleteChoicesError)
            return {
              error: '기존 보기 삭제 중 오류가 발생했습니다.',
            }
          }

          const choiceRows = choices.map((choice, index) => ({
            item_id: item.id,
            label: String.fromCharCode(65 + index),
            content: choice.content,
            is_correct: choice.isCorrect,
          }))

          const { error: insertChoicesError } = await supabase
            .from('workbook_item_choices')
            .insert(choiceRows)

          if (insertChoicesError) {
            console.error('[updateWorkbookItems] insert choices error', insertChoicesError)
            return {
              error: '새 보기 저장 중 오류가 발생했습니다.',
            }
          }
        } else {
          const shortFields = item.shortFields ?? []

          const { error: deleteChoicesError } = await supabase
            .from('workbook_item_choices')
            .delete()
            .eq('item_id', item.id)

          if (deleteChoicesError) {
            console.error('[updateWorkbookItems] delete choices error', deleteChoicesError)
            return {
              error: '기존 보기 삭제 중 오류가 발생했습니다.',
            }
          }

          const { error: deleteShortFieldsError } = await supabase
            .from('workbook_item_short_fields')
            .delete()
            .eq('item_id', item.id)

          if (deleteShortFieldsError) {
            console.error('[updateWorkbookItems] delete short fields error', deleteShortFieldsError)
            return {
              error: '기존 단답 필드 삭제 중 오류가 발생했습니다.',
            }
          }

          const shortFieldRows = shortFields.map((field, index) => ({
            item_id: item.id,
            label: field.label && field.label.trim().length > 0 ? field.label.trim() : null,
            answer: field.answer.trim(),
            position: index,
          }))

          const { error: insertShortFieldsError } = await supabase
            .from('workbook_item_short_fields')
            .insert(shortFieldRows)

          if (insertShortFieldsError) {
            console.error('[updateWorkbookItems] insert short fields error', insertShortFieldsError)
            return {
              error: '단답 필드 저장 중 오류가 발생했습니다.',
            }
          }
        }
      }
    }

    // 2. Create new items
    if (itemsToCreate.length > 0) {
      // Get max position
      const { data: maxPosData } = await supabase
        .from('workbook_items')
        .select('position')
        .eq('workbook_id', payload.workbookId)
        .order('position', { ascending: false })
        .limit(1)
        .maybeSingle()

      let nextPosition = (maxPosData?.position ?? 0) + 1

      const newItemRows = itemsToCreate.map((item, index) => {
        const answerType =
          workbook.type === 'srs' ? item.answerType ?? 'multiple_choice' : workbook.type

        return {
          workbook_id: payload.workbookId,
          position: nextPosition + index,
          prompt: item.prompt,
          answer_type: answerType,
          explanation: item.explanation ?? null,
          grading_criteria: item.gradingCriteria ?? null,
          srs_settings:
            workbook.type === 'srs'
              ? {
                allowMultipleCorrect: workbook.config?.srs?.allowMultipleCorrect ?? false,
              }
              : null,
        }
      })

      const { data: insertedItems, error: insertItemsError } = await supabase
        .from('workbook_items')
        .insert(newItemRows)
        .select('id, position')

      if (insertItemsError || !insertedItems) {
        console.error('[updateWorkbookItems] insert new items error', insertItemsError)
        return {
          error: '새 문항 저장 중 오류가 발생했습니다.',
        }
      }

      if (isSrsWorkbook) {
        const choiceRows: Array<{ item_id: string; label: string; content: string; is_correct: boolean }> = []
        const shortFieldRows: Array<{ item_id: string; label: string | null; answer: string; position: number }> = []

        // Map inserted items back to payload items by index (since we inserted in order)
        insertedItems.forEach((inserted, index) => {
          const originalItem = itemsToCreate[index]
          const answerType = originalItem?.answerType ?? 'multiple_choice'

          if (answerType === 'short_answer') {
            const fields = originalItem?.shortFields ?? []
            fields.forEach((field, fieldIndex) => {
              shortFieldRows.push({
                item_id: inserted.id,
                label: field.label && field.label.trim().length > 0 ? field.label.trim() : null,
                answer: field.answer.trim(),
                position: fieldIndex,
              })
            })
            return
          }

          const choices = originalItem?.choices ?? []
          choices.forEach((choice, choiceIndex) => {
            choiceRows.push({
              item_id: inserted.id,
              label: String.fromCharCode(65 + choiceIndex),
              content: choice.content,
              is_correct: choice.isCorrect,
            })
          })
        })

        if (choiceRows.length > 0) {
          const { error: choicesError } = await supabase.from('workbook_item_choices').insert(choiceRows)

          if (choicesError) {
            console.error('[updateWorkbookItems] insert new choices error', choicesError)
            return {
              error: '새 객관식 보기 저장 중 오류가 발생했습니다.',
            }
          }
        }

        if (shortFieldRows.length > 0) {
          const { error: shortFieldError } = await supabase.from('workbook_item_short_fields').insert(shortFieldRows)

          if (shortFieldError) {
            console.error('[updateWorkbookItems] insert new short fields error', shortFieldError)
            return {
              error: '새 단답 필드 저장 중 오류가 발생했습니다.',
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('[updateWorkbookItems] unexpected error', error)
    return {
      error: '문항 수정 중 예상치 못한 오류가 발생했습니다.',
    }
  }

  const targetsToRevalidate = [
    '/dashboard/workbooks',
    `/dashboard/workbooks/${payload.workbookId}`,
    `/dashboard/workbooks/${payload.workbookId}/edit`,
  ]
  targetsToRevalidate.forEach((path) => revalidatePath(path))

  return {
    success: true as const,
  }
}

type StorageRemovalEntry = {
  bucket: string
  path: string
}

async function removeStoragePaths(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  entries: StorageRemovalEntry[]
) {
  if (!entries.length) {
    return
  }

  const grouped = new Map<string, string[]>()

  entries.forEach(({ bucket, path }) => {
    if (!bucket || !path) {
      return
    }

    const list = grouped.get(bucket) ?? []
    list.push(path)
    grouped.set(bucket, list)
  })

  for (const [bucket, paths] of grouped.entries()) {
    if (!paths.length) {
      continue
    }

    await supabase.storage.from(bucket).remove(paths)
  }
}

async function removeStorageMap(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  map: Map<string, Set<string>>
) {
  if (map.size === 0) {
    return
  }

  const entries: StorageRemovalEntry[] = []

  for (const [bucket, paths] of map.entries()) {
    paths.forEach((path) => entries.push({ bucket, path }))
  }

  await removeStoragePaths(supabase, entries)
  map.clear()
}

const workbookIdSchema = z.string().uuid('유효한 문제집 ID가 아닙니다.')

export async function deleteWorkbook(workbookId: string) {
  const parseResult = workbookIdSchema.safeParse(workbookId)

  if (!parseResult.success) {
    return { error: '유효한 문제집 ID가 아닙니다.' }
  }

  const { profile } = await getAuthContext()

  const deletionAllowedRoles = new Set(['teacher', 'principal', 'manager'])

  if (!profile || !deletionAllowedRoles.has(profile.role)) {
    return { error: '삭제 권한이 없습니다.' }
  }

  const supabase = await createServerSupabase()

  try {
    const { data: workbook, error: fetchError } = await supabase
      .from('workbooks')
      .select('id')
      .eq('id', workbookId)
      .maybeSingle()

    if (fetchError) {
      console.error('[deleteWorkbook] fetch error', fetchError)
      return { error: '문제집 정보를 가져오지 못했습니다.' }
    }

    if (!workbook) {
      return { error: '삭제할 문제집을 찾을 수 없습니다.' }
    }

    const { data: itemRows, error: fetchItemsError } = await supabase
      .from('workbook_items')
      .select('id')
      .eq('workbook_id', workbookId)

    if (fetchItemsError) {
      console.error('[deleteWorkbook] fetch items error', fetchItemsError)
      return { error: '문항 정보를 가져오지 못했습니다.' }
    }

    const itemIds = (itemRows ?? []).map((item) => item.id)

    let attachmentEntries: StorageRemovalEntry[] = []
    const attachmentIds: string[] = []

    if (itemIds.length > 0) {
      const { data: mediaRows, error: mediaFetchError } = await supabase
        .from('workbook_item_media')
        .select('media_assets(id, bucket, path)')
        .in('item_id', itemIds)

      if (mediaFetchError) {
        console.error('[deleteWorkbook] fetch media error', mediaFetchError)
        return { error: '첨부 자산 정보를 가져오지 못했습니다.' }
      }

      attachmentEntries = (mediaRows ?? [])
        .map((row) => {
          const asset = row.media_assets as
            | {
              id: string
              bucket: string | null
              path: string | null
            }
            | Array<{ id: string; bucket: string | null; path: string | null }>
            | null

          const record = Array.isArray(asset) ? asset[0] : asset
          if (!record || !record.path) {
            return null
          }

          attachmentIds.push(record.id)
          return {
            bucket: record.bucket ?? 'workbook-assets',
            path: record.path,
          }
        })
        .filter((entry): entry is StorageRemovalEntry => !!entry)
    }

    const { error: deleteItemsError } = await supabase
      .from('workbook_items')
      .delete()
      .eq('workbook_id', workbookId)

    if (deleteItemsError) {
      console.error('[deleteWorkbook] delete items error', deleteItemsError)
      return { error: '문항 삭제 중 오류가 발생했습니다.' }
    }

    if (attachmentIds.length > 0) {
      const { error: deleteAssetsError } = await supabase
        .from('media_assets')
        .delete()
        .in('id', attachmentIds)

      if (deleteAssetsError) {
        console.error('[deleteWorkbook] delete media_assets error', deleteAssetsError)
      }
    }

    const { error: deleteWorkbookError } = await supabase
      .from('workbooks')
      .delete()
      .eq('id', workbookId)

    if (deleteWorkbookError) {
      console.error('[deleteWorkbook] delete workbook error', deleteWorkbookError)
      return { error: '문제집 삭제 중 오류가 발생했습니다.' }
    }

    await removeStoragePaths(supabase, attachmentEntries)

    const targetsToRevalidate = ['/dashboard/workbooks', '/dashboard/teacher']
    targetsToRevalidate.forEach((path) => revalidatePath(path))

    return { success: true as const }
  } catch (error) {
    console.error('[deleteWorkbook] unexpected error', error)
    return { error: '문제집 삭제 중 예상치 못한 오류가 발생했습니다.' }
  }
}

export async function duplicateWorkbook(workbookId: string) {
  const parseResult = workbookIdSchema.safeParse(workbookId)

  if (!parseResult.success) {
    return { error: '유효한 문제집 ID가 아닙니다.' }
  }

  const { profile } = await getAuthContext()

  const duplicationAllowedRoles = new Set(['teacher', 'principal', 'manager'])

  if (!profile || !duplicationAllowedRoles.has(profile.role)) {
    return { error: '복제 권한이 없습니다.' }
  }

  const supabase = await createServerSupabase()

  try {
    const { data: workbook, error: fetchError } = await supabase
      .from('workbooks')
      .select(
        `id, teacher_id, title, subject, type, week_label, tags, description, config,
         workbook_items(id, position, prompt, explanation, srs_settings, answer_type,
          workbook_item_choices(content, is_correct),
          workbook_item_short_fields(label, answer, position),
          workbook_item_media(position, media_assets(id, bucket, path, mime_type, size, metadata))
         )`
      )
      .eq('id', workbookId)
      .maybeSingle()

    if (fetchError) {
      console.error('[duplicateWorkbook] fetch error', fetchError)
      return { error: '문제집 정보를 가져오지 못했습니다.' }
    }

    if (!workbook) {
      return { error: '복제할 문제집을 찾을 수 없습니다.' }
    }

    const newTitle = `${workbook.title} (복제)`

    const { data: newWorkbook, error: insertError } = await supabase
      .from('workbooks')
      .insert({
        teacher_id: profile.id,
        title: newTitle,
        subject: workbook.subject,
        week_label: workbook.week_label,
        type: workbook.type,
        tags: workbook.tags,
        description: workbook.description,
        config: workbook.config,
      })
      .select('id')
      .maybeSingle()

    if (insertError || !newWorkbook) {
      console.error('[duplicateWorkbook] insert error', insertError)
      return { error: '문제집 복제 중 오류가 발생했습니다.' }
    }

    const itemRows = (workbook.workbook_items ?? []).map((item) => ({
      workbook_id: newWorkbook.id,
      position: item.position,
      prompt: item.prompt,
      answer_type: item.answer_type,
      explanation: item.explanation,
      srs_settings: item.srs_settings,
    }))

    const { data: insertedItems, error: insertItemsError } = await supabase
      .from('workbook_items')
      .insert(itemRows)
      .select('id, position')

    if (insertItemsError || !insertedItems) {
      console.error('[duplicateWorkbook] insert items error', insertItemsError)
      await supabase.from('workbooks').delete().eq('id', newWorkbook.id)
      return { error: '문항 복제 중 오류가 발생했습니다.' }
    }

    const choiceRows: Array<{ item_id: string; label: string; content: string; is_correct: boolean }> = []
    const shortFieldRows: Array<{ item_id: string; label: string | null; answer: string; position: number }> = []

    insertedItems.forEach((inserted) => {
      const originalItem = workbook.workbook_items?.find((item) => item.position === inserted.position)
      const answerType = originalItem?.answer_type ?? 'multiple_choice'

      if (answerType === 'short_answer') {
        const fields = originalItem?.workbook_item_short_fields ?? []
        fields
          .sort((a, b) => (a?.position ?? 0) - (b?.position ?? 0))
          .forEach((field, idx) => {
            const answer = (field?.answer ?? '').trim()
            if (!answer) {
              return
            }

            shortFieldRows.push({
              item_id: inserted.id,
              label: field?.label && field.label.trim().length > 0 ? field.label.trim() : null,
              answer,
              position: idx,
            })
          })
        return
      }

      const choices = originalItem?.workbook_item_choices ?? []
      choices.forEach((choice, idx) => {
        choiceRows.push({
          item_id: inserted.id,
          label: String.fromCharCode(65 + idx),
          content: choice.content,
          is_correct: choice.is_correct,
        })
      })
    })

    if (choiceRows.length > 0) {
      const { error: choiceInsertError } = await supabase.from('workbook_item_choices').insert(choiceRows)

      if (choiceInsertError) {
        console.error('[duplicateWorkbook] insert choices error', choiceInsertError)
        await supabase.from('workbook_items').delete().eq('workbook_id', newWorkbook.id)
        await supabase.from('workbooks').delete().eq('id', newWorkbook.id)
        return { error: '객관식 보기 복제 중 오류가 발생했습니다.' }
      }
    }

    if (shortFieldRows.length > 0) {
      const { error: shortFieldInsertError } = await supabase.from('workbook_item_short_fields').insert(shortFieldRows)

      if (shortFieldInsertError) {
        console.error('[duplicateWorkbook] insert short fields error', shortFieldInsertError)
        await supabase.from('workbook_items').delete().eq('workbook_id', newWorkbook.id)
        await supabase.from('workbooks').delete().eq('id', newWorkbook.id)
        return { error: '단답 필드 복제 중 오류가 발생했습니다.' }
      }
    }

    const insertedItemMap = new Map<number, string>()
    insertedItems.forEach((item) => insertedItemMap.set(item.position, item.id))

    const copiedPaths: StorageRemovalEntry[] = []
    const newAssetIds: string[] = []

    const cleanupDuplicate = async (message: string) => {
      if (newAssetIds.length > 0) {
        await supabase.from('media_assets').delete().in('id', newAssetIds)
      }
      await supabase.from('workbook_items').delete().eq('workbook_id', newWorkbook.id)
      await supabase.from('workbooks').delete().eq('id', newWorkbook.id)
      await removeStoragePaths(supabase, copiedPaths)
      return { error: message }
    }

    for (const originalItem of workbook.workbook_items ?? []) {
      const targetItemId = insertedItemMap.get(originalItem.position)
      if (!targetItemId) {
        continue
      }

      for (const attachment of originalItem.workbook_item_media ?? []) {
        const rawAsset = attachment.media_assets as
          | {
            id: string
            bucket: string | null
            path: string | null
            mime_type: string | null
            size: number | null
            metadata: Record<string, unknown> | null
          }
          | Array<{
            id: string
            bucket: string | null
            path: string | null
            mime_type: string | null
            size: number | null
            metadata: Record<string, unknown> | null
          }>
          | null

        const asset = Array.isArray(rawAsset) ? rawAsset[0] : rawAsset

        if (!asset?.path) {
          continue
        }

        const bucket = asset.bucket ?? 'workbook-assets'
        const metadata = (asset.metadata ?? {}) as Record<string, unknown>
        const originalName =
          (typeof metadata.original_name === 'string' && metadata.original_name.length > 0
            ? metadata.original_name
            : asset.path.split('/').pop()) ?? 'asset'

        const targetPath = `workbooks/${newWorkbook.id}/items/${targetItemId}/${randomUUID()}-${originalName}`

        const { error: copyError } = await supabase.storage.from(bucket).copy(asset.path, targetPath)

        if (copyError) {
          console.error('[duplicateWorkbook] storage copy error', copyError)
          return await cleanupDuplicate('첨부 파일 복제 중 오류가 발생했습니다.')
        }

        copiedPaths.push({ bucket, path: targetPath })

        const { data: newAsset, error: assetInsertError } = await supabase
          .from('media_assets')
          .insert({
            owner_id: profile.id,
            scope: 'workbook_item',
            bucket,
            path: targetPath,
            mime_type: asset.mime_type ?? null,
            size: asset.size ?? 0,
            metadata: asset.metadata ?? null,
          })
          .select('id')
          .maybeSingle()

        if (assetInsertError || !newAsset) {
          console.error('[duplicateWorkbook] media asset insert error', assetInsertError)
          return await cleanupDuplicate('첨부 파일 복제 중 오류가 발생했습니다.')
        }

        newAssetIds.push(newAsset.id)

        const { error: linkError } = await supabase.from('workbook_item_media').insert({
          item_id: targetItemId,
          asset_id: newAsset.id,
          position: attachment.position ?? 0,
        })

        if (linkError) {
          console.error('[duplicateWorkbook] workbook_item_media insert error', linkError)
          return await cleanupDuplicate('첨부 파일 연결 중 오류가 발생했습니다.')
        }
      }
    }

    revalidatePath('/dashboard/workbooks')
    return {
      success: true as const,
      workbookId: newWorkbook.id as string,
    }
  } catch (error) {
    console.error('[duplicateWorkbook] unexpected error', error)
    return { error: '문제집 복제 중 예상치 못한 오류가 발생했습니다.' }
  }
}

// AI 해설 생성 입력 스키마
const generateAIExplanationInputSchema = z.object({
  prompt: z.string().min(1, '문항 내용이 필요합니다.'),
  context: z.string().optional(),
})

export type GenerateAIExplanationInput = z.infer<typeof generateAIExplanationInputSchema>

// AI SRT 문항 생성 입력 스키마
const generateQuestionsFromSrtInputSchema = z.object({
  srtText: z.string().min(1, 'SRT 내용이 필요합니다.'),
  questionCount: z.number().int().min(1).max(20).optional().default(10),
})

export type GenerateQuestionsFromSrtInput = z.infer<typeof generateQuestionsFromSrtInputSchema>

// AI 채점 기준 생성 입력 스키마
const generateAIGradingCriteriaInputSchema = z.object({
  prompt: z.string().min(1, '문항 내용이 필요합니다.'),
})

export type GenerateAIGradingCriteriaInput = z.infer<typeof generateAIGradingCriteriaInputSchema>

/**
 * AI를 사용하여 문항 해설을 생성합니다.
 */
export async function generateAIExplanation(input: GenerateAIExplanationInput) {
  const parseResult = generateAIExplanationInputSchema.safeParse(input)

  if (!parseResult.success) {
    return { error: '입력 값을 확인해주세요.' }
  }

  const { profile } = await getAuthContext()
  const allowedRoles = new Set(['teacher', 'principal', 'manager'])

  if (!profile || !allowedRoles.has(profile.role)) {
    return { error: 'AI 기능을 사용할 권한이 없습니다.' }
  }

  const { generateExplanation } = await import('@/lib/gemini')
  const result = await generateExplanation(parseResult.data.prompt, parseResult.data.context)

  if ('error' in result) {
    return { error: result.error }
  }

  return {
    success: true as const,
    explanation: result.explanation,
  }
}

/**
 * AI를 사용하여 채점 기준을 생성합니다.
 */
export async function generateAIGradingCriteria(input: GenerateAIGradingCriteriaInput) {
  const parseResult = generateAIGradingCriteriaInputSchema.safeParse(input)

  if (!parseResult.success) {
    return { error: '입력 값을 확인해주세요.' }
  }

  const { profile } = await getAuthContext()
  const allowedRoles = new Set(['teacher', 'principal', 'manager'])

  if (!profile || !allowedRoles.has(profile.role)) {
    return { error: 'AI 기능을 사용할 권한이 없습니다.' }
  }

  const { generateGradingCriteria } = await import('@/lib/gemini')
  const result = await generateGradingCriteria(parseResult.data.prompt)

  if ('error' in result) {
    return { error: result.error }
  }

  return {
    success: true as const,
    high: result.high,
    mid: result.mid,
    low: result.low,
  }
}

/**
 * AI를 사용하여 SRT 대본에서 문항을 자동 생성합니다.
 * principal 역할만 사용 가능합니다.
 */
export async function generateAIQuestionsFromSrt(input: GenerateQuestionsFromSrtInput) {
  const parseResult = generateQuestionsFromSrtInputSchema.safeParse(input)

  if (!parseResult.success) {
    return { error: '입력 값을 확인해주세요.' }
  }

  const { profile } = await getAuthContext()

  // principal만 사용 가능
  if (!profile || profile.role !== 'principal') {
    return { error: 'AI 문항 자동 생성은 교장 계정만 사용할 수 있습니다.' }
  }

  const { generateQuestionsFromSrt } = await import('@/lib/gemini')
  const result = await generateQuestionsFromSrt(
    parseResult.data.srtText,
    parseResult.data.questionCount
  )

  if ('error' in result) {
    return { error: result.error }
  }

  return {
    success: true as const,
    questions: result.questions,
  }
}
