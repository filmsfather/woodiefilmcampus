/**
 * Client-side image compression utility using Canvas API
 */

export interface CompressOptions {
  maxSizeBytes: number
  maxWidth?: number
  maxHeight?: number
  initialQuality?: number
  minQuality?: number
}

const DEFAULT_MAX_WIDTH = 1920
const DEFAULT_MAX_HEIGHT = 1920
const DEFAULT_INITIAL_QUALITY = 0.9
const DEFAULT_MIN_QUALITY = 0.5

/**
 * Compresses an image file to fit within the specified size limit
 * Uses canvas API to resize and adjust JPEG quality
 */
export async function compressImage(
  file: File,
  options: CompressOptions
): Promise<{ blob: Blob; wasCompressed: boolean }> {
  const {
    maxSizeBytes,
    maxWidth = DEFAULT_MAX_WIDTH,
    maxHeight = DEFAULT_MAX_HEIGHT,
    initialQuality = DEFAULT_INITIAL_QUALITY,
    minQuality = DEFAULT_MIN_QUALITY,
  } = options

  // If already under limit, return as-is
  if (file.size <= maxSizeBytes) {
    return { blob: file, wasCompressed: false }
  }

  // Load image
  const img = await loadImage(file)

  // Calculate new dimensions
  let { width, height } = img
  if (width > maxWidth || height > maxHeight) {
    const ratio = Math.min(maxWidth / width, maxHeight / height)
    width = Math.round(width * ratio)
    height = Math.round(height * ratio)
  }

  // Create canvas and draw image
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Canvas context를 생성할 수 없습니다.')
  }

  ctx.drawImage(img, 0, 0, width, height)

  // Try different quality levels to find one that fits
  let quality = initialQuality
  let blob: Blob | null = null

  while (quality >= minQuality) {
    blob = await canvasToBlob(canvas, 'image/jpeg', quality)
    if (blob.size <= maxSizeBytes) {
      return { blob, wasCompressed: true }
    }
    quality -= 0.1
  }

  // If still too large after minimum quality, try further reducing dimensions
  const reductionRatio = Math.sqrt(maxSizeBytes / (blob?.size ?? file.size))
  const newWidth = Math.max(Math.round(width * reductionRatio), 100)
  const newHeight = Math.max(Math.round(height * reductionRatio), 100)

  canvas.width = newWidth
  canvas.height = newHeight
  ctx.drawImage(img, 0, 0, newWidth, newHeight)

  blob = await canvasToBlob(canvas, 'image/jpeg', minQuality)
  return { blob, wasCompressed: true }
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('이미지를 불러올 수 없습니다.'))
    }

    img.src = url
  })
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob)
        } else {
          reject(new Error('이미지 변환에 실패했습니다.'))
        }
      },
      type,
      quality
    )
  })
}

/**
 * Checks if a file is a valid image type
 */
export function isImageFile(file: File): boolean {
  const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
  return validTypes.includes(file.type)
}

/**
 * Converts a File to a compressed File object with the original name
 */
export async function compressImageFile(
  file: File,
  maxSizeBytes: number
): Promise<{ file: File; wasCompressed: boolean }> {
  if (!isImageFile(file)) {
    throw new Error('지원하지 않는 이미지 형식입니다.')
  }

  const { blob, wasCompressed } = await compressImage(file, { maxSizeBytes })

  if (!wasCompressed) {
    return { file, wasCompressed: false }
  }

  // Create a new File object with the original name but .jpg extension
  const originalName = file.name
  const nameWithoutExt = originalName.replace(/\.[^/.]+$/, '')
  const newName = `${nameWithoutExt}.jpg`

  const compressedFile = new File([blob], newName, {
    type: 'image/jpeg',
    lastModified: Date.now(),
  })

  return { file: compressedFile, wasCompressed: true }
}








