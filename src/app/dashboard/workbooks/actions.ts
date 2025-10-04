'use server'

import { randomUUID } from 'crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { getAuthContext } from '@/lib/auth'
import { WORKBOOK_SUBJECTS, WORKBOOK_TYPES } from '@/lib/validation/workbook'
import { createClient as createServerSupabase } from '@/lib/supabase/server'

const workbookChoiceSchema = z.object({
  content: z.string().min(1),
  isCorrect: z.boolean(),
})

const workbookItemSchema = z.object({
  prompt: z.string().min(1),
  explanation: z.string().optional(),
  choices: z.array(workbookChoiceSchema).optional(),
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
  weekLabel: z.string().optional(),
  tags: z.array(z.string()),
  description: z.string().optional(),
  config: workbookConfigSchema,
  items: z.array(workbookItemSchema).min(1),
  assets: z.array(workbookAssetSchema).optional().default([]),
})

export type CreateWorkbookInput = z.infer<typeof createWorkbookInputSchema>

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

  const supabase = createServerSupabase()
  const { profile } = await getAuthContext()

  const allowedRoles = new Set(['teacher', 'principal', 'manager'])

  if (!profile || !allowedRoles.has(profile.role)) {
    await removeStoragePaths(supabase, assets.map((asset) => ({ bucket: asset.bucket, path: asset.path })))
    return {
      error: '문제집을 생성할 권한이 없습니다.',
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

      return {
        workbook_id: workbook.id,
        position,
        prompt: item.prompt,
        answer_type: payload.type,
        explanation: item.explanation ?? null,
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
      const choicesRows = insertedItems.flatMap((inserted) => {
        const originalItem = itemByPosition.get(inserted.position)
        if (!originalItem?.choices?.length) {
          return []
        }

        return originalItem.choices.map((choice, choiceIndex) => ({
          item_id: inserted.id,
          label: String.fromCharCode(65 + choiceIndex),
          content: choice.content,
          is_correct: choice.isCorrect,
        }))
      })

      if (choicesRows.length > 0) {
        const { error: choicesError } = await supabase
          .from('workbook_item_choices')
          .insert(choicesRows)

        if (choicesError) {
          console.error('[createWorkbook] failed to insert choices', choicesError)
          return await failAndCleanup('객관식 보기 저장 중 오류가 발생했습니다.', true)
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

      const { data: mediaAsset, error: mediaError } = await supabase
        .from('media_assets')
        .insert({
          owner_id: profile.id,
          scope: 'workbook_item',
          bucket: asset.bucket,
          path: targetPath,
          mime_type: asset.mimeType ?? null,
          size: asset.size,
          metadata: { original_name: asset.name },
        })
        .select('id')
        .maybeSingle()

      if (mediaError || !mediaAsset) {
        console.error('[createWorkbook] media asset insert error', mediaError)
        return await failAndCleanup('첨부 파일 저장 중 오류가 발생했습니다.', true)
      }

      insertedAssetIds.push(mediaAsset.id)

      itemMediaRows.push({
        item_id: itemId,
        asset_id: mediaAsset.id,
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

type StorageRemovalEntry = {
  bucket: string
  path: string
}

async function removeStoragePaths(
  supabase: ReturnType<typeof createServerSupabase>,
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
  supabase: ReturnType<typeof createServerSupabase>,
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

  const supabase = createServerSupabase()

  try {
    const { data: workbook, error: fetchError } = await supabase
      .from('workbooks')
      .select('id')
      .eq('id', workbookId)
      .eq('teacher_id', profile.id)
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

  const supabase = createServerSupabase()

  try {
    const { data: workbook, error: fetchError } = await supabase
      .from('workbooks')
      .select(
        `id, title, subject, type, week_label, tags, description, config,
         workbook_items(id, position, prompt, explanation, srs_settings, answer_type,
          workbook_item_choices(content, is_correct),
          workbook_item_media(position, media_assets(id, bucket, path, mime_type, size, metadata))
         )`
      )
      .eq('id', workbookId)
      .eq('teacher_id', profile.id)
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

    const choiceRows = insertedItems.flatMap((inserted) => {
      const originalItem = workbook.workbook_items?.find((item) => item.position === inserted.position)
      if (!originalItem?.workbook_item_choices?.length) {
        return []
      }

      return originalItem.workbook_item_choices.map((choice, idx) => ({
        item_id: inserted.id,
        label: String.fromCharCode(65 + idx),
        content: choice.content,
        is_correct: choice.is_correct,
      }))
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
