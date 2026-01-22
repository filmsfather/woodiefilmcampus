import { z } from 'zod'

export const WORKBOOK_SUBJECTS = ['연출', '작법', '연구', '통합', '한예종', '사전과제'] as const
export const WORKBOOK_TYPES = ['srs', 'pdf', 'writing', 'film', 'lecture', 'image'] as const

export const WORKBOOK_TITLES: Record<(typeof WORKBOOK_TYPES)[number], string> = {
  srs: 'SRS 반복 학습',
  pdf: 'PDF 제출형',
  writing: '서술형',
  film: '영화 감상형',
  lecture: '인터넷 강의형',
  image: '이미지 제출형',
}

export const WORKBOOK_TYPE_DESCRIPTIONS: Record<(typeof WORKBOOK_TYPES)[number], string> = {
  srs: '단답/다지선다 기반 반복 학습',
  pdf: 'PDF 업로드로 완료되는 과제',
  writing: '서술형 답안을 제출하여 평가',
  film: '지정된 감상 노트를 작성',
  lecture: '강의 시청 후 요약 제출',
  image: '각 질문에 사진을 업로드하여 제출',
}

const optionalTrimmedString = z
  .string()
  .trim()
  .optional()
  .transform((value) => {
    if (!value) {
      return ''
    }

    return value
  })

const requiredTrimmedString = z.string().trim()

const numericStringOptional = z
  .string()
  .optional()
  .transform((value) => {
    if (!value) {
      return ''
    }

    const trimmed = value.trim()
    return trimmed
  })
  .refine((value) => !value || /^[0-9]+$/.test(value), {
    message: '숫자만 입력해주세요.',
  })

const urlStringOptional = z
  .string()
  .optional()
  .transform((value) => {
    if (!value) {
      return ''
    }

    return value.trim()
  })
  .refine((value) => {
    if (!value) {
      return true
    }

    try {
      const url = new URL(value)
      return ['http:', 'https:'].includes(url.protocol)
    } catch {
      return false
    }
  }, { message: '유효한 URL을 입력해주세요.' })

const srsAnswerTypeSchema = z.enum(['multiple_choice', 'short_answer'])

const workbookChoiceSchema = z.object({
  content: requiredTrimmedString,
  isCorrect: z.boolean(),
})

const workbookShortFieldSchema = z.object({
  label: optionalTrimmedString,
  answer: requiredTrimmedString.min(1, { message: '정답을 입력해주세요.' }),
})

const gradingCriteriaSchema = z.object({
  high: requiredTrimmedString,
  mid: requiredTrimmedString,
  low: requiredTrimmedString,
})

export const workbookItemSchema = z.object({
  prompt: requiredTrimmedString.min(1, { message: '문항 내용을 입력해주세요.' }),
  explanation: optionalTrimmedString,
  gradingCriteria: gradingCriteriaSchema.optional(),
  answerType: srsAnswerTypeSchema.optional(),
  choices: z.array(workbookChoiceSchema).optional(),
  shortFields: z.array(workbookShortFieldSchema).optional(),
})

const srsSettingsSchema = z
  .object({
    allowMultipleCorrect: z.boolean(),
  })
  .default({ allowMultipleCorrect: true })

const pdfSettingsSchema = z
  .object({
    instructions: optionalTrimmedString,
  })
  .default({ instructions: '' })

const writingSettingsSchema = z
  .object({
    instructions: optionalTrimmedString,
    maxCharacters: numericStringOptional,
  })
  .default({ instructions: '', maxCharacters: '' })

const filmSettingsSchema = z
  .object({
    noteCount: z
      .number()
      .int('정수를 입력해주세요.')
      .min(1, { message: '최소 1개 이상 지정해주세요.' })
      .max(5, { message: '최대 5개까지 지정할 수 있습니다.' }),
    country: optionalTrimmedString,
    director: optionalTrimmedString,
    genre: optionalTrimmedString,
    subgenre: optionalTrimmedString,
  })
  .default({ noteCount: 1, country: '', director: '', genre: '', subgenre: '' })

const lectureSettingsSchema = z
  .object({
    youtubeUrl: urlStringOptional,
    instructions: optionalTrimmedString,
  })
  .default({ youtubeUrl: '', instructions: '' })

const imageSettingsSchema = z
  .object({
    instructions: optionalTrimmedString,
  })
  .default({ instructions: '' })

