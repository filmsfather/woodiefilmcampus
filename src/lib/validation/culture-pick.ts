import { z } from "zod"

// 카테고리
export const CULTURE_PICK_CATEGORIES = ["book", "movie", "music"] as const
export type CulturePickCategory = (typeof CULTURE_PICK_CATEGORIES)[number]

export const CULTURE_PICK_CATEGORY_LABELS: Record<CulturePickCategory, string> = {
  book: "책",
  movie: "영화",
  music: "음악",
}

export const CULTURE_PICK_CATEGORY_ICONS: Record<CulturePickCategory, string> = {
  book: "📖",
  movie: "🎬",
  music: "🎵",
}

// 콘텐츠 생성/수정 스키마
export const culturePickSchema = z.object({
  category: z.enum(CULTURE_PICK_CATEGORIES, {
    message: "카테고리를 선택해주세요.",
  }),
  title: z
    .string()
    .min(1, "제목을 입력해주세요.")
    .max(200, "제목은 200자 이내로 입력해주세요."),
  creator: z
    .string()
    .min(1, "저자/감독/아티스트를 입력해주세요.")
    .max(100, "저자/감독/아티스트는 100자 이내로 입력해주세요."),
  description: z
    .string()
    .max(2000, "추천 이유는 2000자 이내로 입력해주세요.")
    .optional()
    .nullable(),
  coverUrl: z
    .string()
    .url("올바른 URL을 입력해주세요.")
    .optional()
    .nullable()
    .or(z.literal("")),
  externalLink: z
    .string()
    .url("올바른 URL을 입력해주세요.")
    .optional()
    .nullable()
    .or(z.literal("")),
  periodLabel: z
    .string()
    .min(1, "기간을 선택해주세요.")
    .max(50, "기간은 50자 이내로 입력해주세요."),
})

export type CulturePickInput = z.infer<typeof culturePickSchema>

// 리뷰(한줄평) 스키마
export const culturePickReviewSchema = z.object({
  pickId: z.string().uuid("유효하지 않은 콘텐츠 ID입니다."),
  rating: z
    .number()
    .int()
    .min(1, "별점은 1점 이상이어야 합니다.")
    .max(5, "별점은 5점 이하여야 합니다."),
  comment: z
    .string()
    .max(500, "한줄평은 500자 이내로 입력해주세요.")
    .optional()
    .nullable(),
})

export type CulturePickReviewInput = z.infer<typeof culturePickReviewSchema>

// 댓글 스키마
export const culturePickReviewCommentSchema = z.object({
  reviewId: z.string().uuid("유효하지 않은 리뷰 ID입니다."),
  parentId: z.string().uuid("유효하지 않은 댓글 ID입니다.").optional().nullable(),
  body: z
    .string()
    .min(1, "댓글 내용을 입력해주세요.")
    .max(1000, "댓글은 1000자 이내로 입력해주세요."),
})

export type CulturePickReviewCommentInput = z.infer<typeof culturePickReviewCommentSchema>

// 기간 라벨 생성 헬퍼
export function generatePeriodLabel(date: Date = new Date()): string {
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  return `${year}년 ${month}월`
}

// 최근 기간 목록 생성 (현재 월 포함 6개월)
export function getRecentPeriodLabels(count: number = 6): string[] {
  const labels: string[] = []
  const now = new Date()

  for (let i = 0; i < count; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
    labels.push(generatePeriodLabel(date))
  }

  return labels
}

