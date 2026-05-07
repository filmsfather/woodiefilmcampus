import { SupabaseClient } from '@supabase/supabase-js'

export {
    LECTURE_ASSETS_BUCKET,
    LECTURE_MAX_UPLOAD_SIZE,
    LECTURE_MANAGE_ROLES,
    type LectureManageRole,
    isLectureManageRole,
} from '@/lib/lectures-shared'

export type Lecture = {
    id: string
    title: string
    description: string | null
    youtube_url: string
    is_published: boolean
    created_at: string
    updated_at: string
}

export type LectureAttachment = {
    id: string
    name: string
    bucket: string
    path: string
    mimeType: string | null
    size: number | null
    orderIndex: number
}

export async function fetchLectures(supabase: SupabaseClient) {
    const { data, error } = await supabase
        .from('lectures')
        .select('*')
        .order('created_at', { ascending: false })

    if (error) throw error
    return data as Lecture[]
}

export async function getLecture(supabase: SupabaseClient, id: string) {
    const { data, error } = await supabase
        .from('lectures')
        .select('*')
        .eq('id', id)
        .single()

    if (error) throw error
    return data as Lecture
}

export async function createLecture(supabase: SupabaseClient, lecture: Pick<Lecture, 'title' | 'description' | 'youtube_url'>) {
    const { data, error } = await supabase
        .from('lectures')
        .insert(lecture)
        .select()
        .single()

    if (error) throw error
    return data as Lecture
}

export async function updateLecture(supabase: SupabaseClient, id: string, lecture: Partial<Pick<Lecture, 'title' | 'description' | 'youtube_url' | 'is_published'>>) {
    const { data, error } = await supabase
        .from('lectures')
        .update(lecture)
        .eq('id', id)
        .select()
        .single()

    if (error) throw error
    return data as Lecture
}

export async function deleteLecture(supabase: SupabaseClient, id: string) {
    const { error } = await supabase
        .from('lectures')
        .delete()
        .eq('id', id)

    if (error) throw error
}

export function getYoutubeVideoId(url: string) {
    if (!url) return null
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=|shorts\/|live\/)([^#&?]*).*/
    const match = url.match(regExp)
    return (match && match[2].length === 11) ? match[2] : null
}

interface LectureAssetRow {
    id: string
    order_index: number | null
    media_asset:
        | {
            id: string
            bucket: string
            path: string
            mime_type: string | null
            size: number | null
            metadata: Record<string, unknown> | null
        }
        | Array<{
            id: string
            bucket: string
            path: string
            mime_type: string | null
            size: number | null
            metadata: Record<string, unknown> | null
        }>
        | null
}

function deriveAttachmentName(
    metadata: Record<string, unknown> | null | undefined,
    fallbackPath: string
) {
    const candidate = (metadata as { originalName?: unknown } | null)?.originalName
    if (typeof candidate === 'string' && candidate.length > 0) {
        return candidate
    }
    return fallbackPath.split('/').pop() ?? fallbackPath
}

export async function fetchLectureAttachments(
    supabase: SupabaseClient,
    lectureId: string
): Promise<LectureAttachment[]> {
    const { data, error } = await supabase
        .from('lecture_assets')
        .select(
            `id,
             order_index,
             media_asset:media_assets(id, bucket, path, mime_type, size, metadata)
            `
        )
        .eq('lecture_id', lectureId)
        .order('order_index', { ascending: true })

    if (error) {
        console.error('[lectures] failed to load attachments', error)
        return []
    }

    const rows = (data ?? []) as LectureAssetRow[]
    const attachments: LectureAttachment[] = []

    for (const row of rows) {
        const mediaRelation = Array.isArray(row.media_asset) ? row.media_asset[0] : row.media_asset
        if (!mediaRelation || !mediaRelation.bucket || !mediaRelation.path) {
            continue
        }
        attachments.push({
            id: String(row.id),
            name: deriveAttachmentName(mediaRelation.metadata ?? null, mediaRelation.path),
            bucket: mediaRelation.bucket,
            path: mediaRelation.path,
            mimeType: mediaRelation.mime_type ?? null,
            size: typeof mediaRelation.size === 'number' ? mediaRelation.size : null,
            orderIndex: Number(row.order_index ?? 0),
        })
    }

    attachments.sort((a, b) => a.orderIndex - b.orderIndex)
    return attachments
}