export const workbookFormSchema = z
  .object({
    title: requiredTrimmedString
      .min(1, { message: '문제집 제목을 입력해주세요.' })
      .max(120, { message: '제목은 120자 이내로 입력해주세요.' }),
    subject: z.enum(WORKBOOK_SUBJECTS),
    type: z.enum(WORKBOOK_TYPES),
    authorId: z.string().optional().transform((value) => value === '' ? undefined : value),
    weekLabel: optionalTrimmedString,
    tagsInput: optionalTrimmedString,
    description: optionalTrimmedString,
    srsSettings: srsSettingsSchema,
    pdfSettings: pdfSettingsSchema,
    writingSettings: writingSettingsSchema,
    filmSettings: filmSettingsSchema,
    lectureSettings: lectureSettingsSchema,
    imageSettings: imageSettingsSchema,
    items: z.array(workbookItemSchema).min(1, { message: '문항을 최소 1개 이상 추가해주세요.' }),
  })
  .superRefine((values, ctx) => {
    if (values.type === 'srs') {
      values.items.forEach((item, index) => {
        const answerType = item.answerType ?? 'multiple_choice'

        if (answerType === 'multiple_choice') {
          const choices = item.choices ?? []
          const filledChoices = choices.filter((choice) => choice.content.length > 0)

          if (filledChoices.length < 2) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: '보기는 최소 2개 이상 입력해주세요.',
              path: ['items', index, 'choices'],
            })
          }

          choices.forEach((choice, choiceIndex) => {
            if (choice.content.length === 0) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: '보기 내용을 입력해주세요.',
                path: ['items', index, 'choices', choiceIndex, 'content'],
              })
            }
          })

          const correctCount = choices.filter((choice) => choice.isCorrect).length

          if (correctCount === 0) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: '정답을 최소 1개 이상 선택해주세요.',
              path: ['items', index, 'choices'],
            })
          }

          if (!values.srsSettings.allowMultipleCorrect && correctCount > 1) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: '단일 정답 모드에서는 하나의 정답만 선택할 수 있습니다.',
              path: ['items', index, 'choices'],
            })
          }
        } else if (answerType === 'short_answer') {
          const shortFields = item.shortFields ?? []

          if (shortFields.length === 0) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: '단답 필드를 최소 1개 이상 추가해주세요.',
              path: ['items', index, 'shortFields'],
            })
          }

          shortFields.forEach((field, fieldIndex) => {
            if (!field.answer || field.answer.length === 0) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: '단답 정답을 입력해주세요.',
                path: ['items', index, 'shortFields', fieldIndex, 'answer'],
              })
            }
          })
        } else {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: '지원하지 않는 답안 유형입니다.',
            path: ['items', index, 'answerType'],
          })
        }
      })
    }

    if (values.type === 'writing' && values.writingSettings.maxCharacters) {
      const length = Number(values.writingSettings.maxCharacters)
      if (Number.isNaN(length) || length <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: '양의 정수를 입력해주세요.',
          path: ['writingSettings', 'maxCharacters'],
        })
      }
    }
  })

export type WorkbookFormValues = z.infer<typeof workbookFormSchema>
export type WorkbookItemFormValues = z.infer<typeof workbookItemSchema>
export type WorkbookChoiceFormValues = z.infer<typeof workbookChoiceSchema>
export type WorkbookShortFieldFormValues = z.infer<typeof workbookShortFieldSchema>
export type SrsAnswerType = z.infer<typeof srsAnswerTypeSchema>

export const workbookMetadataFormSchema = z.object({
  title: requiredTrimmedString
    .min(1, { message: '문제집 제목을 입력해주세요.' })
    .max(120, { message: '제목은 120자 이내로 입력해주세요.' }),
  subject: z.enum(WORKBOOK_SUBJECTS),
  type: z.enum(WORKBOOK_TYPES),
  authorId: z.string().optional().transform((value) => value === '' ? undefined : value),
  weekLabel: optionalTrimmedString,
  tagsInput: optionalTrimmedString,
  description: optionalTrimmedString,
  srsSettings: srsSettingsSchema,
  pdfSettings: pdfSettingsSchema,
  writingSettings: writingSettingsSchema,
  filmSettings: filmSettingsSchema,
  lectureSettings: lectureSettingsSchema,
  imageSettings: imageSettingsSchema,
})

