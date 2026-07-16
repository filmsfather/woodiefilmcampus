import { z } from 'zod'

export const writingUploadedMetaSchema = z.object({
  bucket: z.string().min(1),
  path: z.string().min(1),
  size: z.number().positive(),
  mimeType: z.string().min(1),
  originalName: z.string().min(1),
})

// 새 업로드(스토리지 메타) 또는 기존 media_asset 참조(세트 수정 시)
export const writingQuestionImageSchema = z.union([
  z.object({ mediaAssetId: z.string().uuid() }),
  writingUploadedMetaSchema,
])

export const writingQuestionInputSchema = z.object({
  prompt: z.string().trim().min(1, '문항 내용을 입력해주세요.').max(4000),
  images: z.array(writingQuestionImageSchema).max(10).default([]),
})

export const writingReviewQuestionInputSchema = z.object({
  prompt: z.string().trim().min(1, '오답노트 템플릿 문항 내용을 입력해주세요.').max(2000),
})

export const createWritingSetSchema = z.object({
  title: z.string().trim().min(1, '세트 제목을 입력해주세요.').max(200),
  description: z.string().trim().max(2000).optional().nullable(),
  timeLimitMinutes: z
    .number()
    .int('제한시간은 분 단위 정수로 입력해주세요.')
    .min(5, '제한시간은 최소 5분입니다.')
    .max(600, '제한시간은 최대 600분입니다.'),
  questions: z
    .array(writingQuestionInputSchema)
    .min(1, '작문 문항을 1개 이상 추가해주세요.')
    .max(50),
  // 오답노트는 교사가 제출물을 검토한 뒤 구성하므로 템플릿 문항은 없어도 된다
  reviewQuestions: z.array(writingReviewQuestionInputSchema).max(30).default([]),
})

export const updateWritingSetSchema = createWritingSetSchema.extend({
  setId: z.string().uuid(),
})

export const createWritingSessionSchema = z
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

export const startWritingAttemptSchema = z.object({
  attemptId: z.string().uuid(),
})

export const submitWritingAttemptSchema = z.object({
  attemptId: z.string().uuid(),
  images: z
    .array(writingUploadedMetaSchema)
    .min(1, '원고 사진을 1장 이상 업로드해주세요.')
    .max(10, '원고 사진은 최대 10장까지 업로드할 수 있습니다.'),
})

export const issueWritingReviewTaskSchema = z.object({
  attemptId: z.string().uuid(),
  questions: z
    .array(writingReviewQuestionInputSchema)
    .min(1, '오답노트 문항을 1개 이상 추가해주세요.')
    .max(30),
})

export const addWritingReviewQuestionSchema = z.object({
  attemptId: z.string().uuid(),
  prompt: z.string().trim().min(1, '추가할 문항 내용을 입력해주세요.').max(2000),
})

export const retryWritingOcrSchema = z.object({
  attemptId: z.string().uuid(),
})

export type CreateWritingSetInput = z.infer<typeof createWritingSetSchema>
export type UpdateWritingSetInput = z.infer<typeof updateWritingSetSchema>
export type CreateWritingSessionInput = z.infer<typeof createWritingSessionSchema>
export type StartWritingAttemptInput = z.infer<typeof startWritingAttemptSchema>
export type SubmitWritingAttemptInput = z.infer<typeof submitWritingAttemptSchema>
export type IssueWritingReviewTaskInput = z.infer<typeof issueWritingReviewTaskSchema>
export type AddWritingReviewQuestionInput = z.infer<typeof addWritingReviewQuestionSchema>
export type RetryWritingOcrInput = z.infer<typeof retryWritingOcrSchema>
