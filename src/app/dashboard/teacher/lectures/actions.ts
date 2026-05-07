'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'

import { getAuthContext } from '@/lib/auth'
import {
    createLecture,
    deleteLecture as deleteLectureRow,
    updateLecture,
    LECTURE_ASSETS_BUCKET,
    LECTURE_MAX_UPLOAD_SIZE,
    isLectureManageRole,
} from '@/lib/lectures'
import { createClient as createServerSupabase } from '@/lib/supabase/server'
import type { UploadedObjectMeta } from '@/lib/storage-upload'

type ActionResult = {
    success?: boolean
    error?: string
    lectureId?: string
}

type DeleteResult = {
    success?: boolean
    error?: string
}

type LectureAssetRow = {
    id: string
    media_asset_id: string | null
    order_index: number
    media_asset?: {
        id: string
        bucket: string | null
        path: string | null
    } | null
}

function sanitizeFileName(name: string) {
    if (!name) {
        return 'upload.dat'
    }
    return name.replace(/[^a-zA-Z0-9_.-]/g, '_')
}

function normalizeAssetRow(row: {
    id: unknown
    media_asset_id: unknown
    order_index: unknown
    media_asset?: { id: unknown; bucket: unknown; path: unknown }[] | { id: unknown; bucket: unknown; path: unknown } | null
}): LectureAssetRow {
    const mediaRelation = Array.isArray(row.media_asset) ? row.media_asset[0] : row.media_asset
    return {
        id: String(row.id),
        media_asset_id: row.media_asset_id ? String(row.media_asset_id) : null,
        order_index: Number(row.order_index ?? 0),
        media_asset: mediaRelation
            ? {
                id: String(mediaRelation.id),
                bucket: mediaRelation.bucket ? String(mediaRelation.bucket) : null,
                path: mediaRelation.path ? String(mediaRelation.path) : null,
            }
            : null,
    }
}

function parseUploadedAttachments(value: FormDataEntryValue | null | undefined): UploadedObjectMeta[] {
    if (!value) {
        return []
    }
    if (typeof value !== 'string' || value.trim().length === 0) {
        return []
    }

    let parsed: unknown
    try {
        parsed = JSON.parse(value)
    } catch (parseError) {
        console.error('[lectures] failed to parse attachment payload', parseError)
        throw new Error('첨부 파일 정보를 확인하지 못했습니다.')
    }

    if (!Array.isArray(parsed)) {
        throw new Error('첨부 파일 정보 형식이 올바르지 않습니다.')
    }

    return parsed.map((item, index) => {
        if (!item || typeof item !== 'object') {
            throw new Error(`첨부 파일 정보가 손상되었습니다. (index: ${index})`)
        }

        const record = item as Record<string, unknown>
        const bucket = typeof record.bucket === 'string' ? record.bucket : null
        const path = typeof record.path === 'string' ? record.path : null
        const size = typeof record.size === 'number' ? record.size : Number(record.size)
        const mimeType = typeof record.mimeType === 'string' ? record.mimeType : null
        const originalName = typeof record.originalName === 'string' ? record.originalName : null

        if (!bucket || !path || !Number.isFinite(size) || !mimeType || !originalName) {
            throw new Error('첨부 파일 정보가 올바르지 않습니다.')
        }

        if (bucket !== LECTURE_ASSETS_BUCKET) {
            throw new Error('허용되지 않은 저장소 경로가 감지되었습니다.')
        }

        if (size > LECTURE_MAX_UPLOAD_SIZE) {
            throw new Error('첨부 파일 용량 제한을 초과했습니다.')
        }

        return { bucket, path, size, mimeType, originalName }
    })
}

async function fetchLectureAssetRows(
    supabase: Awaited<ReturnType<typeof createServerSupabase>>,
    lectureId: string
): Promise<LectureAssetRow[]> {
    const { data, error } = await supabase
        .from('lecture_assets')
        .select('id, media_asset_id, order_index, media_asset:media_assets(id, bucket, path)')
        .eq('lecture_id', lectureId)
        .order('order_index', { ascending: true })

    if (error) {
        console.error('[lectures] failed to fetch attachments', error)
        throw new Error('첨부 파일 정보를 불러오지 못했습니다.')
    }

    return (data ?? []).map((row) => normalizeAssetRow(row))
}

async function deleteLectureAttachmentRows(
    supabase: Awaited<ReturnType<typeof createServerSupabase>>,
    rows: LectureAssetRow[]
) {
    if (rows.length === 0) {
        return
    }

    const storagePaths = rows
        .map((row) => row.media_asset?.path)
        .filter((value): value is string => Boolean(value))

    if (storagePaths.length > 0) {
        const { error: removeError } = await supabase.storage.from(LECTURE_ASSETS_BUCKET).remove(storagePaths)
        if (removeError) {
            console.error('[lectures] failed to remove attachment objects', removeError)
        }
    }

    const assetRowIds = rows.map((row) => row.id)
    const { error: deleteRowsError } = await supabase
        .from('lecture_assets')
        .delete()
        .in('id', assetRowIds)
    if (deleteRowsError) {
        console.error('[lectures] failed to delete lecture_assets rows', deleteRowsError)
    }

    const mediaAssetIds = rows
        .map((row) => row.media_asset_id)
        .filter((value): value is string => Boolean(value))
    if (mediaAssetIds.length > 0) {
        const { error: deleteMediaError } = await supabase
            .from('media_assets')
            .delete()
            .in('id', mediaAssetIds)
        if (deleteMediaError) {
            console.error('[lectures] failed to delete media_assets rows', deleteMediaError)
        }
    }
}

