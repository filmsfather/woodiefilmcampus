import { z } from 'zod'

export const interviewUploadedMetaSchema = z.object({
  bucket: z.string().min(1),
  path: z.string().min(1),
  size: z.number().positive(),
  mimeType: z.string().min(1),
  originalName: z.string().min(1),
})

// 새 업로드(스토리지 메타) 또는 기존 media_asset 참조(세트 수정 시)
export const interviewQuestionImageSchema = z.union([
  z.object({ mediaAssetId: z.string().uuid() }),
  interviewUploadedMetaSchema,
])

export const interviewQuestionInputSchema = z.object({
  prompt: z.string().trim().min(1, '문항 내용을 입력해주세요.').max(4000),
  images: z.array(interviewQuestionImageSchema).max(10).default([]),
})

export const interviewReviewQuestionInputSchema = z.object({
  prompt: z.string().trim().min(1, '피드백 템플릿 문항 내용을 입력해주세요.').max(2000),
})

export const createInterviewSetSchema = z.object({
  title: z.string().trim().min(1, '세트 제목을 입력해주세요.').max(200),
  description: z.string().trim().max(2000).optional().nullable(),
  questions: z
    .array(interviewQuestionInputSchema)
    .min(1, '면접 문항을 1개 이상 추가해주세요.')
    .max(50),
  reviewQuestions: z
    .array(interviewReviewQuestionInputSchema)
    .min(1, '피드백 템플릿 문항을 1개 이상 추가해주세요.')
    .max(30),
})

export const updateInterviewSetSchema = createInterviewSetSchema.extend({
  setId: z.string().uuid(),
})

export const createInterviewSessionSchema = z
  .object({
    setId: z.string().uuid(),
    targetClassIds: z.array(z.string().uuid()).default([]),
    targetStudentIds: z.array(z.string().uuid()).default([]),
  })
  .superRefine((value, ctx) => {
    if (value.targetClassIds.length === 0 && value.targetStudentIds.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '반 또는 학생을 최소 1개 이상 선택해주세요.',
        path: ['targetClassIds'],
      })
    }
  })

export const completeInterviewRecordingSchema = z.object({
  attemptId: z.string().uuid(),
  video: interviewUploadedMetaSchema,
})

export const addInterviewReviewQuestionSchema = z.object({
  attemptId: z.string().uuid(),
  prompt: z.string().trim().min(1, '추가할 문항 내용을 입력해주세요.').max(2000),
})

export type CreateInterviewSetInput = z.infer<typeof createInterviewSetSchema>
export type UpdateInterviewSetInput = z.infer<typeof updateInterviewSetSchema>
export type CreateInterviewSessionInput = z.infer<typeof createInterviewSessionSchema>
export type CompleteInterviewRecordingInput = z.infer<typeof completeInterviewRecordingSchema>
export type AddInterviewReviewQuestionInput = z.infer<typeof addInterviewReviewQuestionSchema>
