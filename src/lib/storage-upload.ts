import { createClient as createBrowserSupabase } from '@/lib/supabase/client'

const DEFAULT_MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB

export type DirectUploadOptions = {
  bucket: string
  file: File
  path: string
  maxSizeBytes?: number
  cacheControl?: string
}

export type DirectUploadResult = {
  path: string
  size: number
  mimeType: string
  originalName: string
}

export function sanitizeStorageFileName(name: string) {
  if (!name) {
    return 'upload.dat'
  }
  return name.replace(/[^a-zA-Z0-9_.-]/g, '_')
}

export function buildRandomizedFileName(originalName: string) {
  const sanitized = sanitizeStorageFileName(originalName)
  const extIndex = sanitized.lastIndexOf('.')
  const ext = extIndex >= 0 ? sanitized.slice(extIndex) : ''
  const base = `${Date.now()}-${crypto.randomUUID()}`
  return `${base}${ext}`
}

export async function uploadFileToStorageViaClient({
  bucket,
  file,
  path,
  maxSizeBytes = DEFAULT_MAX_FILE_SIZE,
  cacheControl = '3600',
}: DirectUploadOptions): Promise<DirectUploadResult> {
  if (file.size > maxSizeBytes) {
    const maxMb = Math.round(maxSizeBytes / (1024 * 1024))
    throw new Error(`파일 크기는 최대 ${maxMb}MB까지 허용됩니다.`)
  }

  const supabase = createBrowserSupabase()
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl,
    upsert: false,
    contentType: file.type || 'application/octet-stream',
  })

  if (error) {
    throw error
  }

  return {
    path,
    size: file.size,
    mimeType: file.type || 'application/octet-stream',
    originalName: file.name,
  }
}

export type UploadedObjectMeta = {
  bucket: string
  path: string
  size: number
  mimeType: string
  originalName: string
}

export function buildPendingStoragePath({
  ownerId,
  prefix,
  fileName,
}: {
  ownerId: string
  prefix: string
  fileName: string
}) {
  const safeName = sanitizeStorageFileName(fileName)
  return `${prefix}/${ownerId}/${Date.now()}-${crypto.randomUUID()}-${safeName}`
}

export const MAX_STORAGE_FILE_SIZE = DEFAULT_MAX_FILE_SIZE
