import { z } from 'zod'

export const interviewSheetUploadedMetaSchema = z.object({
  bucket: z.string().min(1),
  path: z.string().min(1),
  size: z.number().positive(),
  mimeType: z.string().min(1),
  originalName: z.string().min(1),
})

const templateItemInputSchema = z.object({
  prompt: z.string().trim().min(1, '질문 내용을 입력해주세요.').max(2000),
})

export const createInterviewSheetTemplateSchema = z.object({
  title: z.string().trim().min(1, '템플릿 제목을 입력해주세요.').max(200),
  description: z.string().trim().max(2000).optional().nullable(),
  isDefault: z.boolean().default(false),
  items: z
    .array(templateItemInputSchema)
    .min(1, '질문을 1개 이상 추가해주세요.')
    .max(100),
})

export const updateInterviewSheetTemplateSchema = createInterviewSheetTemplateSchema.extend({
  templateId: z.string().uuid(),
})

export const applyInterviewSheetTemplateSchema = z.object({
  studentId: z.string().uuid(),
  templateId: z.string().uuid(),
})

export const addInterviewSheetQuestionSchema = z.object({
  studentId: z.string().uuid(),
  prompt: z.string().trim().min(1, '질문 내용을 입력해주세요.').max(2000),
})

export const updateInterviewSheetItemSchema = z.object({
  itemId: z.string().uuid(),
  prompt: z.string().trim().min(1, '질문 내용을 입력해주세요.').max(2000).optional(),
  feedback: z.string().trim().max(4000).optional().nullable(),
})

export const deleteInterviewSheetItemSchema = z.object({
  itemId: z.string().uuid(),
})

export const addStudentQuestionSchema = z.object({
  prompt: z.string().trim().min(1, '질문 내용을 입력해주세요.').max(2000),
})

export const updateStudentItemSchema = z.object({
  itemId: z.string().uuid(),
  prompt: z.string().trim().min(1, '질문 내용을 입력해주세요.').max(2000).optional(),
  answer: z.string().trim().max(8000).optional().nullable(),
})

export const addInterviewSheetItemAssetSchema = z.object({
  itemId: z.string().uuid(),
  asset: z.union([
    z.object({
      kind: z.literal('file'),
      file: interviewSheetUploadedMetaSchema,
    }),
    z.object({
      kind: z.literal('link'),
      url: z.string().trim().url('올바른 링크 주소를 입력해주세요.').max(2000),
      title: z.string().trim().max(200).optional().nullable(),
    }),
  ]),
})

export const deleteInterviewSheetItemAssetSchema = z.object({
  assetId: z.string().uuid(),
})

export type CreateInterviewSheetTemplateInput = z.infer<typeof createInterviewSheetTemplateSchema>
export type UpdateInterviewSheetTemplateInput = z.infer<typeof updateInterviewSheetTemplateSchema>
export type ApplyInterviewSheetTemplateInput = z.infer<typeof applyInterviewSheetTemplateSchema>
export type AddInterviewSheetQuestionInput = z.infer<typeof addInterviewSheetQuestionSchema>
export type UpdateInterviewSheetItemInput = z.infer<typeof updateInterviewSheetItemSchema>
export type DeleteInterviewSheetItemInput = z.infer<typeof deleteInterviewSheetItemSchema>
export type AddStudentQuestionInput = z.infer<typeof addStudentQuestionSchema>
export type UpdateStudentItemInput = z.infer<typeof updateStudentItemSchema>
export type AddInterviewSheetItemAssetInput = z.infer<typeof addInterviewSheetItemAssetSchema>
export type DeleteInterviewSheetItemAssetInput = z.infer<typeof deleteInterviewSheetItemAssetSchema>
