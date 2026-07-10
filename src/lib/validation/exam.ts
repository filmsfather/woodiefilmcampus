import { z } from 'zod'

export const uploadedMetaSchema = z.object({
  bucket: z.string().min(1),
  path: z.string().min(1),
  size: z.number().positive(),
  mimeType: z.string().min(1),
  originalName: z.string().min(1),
})

export const examReviewQuestionInputSchema = z.object({
  prompt: z.string().trim().min(1, '오답노트 문항 내용을 입력해주세요.').max(2000),
  requiresImage: z.boolean().default(false),
})

// 새 업로드(스토리지 메타) 또는 기존 media_asset 참조(세트 수정·복제 시)
export const examQuestionImageSchema = z.union([
  z.object({ mediaAssetId: z.string().uuid() }),
  uploadedMetaSchema,
])

export const examQuestionInputSchema = z.object({
  prompt: z.string().trim().min(1, '문항 내용을 입력해주세요.').max(4000),
  images: z.array(examQuestionImageSchema).max(10).default([]),
  reviewQuestions: z.array(examReviewQuestionInputSchema).max(30).default([]),
})

export const createExamSchema = z.object({
  title: z.string().trim().min(1, '시험 제목을 입력해주세요.').max(200),
  description: z.string().trim().max(2000).optional().nullable(),
  questions: z
    .array(examQuestionInputSchema)
    .min(1, '문항을 1개 이상 추가해주세요.')
    .max(50),
})

export const updateExamSchema = createExamSchema.extend({
  examId: z.string().uuid(),
})

export const createExamSessionSchema = z
  .object({
    examId: z.string().uuid(),
    classIds: z.array(z.string().uuid()).min(1, '대상 반을 1개 이상 선택해주세요.'),
    durationMinutes: z
      .number()
      .int()
      .min(1, '제한시간은 1분 이상이어야 합니다.')
      .max(24 * 60, '제한시간이 너무 깁니다.'),
    opensAt: z.string().datetime({ offset: true }),
    closesAt: z.string().datetime({ offset: true }),
  })
  .superRefine((value, ctx) => {
    if (new Date(value.closesAt) <= new Date(value.opensAt)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '응시 마감은 시작 시각 이후여야 합니다.',
        path: ['closesAt'],
      })
    }
  })

export const evaluateAttemptSchema = z
  .object({
    attemptId: z.string().uuid(),
    result: z.enum(['pass', 'nonpass']),
    reviewItems: z
      .array(
        z.object({
          examQuestionId: z.string().uuid().nullable().optional(),
          prompt: z.string().trim().min(1).max(2000),
          requiresImage: z.boolean().default(false),
        })
      )
      .max(100)
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (value.result === 'nonpass' && (!value.reviewItems || value.reviewItems.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '오답노트로 낼 문항을 1개 이상 선택하거나 추가해주세요.',
        path: ['reviewItems'],
      })
    }
  })

export const evaluateReviewTaskSchema = z.object({
  reviewTaskId: z.string().uuid(),
  items: z
    .array(
      z.object({
        itemId: z.string().uuid(),
        result: z.enum(['pass', 'nonpass']),
        feedback: z.string().trim().max(2000).optional().nullable(),
      })
    )
    .min(1),
})

export const submitExamAnswersSchema = z.object({
  attemptId: z.string().uuid(),
  submit: z.boolean().default(false),
  answers: z.array(
    z.object({
      questionId: z.string().uuid(),
      content: z.string().max(20000).default(''),
    })
  ),
})

export const submitReviewTaskSchema = z.object({
  reviewTaskId: z.string().uuid(),
  submit: z.boolean().default(false),
  items: z.array(
    z.object({
      itemId: z.string().uuid(),
      answerContent: z.string().max(20000).default(''),
    })
  ),
})

export const uploadReviewItemImageSchema = z.object({
  itemId: z.string().uuid(),
  file: uploadedMetaSchema,
  caption: z.string().trim().max(2000).optional().nullable(),
})

export const updateReviewItemImageCaptionSchema = z.object({
  assetLinkId: z.string().uuid(),
  caption: z.string().trim().max(2000),
})

export type CreateExamInput = z.infer<typeof createExamSchema>
export type UpdateExamInput = z.infer<typeof updateExamSchema>
export type CreateExamSessionInput = z.infer<typeof createExamSessionSchema>
export type EvaluateAttemptInput = z.infer<typeof evaluateAttemptSchema>
export type EvaluateReviewTaskInput = z.infer<typeof evaluateReviewTaskSchema>
export type SubmitExamAnswersInput = z.infer<typeof submitExamAnswersSchema>
export type SubmitReviewTaskInput = z.infer<typeof submitReviewTaskSchema>
export type UploadReviewItemImageInput = z.infer<typeof uploadReviewItemImageSchema>
