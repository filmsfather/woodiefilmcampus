import { createClient as createServerSupabase } from '@/lib/supabase/server'
import type { MediaAssetRecord } from '@/lib/assignment-evaluation'

export async function createAssetSignedUrlMap(
  mediaAssetMap: Map<string, MediaAssetRecord>
): Promise<Map<string, { url: string; filename: string; mimeType: string | null }>> {
  const supabase = createServerSupabase()
  const result = new Map<string, { url: string; filename: string; mimeType: string | null }>()

  await Promise.all(
    Array.from(mediaAssetMap.entries()).map(async ([assetId, asset]) => {
      try {
        const { data: signed } = await supabase.storage
          .from(asset.bucket)
          .createSignedUrl(asset.path, 60 * 30)

        if (signed?.signedUrl) {
          const metadata = asset.metadata ?? {}
          const originalName =
            (typeof metadata.original_name === 'string' && metadata.original_name.length > 0
              ? metadata.original_name
              : undefined) ??
            (typeof metadata.originalName === 'string' && metadata.originalName.length > 0
              ? metadata.originalName
              : undefined)

          const filename = originalName ?? asset.path.split('/').pop() ?? '첨부 파일'
          result.set(assetId, {
            url: signed.signedUrl,
            filename,
            mimeType: asset.mimeType,
          })
        }
      } catch (error) {
        console.error('[assignment] asset signed url error', error)
      }
    })
  )

  return result
}
