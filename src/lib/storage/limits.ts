export const MAX_PDF_FILE_SIZE = 50 * 1024 * 1024 // 50MB
export const MAX_IMAGE_FILE_SIZE = 3 * 1024 * 1024 // 3MB
export const MAX_IMAGES_PER_QUESTION = 5
export const MAX_IMAGES_PER_WORKSHEET_QUESTION = 10

export function resolveMaxImagesPerQuestion(workbookType?: string | null) {
  return workbookType === 'worksheet' ? MAX_IMAGES_PER_WORKSHEET_QUESTION : MAX_IMAGES_PER_QUESTION
}
