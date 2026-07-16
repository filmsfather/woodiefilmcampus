import { transcribeHandwrittenImages } from '@/lib/gemini'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * 제출된 원고 사진들을 storage에서 내려받아 Gemini로 전사하고 attempt에 반영합니다.
 * 실패해도 제출 자체에는 영향을 주지 않도록 ocr_status만 갱신합니다.
 */
export async function runWritingOcrForAttempt(attemptId: string): Promise<{ success: boolean; error?: string }> {
  const admin = createAdminClient()

  await admin.from('writing_attempts').update({ ocr_status: 'processing' }).eq('id', attemptId)

  const markFailed = async (message: string) => {
    await admin.from('writing_attempts').update({ ocr_status: 'failed' }).eq('id', attemptId)
    return { success: false, error: message }
  }

  type Row = {
    order_index: number
    media_assets: { bucket: string | null; path: string | null; mime_type: string | null } | { bucket: string | null; path: string | null; mime_type: string | null }[] | null
  }

  const { data, error } = await admin
    .from('writing_submission_assets')
    .select('order_index, media_assets(bucket, path, mime_type)')
    .eq('attempt_id', attemptId)
    .order('order_index', { ascending: true })

  if (error || !data || data.length === 0) {
    if (error) console.error('[writings] failed to load submission assets for ocr', error)
    return markFailed('제출된 원고 사진을 찾을 수 없습니다.')
  }

  const images: Array<{ mimeType: string; base64Data: string }> = []

  for (const row of data as unknown as Row[]) {
    const media = Array.isArray(row.media_assets) ? row.media_assets[0] : row.media_assets
    if (!media?.bucket || !media?.path) continue

    const { data: blob, error: downloadError } = await admin.storage.from(media.bucket).download(media.path)
    if (downloadError || !blob) {
      console.error('[writings] failed to download submission image for ocr', downloadError)
      return markFailed('원고 사진을 내려받지 못했습니다.')
    }

    const buffer = Buffer.from(await blob.arrayBuffer())
    images.push({
      mimeType: media.mime_type ?? 'image/jpeg',
      base64Data: buffer.toString('base64'),
    })
  }

  if (images.length === 0) {
    return markFailed('전사할 원고 사진이 없습니다.')
  }

  const result = await transcribeHandwrittenImages(images)

  if ('error' in result) {
    console.error('[writings] ocr failed', result.error)
    return markFailed(result.error)
  }

  const { error: updateError } = await admin
    .from('writing_attempts')
    .update({ ocr_text: result.text, ocr_status: 'done' })
    .eq('id', attemptId)

  if (updateError) {
    console.error('[writings] failed to save ocr text', updateError)
    return markFailed('변환된 텍스트 저장에 실패했습니다.')
  }

  return { success: true }
}