async function cleanupAttachmentsByIds(
    supabase: Awaited<ReturnType<typeof createServerSupabase>>,
    assetIds: string[]
) {
    if (assetIds.length === 0) {
        return
    }
    const { data, error } = await supabase
        .from('lecture_assets')
        .select('id, media_asset_id, order_index, media_asset:media_assets(id, bucket, path)')
        .in('id', assetIds)
    if (error) {
        console.error('[lectures] failed to load attachments for cleanup', error)
        return
    }
    const normalized = (data ?? []).map((row) => normalizeAssetRow(row))
    await deleteLectureAttachmentRows(supabase, normalized)
}

async function finalizeLectureAttachment(
    supabase: Awaited<ReturnType<typeof createServerSupabase>>,
    params: {
        attachment: UploadedObjectMeta
        lectureId: string
        ownerId: string
        orderIndex: number
    }
) {
    const { attachment, lectureId, ownerId, orderIndex } = params
    const sanitizedName = sanitizeFileName(attachment.originalName)
    const finalPath = `${lectureId}/${randomUUID()}-${sanitizedName}`

    if (attachment.path !== finalPath) {
        const { error: moveError } = await supabase.storage
            .from(LECTURE_ASSETS_BUCKET)
            .move(attachment.path, finalPath)
        if (moveError) {
            console.error('[lectures] failed to move attachment', moveError, {
                from: attachment.path,
                to: finalPath,
            })
            throw new Error('첨부 파일을 이동하지 못했습니다.')
        }
    }

    const { data: mediaAsset, error: mediaAssetError } = await supabase
        .from('media_assets')
        .insert({
            owner_id: ownerId,
            scope: 'lecture',
            bucket: LECTURE_ASSETS_BUCKET,
            path: finalPath,
            mime_type: attachment.mimeType,
            size: attachment.size,
            metadata: { originalName: sanitizedName },
        })
        .select('id')
        .single()

    if (mediaAssetError || !mediaAsset?.id) {
        console.error('[lectures] failed to insert media asset', mediaAssetError)
        await supabase.storage.from(LECTURE_ASSETS_BUCKET).remove([finalPath])
        throw new Error('첨부 파일 정보를 저장하지 못했습니다.')
    }

    const { data: lectureAsset, error: lectureAssetError } = await supabase
        .from('lecture_assets')
        .insert({
            lecture_id: lectureId,
            media_asset_id: mediaAsset.id as string,
            order_index: orderIndex,
            created_by: ownerId,
        })
        .select('id')
        .single()

    if (lectureAssetError || !lectureAsset?.id) {
        console.error('[lectures] failed to insert lecture asset', lectureAssetError)
        await supabase.storage.from(LECTURE_ASSETS_BUCKET).remove([finalPath])
        await supabase.from('media_assets').delete().eq('id', mediaAsset.id)
        throw new Error('첨부 정보를 연결하지 못했습니다.')
    }

    return {
        lectureAssetId: lectureAsset.id as string,
        mediaAssetId: mediaAsset.id as string,
        path: finalPath,
    }
}

function revalidateLecturePaths(lectureId?: string) {
    revalidatePath('/dashboard/teacher/lectures')
    revalidatePath('/dashboard/student/lectures')
    if (lectureId) {
        revalidatePath(`/dashboard/teacher/lectures/${lectureId}/edit`)
        revalidatePath(`/dashboard/student/lectures/${lectureId}`)
    }
}

export async function createLectureAction(formData: FormData): Promise<ActionResult> {
    const { profile } = await getAuthContext()

    if (!profile?.role || !isLectureManageRole(profile.role)) {
        return { error: '강의를 등록할 권한이 없습니다.' }
    }

    const titleValue = formData.get('title')
    const youtubeUrlValue = formData.get('youtube_url')
    const descriptionValue = formData.get('description')

    if (typeof titleValue !== 'string' || titleValue.trim().length === 0) {
        return { error: '강의 제목을 입력해주세요.' }
    }
    if (typeof youtubeUrlValue !== 'string' || youtubeUrlValue.trim().length === 0) {
        return { error: 'YouTube 링크를 입력해주세요.' }
    }

    const title = titleValue.trim()
    const youtube_url = youtubeUrlValue.trim()
    const description = typeof descriptionValue === 'string' ? descriptionValue.trim() : ''

    let uploadedAttachments: UploadedObjectMeta[] = []
    try {
        uploadedAttachments = parseUploadedAttachments(formData.get('uploadedAttachments'))
    } catch (parseError) {
        return { error: parseError instanceof Error ? parseError.message : '첨부 파일 정보를 확인하지 못했습니다.' }
    }

    const supabase = await createServerSupabase()

    let createdLectureId: string | null = null
    const insertedAttachmentIds: string[] = []

    try {
        const lecture = await createLecture(supabase, {
            title,
            description: description || null,
            youtube_url,
        })
        createdLectureId = lecture.id

        let orderIndex = 0
        for (const attachment of uploadedAttachments) {
            const created = await finalizeLectureAttachment(supabase, {
                attachment,
                lectureId: lecture.id,
                ownerId: profile.id,
                orderIndex,
            })
            insertedAttachmentIds.push(created.lectureAssetId)
            orderIndex += 1
        }

        revalidateLecturePaths(lecture.id)
        return { success: true, lectureId: lecture.id }
    } catch (error) {
        console.error('[lectures] create lecture error', error)
        if (insertedAttachmentIds.length > 0) {
            await cleanupAttachmentsByIds(supabase, insertedAttachmentIds)
        }
        if (createdLectureId) {
            await supabase.from('lectures').delete().eq('id', createdLectureId)
        }
        return {
            error: error instanceof Error ? error.message : '강의 등록 중 문제가 발생했습니다.',
        }
    }
}

