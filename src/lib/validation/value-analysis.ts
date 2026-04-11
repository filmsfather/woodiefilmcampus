import { z } from "zod"

export const valueAnalysisPostSchema = z.object({
  title: z
    .string()
    .min(1, "제목을 입력해주세요.")
    .max(200, "제목은 200자 이내로 입력해주세요."),
  description: z
    .string()
    .max(2000, "설명은 2000자 이내로 입력해주세요.")
    .optional()
    .nullable(),
  genreId: z.string().uuid("장르를 선택해주세요."),
})

export type ValueAnalysisPostInput = z.infer<typeof valueAnalysisPostSchema>

export const valueAnalysisFeaturedSchema = z
  .object({
    postId: z.string().uuid("유효한 게시물 ID가 아닙니다."),
    featured: z.boolean(),
    comment: z
      .string()
      .trim()
      .max(500, "코멘트는 500자 이하로 입력해주세요.")
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (value.featured) {
      const comment = value.comment?.trim() ?? ""
      if (comment.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "추천 코멘트를 입력해주세요.",
        })
      }
    }
  })

export type ValueAnalysisFeaturedInput = z.infer<typeof valueAnalysisFeaturedSchema>

export const genreCreateSchema = z.object({
  name: z
    .string()
    .min(1, "장르 이름을 입력해주세요.")
    .max(50, "장르 이름은 50자 이내로 입력해주세요."),
})

export type GenreCreateInput = z.infer<typeof genreCreateSchema>
