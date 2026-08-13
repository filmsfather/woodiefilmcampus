import { z } from 'zod'

import { UNIVERSITY_PRESETS } from '@/lib/university-policy/presets/universities'

const timeLabel = z
  .string()
  .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, '시간은 HH:MM 형식으로 입력해주세요.')

// 대학 마스터가 코드 프리셋이라 DB에 FK를 걸 수 없다. 여기가 유일한 slug 검증 지점이다.
const UNIVERSITY_IDS = new Set(UNIVERSITY_PRESETS.map((preset) => preset.id))

const universityId = z
  .string()
  .trim()
  .refine((value) => UNIVERSITY_IDS.has(value), '대학을 선택해주세요.')

export const practiceUploadedMetaSchema = z.object({
  bucket: z.string().min(1),
  path: z.string().min(1),
  size: z.number().positive(),
  mimeType: z.string().min(1),
  originalName: z.string().min(1),
})

// 새 업로드(스토리지 메타) 또는 기존 media_asset 참조(문제 수정 시)
export const practiceProblemImageSchema = z.union([
  z.object({ mediaAssetId: z.string().uuid() }),
  practiceUploadedMetaSchema,
])

export const practiceProblemItemInputSchema = z.object({
  prompt: z.string().trim().min(1, '문항 내용을 입력해주세요.').max(4000),
})

export const practiceRubricItemInputSchema = z.object({
  label: z.string().trim().min(1, '채점 항목명을 입력해주세요.').max(100),
  maxScore: z
    .number()
    .positive('배점은 0보다 커야 합니다.')
    .max(1000, '배점은 최대 1000점입니다.'),
  description: z.string().trim().max(500).optional().nullable(),
})

export const createPracticeProblemSchema = z.object({
  universityId,
  practiceType: z.enum(['writing', 'interview']),
  title: z.string().trim().min(1, '문제 제목을 입력해주세요.').max(200),
  description: z.string().trim().max(4000).optional().nullable(),
  timeLimitMinutes: z
    .number()
    .int('제한시간은 분 단위 정수로 입력해주세요.')
    .min(5, '제한시간은 최소 5분입니다.')
    .max(600, '제한시간은 최대 600분입니다.'),
  orderIndex: z.number().int().min(0).max(9999).default(0),
  isActive: z.boolean().default(true),
  items: z
    .array(practiceProblemItemInputSchema)
    .min(1, '문항을 1개 이상 추가해주세요.')
    .max(30),
  images: z.array(practiceProblemImageSchema).max(10).default([]),
  rubricItems: z.array(practiceRubricItemInputSchema).max(20).default([]),
})

export const updatePracticeProblemSchema = createPracticeProblemSchema.extend({
  problemId: z.string().uuid(),
})

export const practiceProblemIdSchema = z.object({
  problemId: z.string().uuid(),
})

export const deletePracticeProblemSchema = practiceProblemIdSchema

export const togglePracticeProblemSchema = z.object({
  problemId: z.string().uuid(),
  isActive: z.boolean(),
})

// 슬롯 -------------------------------------------------------------------------------

export const createPracticeSlotBlockSchema = z
  .object({
    blockDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '날짜를 선택해주세요.'),
    startTime: timeLabel,
    endTime: timeLabel,
    slotMinutes: z.number().int().min(5).max(120).default(15),
    teacherIds: z.array(z.string().uuid()).min(1, '선생님을 1명 이상 선택해주세요.').max(30),
    /** 자유 예약 공개 시각 (KST 기준 로컬 datetime 문자열, 비우면 자유 예약 불가) */
    freeBookingOpensAt: z.string().trim().max(40).optional().nullable(),
    notes: z.string().trim().max(500).optional().nullable(),
  })
  .superRefine((value, ctx) => {
    if (value.endTime <= value.startTime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '종료 시각은 시작 시각보다 뒤여야 합니다.',
        path: ['endTime'],
      })
    }
  })

export const deletePracticeSlotBlockSchema = z.object({
  blockId: z.string().uuid(),
})

export const updatePracticeSlotStatusSchema = z.object({
  slotId: z.string().uuid(),
  status: z.enum(['open', 'closed']),
})

export const deletePracticeSlotSchema = z.object({
  slotId: z.string().uuid(),
})

// 예약 -------------------------------------------------------------------------------

export const createPracticeBookingSchema = z.object({
  slotId: z.string().uuid(),
  studentId: z.string().uuid('학생을 선택해주세요.'),
  universityId,
  practiceType: z.enum(['writing', 'interview']),
})

export const createFreePracticeBookingSchema = z.object({
  slotId: z.string().uuid(),
  universityId,
  practiceType: z.enum(['writing', 'interview']),
})

export const cancelPracticeBookingSchema = z.object({
  bookingId: z.string().uuid(),
})

export const updatePracticeBookingStatusSchema = z.object({
  bookingId: z.string().uuid(),
  status: z.enum(['completed', 'no_show', 'reserved']),
})

// 응시 -------------------------------------------------------------------------------

export const openPracticeAttemptSchema = z.object({
  attemptId: z.string().uuid(),
})

export const submitPracticeWritingSchema = z.object({
  attemptId: z.string().uuid(),
  images: z
    .array(practiceUploadedMetaSchema)
    .min(1, '원고 사진을 1장 이상 업로드해주세요.')
    .max(10, '원고 사진은 최대 10장까지 업로드할 수 있습니다.'),
})

export const savePracticeInterviewAnswersSchema = z.object({
  attemptId: z.string().uuid(),
  answers: z.record(z.string().uuid(), z.string().max(20000)),
})

export const submitPracticeInterviewSchema = savePracticeInterviewAnswersSchema

export const retryPracticeOcrSchema = z.object({
  attemptId: z.string().uuid(),
})

export const markPracticeAttemptMissedSchema = z.object({
  attemptId: z.string().uuid(),
})

// 녹화 / 피드백 -------------------------------------------------------------------------

export const completePracticeRecordingSchema = z.object({
  attemptId: z.string().uuid(),
  video: practiceUploadedMetaSchema,
})

export const savePracticeFeedbackSchema = z.object({
  attemptId: z.string().uuid(),
  feedbackText: z.string().trim().max(20000).optional().nullable(),
  comment: z.string().trim().max(10000).optional().nullable(),
  scores: z
    .array(
      z.object({
        rubricItemId: z.string().uuid(),
        score: z.number().min(0).max(1000),
        note: z.string().trim().max(500).optional().nullable(),
      })
    )
    .max(20)
    .default([]),
  /** true면 응시 상태를 feedback_done으로 확정한다. */
  finalize: z.boolean().default(false),
})

export type CreatePracticeProblemInput = z.infer<typeof createPracticeProblemSchema>
export type UpdatePracticeProblemInput = z.infer<typeof updatePracticeProblemSchema>
export type CreatePracticeSlotBlockInput = z.infer<typeof createPracticeSlotBlockSchema>
export type CreatePracticeBookingInput = z.infer<typeof createPracticeBookingSchema>
export type CreateFreePracticeBookingInput = z.infer<typeof createFreePracticeBookingSchema>
export type SubmitPracticeWritingInput = z.infer<typeof submitPracticeWritingSchema>
export type SavePracticeInterviewAnswersInput = z.infer<typeof savePracticeInterviewAnswersSchema>
export type CompletePracticeRecordingInput = z.infer<typeof completePracticeRecordingSchema>
export type SavePracticeFeedbackInput = z.infer<typeof savePracticeFeedbackSchema>