export async function updateLectureAction(id: string, formData: FormData): Promise<ActionResult> {
    const { profile } = await getAuthContext()

    if (!profile?.role || !isLectureManageRole(profile.role)) {
        return { error: '강의를 수정할 권한이 없습니다.' }
    }

    if (!id) {
        return { error: '강의 정보를 확인할 수 없습니다.' }
    }

    const titleValue = formData.get('title')
    const youtubeUrlValue = formData.get('youtube_url')
    const descriptionValue = formData.get('description')

    if (typeof titleValue !== 'string' || titleValue.trim().length === 0) {
        return { error: '강의 제목을 입력해주세요.' }
    }
    if (typeof youtubeUrlValue !== 'string' || youtubeUrlValue.trim().length === 0) {
        return { error: 'YouTube 링크를 입력해주세요.' }
    }

    const title = titleValue.trim()
    const youtube_url = youtubeUrlValue.trim()
    const description = typeof descriptionValue === 'string' ? descriptionValue.trim() : ''
    const isPublished = formData.get('is_published') === 'on'

    let uploadedAttachments: UploadedObjectMeta[] = []
    try {
        uploadedAttachments = parseUploadedAttachments(formData.get('uploadedAttachments'))
    } catch (parseError) {
        return { error: parseError instanceof Error ? parseError.message : '첨부 파일 정보를 확인하지 못했습니다.' }
    }

    const removedAttachmentIds = new Set(
        formData
            .getAll('removedAttachmentIds')
            .map((value) => (typeof value === 'string' ? value.trim() : ''))
            .filter((value): value is string => value.length > 0)
    )

    const supabase = await createServerSupabase()

    const insertedAttachmentIds: string[] = []

    try {
        const existingAssets = await fetchLectureAssetRows(supabase, id)
        const attachmentMap = new Map(existingAssets.map((asset) => [asset.id, asset]))
        const attachmentsToRemove = Array.from(removedAttachmentIds)
            .map((rid) => attachmentMap.get(rid))
            .filter((asset): asset is LectureAssetRow => Boolean(asset))

        if (attachmentsToRemove.length > 0) {
            await deleteLectureAttachmentRows(supabase, attachmentsToRemove)
        }

        const remainingCount = existingAssets.filter((asset) => !removedAttachmentIds.has(asset.id)).length

        let orderIndex = remainingCount
        for (const attachment of uploadedAttachments) {
            const created = await finalizeLectureAttachment(supabase, {
                attachment,
                lectureId: id,
                ownerId: profile.id,
                orderIndex,
            })
            insertedAttachmentIds.push(created.lectureAssetId)
            orderIndex += 1
        }

        await updateLecture(supabase, id, {
            title,
            description: description || null,
            youtube_url,
            is_published: isPublished,
        })

        revalidateLecturePaths(id)
        return { success: true, lectureId: id }
    } catch (error) {
        console.error('[lectures] update lecture error', error)
        if (insertedAttachmentIds.length > 0) {
            await cleanupAttachmentsByIds(supabase, insertedAttachmentIds)
        }
        return {
            error: error instanceof Error ? error.message : '강의 수정 중 문제가 발생했습니다.',
            lectureId: id,
        }
    }
}

export async function deleteLectureAction(id: string): Promise<DeleteResult> {
    const { profile } = await getAuthContext()

    if (!profile?.role || !isLectureManageRole(profile.role)) {
        return { error: '강의를 삭제할 권한이 없습니다.' }
    }

    if (!id) {
        return { error: '강의 정보를 확인할 수 없습니다.' }
    }

    const supabase = await createServerSupabase()

    try {
        const assets = await fetchLectureAssetRows(supabase, id)
        await deleteLectureAttachmentRows(supabase, assets)

        await deleteLectureRow(supabase, id)

        revalidateLecturePaths(id)
        return { success: true }
    } catch (error) {
        console.error('[lectures] delete lecture error', error)
        return {
            error: error instanceof Error ? error.message : '강의 삭제 중 문제가 발생했습니다.',
        }
    }
}