export type WorkbookMetadataFormValues = z.input<typeof workbookMetadataFormSchema>

export function parseTagsInput(tagsInput: string | undefined | null): string[] {
  if (!tagsInput) {
    return []
  }

  return tagsInput
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
}

const normalizeString = (value?: string | null) => {
  if (!value) {
    return undefined
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

export interface NormalizedWorkbookPayload {
  title: string
  subject: (typeof WORKBOOK_SUBJECTS)[number]
  type: (typeof WORKBOOK_TYPES)[number]
  authorId?: string
  weekLabel?: string
  tags: string[]
  description?: string
  config: {
    srs?: {
      allowMultipleCorrect: boolean
    }
    pdf?: {
      instructions?: string
    }
    writing?: {
      instructions?: string
      maxCharacters?: number
    }
    film?: {
      noteCount: number
      filters: {
        country?: string
        director?: string
        genre?: string
        subgenre?: string
      }
    }
    lecture?: {
      youtubeUrl?: string
      instructions?: string
    }
    image?: {
      instructions?: string
    }
  }
  items: Array<{
    prompt: string
    explanation?: string
    gradingCriteria?: {
      high: string
      mid: string
      low: string
    }
    answerType?: SrsAnswerType
    choices?: Array<{
      content: string
      isCorrect: boolean
    }>
    shortFields?: Array<{
      label?: string
      answer: string
    }>
    assets?: Array<NormalizedWorkbookAsset>
  }>
  assets: NormalizedWorkbookAssetPayload[]
}

export interface NormalizedWorkbookAsset {
  name: string
  mimeType?: string
  size: number
}

export interface NormalizedWorkbookAssetPayload extends NormalizedWorkbookAsset {
  bucket: string
  path: string
  itemPosition: number
  order: number
}

export function buildNormalizedWorkbookPayload(
  values: WorkbookFormValues,
  options?: {
    assets?: NormalizedWorkbookAssetPayload[]
  }
): NormalizedWorkbookPayload {
  const tags = parseTagsInput(values.tagsInput)

  const config: NormalizedWorkbookPayload['config'] = {}

  const assetsByPosition = new Map<number, NormalizedWorkbookAssetPayload[]>()
  const normalizedAssets = options?.assets ?? []

  normalizedAssets.forEach((asset) => {
    const next = assetsByPosition.get(asset.itemPosition) ?? []
    next.push(asset)
    assetsByPosition.set(asset.itemPosition, next)
  })

  switch (values.type) {
    case 'srs': {
      config.srs = {
        allowMultipleCorrect: values.srsSettings?.allowMultipleCorrect ?? true,
      }
      break
    }
    case 'pdf': {
      const instructions = normalizeString(values.pdfSettings?.instructions)
      if (instructions) {
        config.pdf = { instructions }
      }
      break
    }
    case 'writing': {
      const instructions = normalizeString(values.writingSettings?.instructions)
      const maxCharacters = values.writingSettings?.maxCharacters
        ? Number(values.writingSettings.maxCharacters)
        : undefined
      config.writing = {
        ...(instructions ? { instructions } : {}),
        ...(maxCharacters && maxCharacters > 0 ? { maxCharacters } : {}),
      }
      break
    }
    case 'film': {
      config.film = {
        noteCount: values.filmSettings?.noteCount ?? 1,
        filters: {
          country: normalizeString(values.filmSettings?.country),
          director: normalizeString(values.filmSettings?.director),
          genre: normalizeString(values.filmSettings?.genre),
          subgenre: normalizeString(values.filmSettings?.subgenre),
        },
      }
      break
    }
    case 'lecture': {
      const youtubeUrl = normalizeString(values.lectureSettings?.youtubeUrl)
      const instructions = normalizeString(values.lectureSettings?.instructions)
      config.lecture = {
        ...(youtubeUrl ? { youtubeUrl } : {}),
        ...(instructions ? { instructions } : {}),
      }
      break
    }
    case 'image': {
      const instructions = normalizeString(values.imageSettings?.instructions)
      if (instructions) {
        config.image = { instructions }
      }
      break
    }
    default:
      break
  }

  const normalizedItems = values.items.map((item, index) => {
    const position = index + 1
    const base: {
      prompt: string
      explanation?: string
      gradingCriteria?: { high: string; mid: string; low: string }
      answerType?: SrsAnswerType
      choices?: Array<{ content: string; isCorrect: boolean }>
      shortFields?: Array<{
        label?: string
        answer: string
      }>
      assets?: Array<NormalizedWorkbookAsset>
    } = {
      prompt: item.prompt.trim(),
    }

    const explanation = normalizeString(item.explanation)
    if (explanation) {
      base.explanation = explanation
    }

    if (item.gradingCriteria) {
      base.gradingCriteria = {
        high: item.gradingCriteria.high?.trim() ?? '',
        mid: item.gradingCriteria.mid?.trim() ?? '',
        low: item.gradingCriteria.low?.trim() ?? '',
      }
    }

    if (values.type === 'srs') {
      const answerType: SrsAnswerType = item.answerType ?? 'multiple_choice'
      base.answerType = answerType

      if (answerType === 'multiple_choice') {
        base.choices = (item.choices ?? []).map((choice) => ({
          content: choice.content.trim(),
          isCorrect: choice.isCorrect,
        }))
      } else if (answerType === 'short_answer') {
        base.shortFields = (item.shortFields ?? []).map((field) => ({
          label: normalizeString(field.label) ?? undefined,
          answer: field.answer.trim(),
        }))
      }
    }

    const assetsForItem = assetsByPosition.get(position) ?? []
    if (assetsForItem.length > 0) {
      base.assets = assetsForItem.map((asset) => ({
        name: asset.name,
        mimeType: asset.mimeType,
        size: asset.size,
      }))
    }

    return base
  })

  return {
    title: values.title.trim(),
    subject: values.subject,
    type: values.type,
    authorId: values.authorId || undefined,
    weekLabel: normalizeString(values.weekLabel),
    tags,
    description: normalizeString(values.description),
    config,
    items: normalizedItems,
    assets: normalizedAssets,
  }
}

export interface WorkbookMetadataPayload {
  title: string
  subject: (typeof WORKBOOK_SUBJECTS)[number]
  type: (typeof WORKBOOK_TYPES)[number]
  authorId?: string
  weekLabel?: string
  tags: string[]
  description?: string
  config: NormalizedWorkbookPayload['config']
}

export function buildWorkbookMetadataPayload(values: WorkbookMetadataFormValues): WorkbookMetadataPayload {
  const tags = parseTagsInput(values.tagsInput)

  const config: WorkbookMetadataPayload['config'] = {}

  switch (values.type) {
    case 'srs': {
      config.srs = {
        allowMultipleCorrect: values.srsSettings?.allowMultipleCorrect ?? true,
      }
      break
    }
    case 'pdf': {
      const instructions = normalizeString(values.pdfSettings?.instructions)
      if (instructions) {
        config.pdf = { instructions }
      }
      break
    }
    case 'writing': {
      const instructions = normalizeString(values.writingSettings?.instructions)
      const maxCharacters = values.writingSettings?.maxCharacters
        ? Number(values.writingSettings.maxCharacters)
        : undefined
      config.writing = {
        ...(instructions ? { instructions } : {}),
        ...(maxCharacters && maxCharacters > 0 ? { maxCharacters } : {}),
      }
      break
    }
    case 'film': {
      config.film = {
        noteCount: values.filmSettings?.noteCount ?? 1,
        filters: {
          country: normalizeString(values.filmSettings?.country),
          director: normalizeString(values.filmSettings?.director),
          genre: normalizeString(values.filmSettings?.genre),
          subgenre: normalizeString(values.filmSettings?.subgenre),
        },
      }
      break
    }
    case 'lecture': {
      const youtubeUrl = normalizeString(values.lectureSettings?.youtubeUrl)
      const instructions = normalizeString(values.lectureSettings?.instructions)
      config.lecture = {
        ...(youtubeUrl ? { youtubeUrl } : {}),
        ...(instructions ? { instructions } : {}),
      }
      break
    }
    case 'image': {
      const instructions = normalizeString(values.imageSettings?.instructions)
      if (instructions) {
        config.image = { instructions }
      }
      break
    }
    default:
      break
  }

  return {
    title: values.title.trim(),
    subject: values.subject,
    type: values.type,
    authorId: values.authorId || undefined,
    weekLabel: normalizeString(values.weekLabel),
    tags,
    description: normalizeString(values.description),
    config,
  }
}
