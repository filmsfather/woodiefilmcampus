"use server"

import { revalidatePath } from "next/cache"

import { getAuthContext } from "@/lib/auth"
import { createClient as createServerSupabase } from "@/lib/supabase/server"
import {
  culturePickSchema,
  culturePickReviewSchema,
  culturePickReviewCommentSchema,
  type CulturePickInput,
  type CulturePickReviewInput,
  type CulturePickReviewCommentInput,
} from "@/lib/validation/culture-pick"

interface ActionResult {
  success?: boolean
  error?: string
  id?: string
}

const CULTURE_PICKS_PATH = "/dashboard/culture-picks"

function revalidateCulturePicks(pickId?: string) {
  revalidatePath(CULTURE_PICKS_PATH)
  if (pickId) {
    revalidatePath(`${CULTURE_PICKS_PATH}/${pickId}`)
  }
}

// ========== 콘텐츠 CRUD ==========

export async function createCulturePick(input: CulturePickInput): Promise<ActionResult> {
  const auth = await getAuthContext()
  if (!auth?.profile) {
    return { error: "로그인이 필요합니다." }
  }

  if (!["teacher", "manager", "principal"].includes(auth.profile.role)) {
    return { error: "콘텐츠를 등록할 권한이 없습니다." }
  }

  const parsed = culturePickSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다." }
  }

  const supabase = await createServerSupabase()

  const { data, error } = await supabase
    .from("culture_picks")
    .insert({
      category: parsed.data.category,
      title: parsed.data.title,
      creator: parsed.data.creator,
      description: parsed.data.description || null,
      cover_url: parsed.data.coverUrl || null,
      external_link: parsed.data.externalLink || null,
      period_label: parsed.data.periodLabel,
      teacher_id: auth.profile.id,
    })
    .select("id")
    .single()

  if (error) {
    console.error("[culture-picks] create error", error)
    return { error: "콘텐츠 등록에 실패했습니다." }
  }

  revalidateCulturePicks()
  return { success: true, id: data.id }
}

export async function updateCulturePick(
  pickId: string,
  input: CulturePickInput
): Promise<ActionResult> {
  const auth = await getAuthContext()
  if (!auth?.profile) {
    return { error: "로그인이 필요합니다." }
  }

  const parsed = culturePickSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다." }
  }

  const supabase = await createServerSupabase()

  const { error } = await supabase
    .from("culture_picks")
    .update({
      category: parsed.data.category,
      title: parsed.data.title,
      creator: parsed.data.creator,
      description: parsed.data.description || null,
      cover_url: parsed.data.coverUrl || null,
      external_link: parsed.data.externalLink || null,
      period_label: parsed.data.periodLabel,
    })
    .eq("id", pickId)

  if (error) {
    console.error("[culture-picks] update error", error)
    return { error: "콘텐츠 수정에 실패했습니다." }
  }

  revalidateCulturePicks(pickId)
  return { success: true, id: pickId }
}

export async function deleteCulturePick(pickId: string): Promise<ActionResult> {
  const auth = await getAuthContext()
  if (!auth?.profile) {
    return { error: "로그인이 필요합니다." }
  }

  const supabase = await createServerSupabase()

  const { error } = await supabase.from("culture_picks").delete().eq("id", pickId)

  if (error) {
    console.error("[culture-picks] delete error", error)
    return { error: "콘텐츠 삭제에 실패했습니다." }
  }

  revalidateCulturePicks()
  return { success: true }
}

// ========== 리뷰 (별점/한줄평) ==========

export async function upsertCulturePickReview(
  input: CulturePickReviewInput
): Promise<ActionResult> {
  const auth = await getAuthContext()
  if (!auth?.profile) {
    return { error: "로그인이 필요합니다." }
  }

  const parsed = culturePickReviewSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다." }
  }

  const supabase = await createServerSupabase()

  // upsert: 이미 리뷰가 있으면 업데이트, 없으면 삽입
  const { data, error } = await supabase
    .from("culture_pick_reviews")
    .upsert(
      {
        pick_id: parsed.data.pickId,
        user_id: auth.profile.id,
        rating: parsed.data.rating,
        comment: parsed.data.comment || null,
      },
      {
        onConflict: "pick_id,user_id",
      }
    )
    .select("id")
    .single()

  if (error) {
    console.error("[culture-picks] review upsert error", error)
    return { error: "리뷰 저장에 실패했습니다." }
  }

  revalidateCulturePicks(parsed.data.pickId)
  return { success: true, id: data.id }
}

export async function deleteCulturePickReview(reviewId: string): Promise<ActionResult> {
  const auth = await getAuthContext()
  if (!auth?.profile) {
    return { error: "로그인이 필요합니다." }
  }

  const supabase = await createServerSupabase()

  // 먼저 리뷰 정보를 가져와서 pick_id 확인
  const { data: review } = await supabase
    .from("culture_pick_reviews")
    .select("pick_id")
    .eq("id", reviewId)
    .single()

  const { error } = await supabase
    .from("culture_pick_reviews")
    .delete()
    .eq("id", reviewId)
    .eq("user_id", auth.profile.id)

  if (error) {
    console.error("[culture-picks] review delete error", error)
    return { error: "리뷰 삭제에 실패했습니다." }
  }

  if (review?.pick_id) {
    revalidateCulturePicks(review.pick_id)
  }
  return { success: true }
}

// ========== 좋아요 ==========

export async function toggleReviewLike(reviewId: string): Promise<ActionResult> {
  const auth = await getAuthContext()
  if (!auth?.profile) {
    return { error: "로그인이 필요합니다." }
  }

  const supabase = await createServerSupabase()

  // 기존 좋아요 확인
  const { data: existing } = await supabase
    .from("culture_pick_review_likes")
    .select("id")
    .eq("review_id", reviewId)
    .eq("user_id", auth.profile.id)
    .maybeSingle()

  if (existing) {
    // 좋아요 취소
    const { error } = await supabase
      .from("culture_pick_review_likes")
      .delete()
      .eq("id", existing.id)

    if (error) {
      console.error("[culture-picks] unlike error", error)
      return { error: "좋아요 취소에 실패했습니다." }
    }
  } else {
    // 좋아요 추가
    const { error } = await supabase.from("culture_pick_review_likes").insert({
      review_id: reviewId,
      user_id: auth.profile.id,
    })

    if (error) {
      console.error("[culture-picks] like error", error)
      return { error: "좋아요에 실패했습니다." }
    }
  }

  // 리뷰의 pick_id를 가져와서 revalidate
  const { data: review } = await supabase
    .from("culture_pick_reviews")
    .select("pick_id")
    .eq("id", reviewId)
    .single()

  if (review?.pick_id) {
    revalidateCulturePicks(review.pick_id)
  }

  return { success: true }
}

// ========== 댓글 ==========

export async function createReviewComment(
  input: CulturePickReviewCommentInput
): Promise<ActionResult> {
  const auth = await getAuthContext()
  if (!auth?.profile) {
    return { error: "로그인이 필요합니다." }
  }

  const parsed = culturePickReviewCommentSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다." }
  }

  const supabase = await createServerSupabase()

  const { data, error } = await supabase
    .from("culture_pick_review_comments")
    .insert({
      review_id: parsed.data.reviewId,
      parent_id: parsed.data.parentId || null,
      user_id: auth.profile.id,
      body: parsed.data.body,
    })
    .select("id")
    .single()

  if (error) {
    console.error("[culture-picks] comment create error", error)
    return { error: "댓글 등록에 실패했습니다." }
  }

  // 리뷰의 pick_id를 가져와서 revalidate
  const { data: review } = await supabase
    .from("culture_pick_reviews")
    .select("pick_id")
    .eq("id", parsed.data.reviewId)
    .single()

  if (review?.pick_id) {
    revalidateCulturePicks(review.pick_id)
  }

  return { success: true, id: data.id }
}

export async function updateReviewComment(
  commentId: string,
  body: string
): Promise<ActionResult> {
  const auth = await getAuthContext()
  if (!auth?.profile) {
    return { error: "로그인이 필요합니다." }
  }

  if (!body || body.trim().length === 0) {
    return { error: "댓글 내용을 입력해주세요." }
  }

  if (body.length > 1000) {
    return { error: "댓글은 1000자 이내로 입력해주세요." }
  }

  const supabase = await createServerSupabase()

  const { error } = await supabase
    .from("culture_pick_review_comments")
    .update({ body })
    .eq("id", commentId)
    .eq("user_id", auth.profile.id)

  if (error) {
    console.error("[culture-picks] comment update error", error)
    return { error: "댓글 수정에 실패했습니다." }
  }

  revalidatePath(CULTURE_PICKS_PATH)
  return { success: true }
}

export async function deleteReviewComment(commentId: string): Promise<ActionResult> {
  const auth = await getAuthContext()
  if (!auth?.profile) {
    return { error: "로그인이 필요합니다." }
  }

  const supabase = await createServerSupabase()

  const { error } = await supabase
    .from("culture_pick_review_comments")
    .delete()
    .eq("id", commentId)
    .eq("user_id", auth.profile.id)

  if (error) {
    console.error("[culture-picks] comment delete error", error)
    return { error: "댓글 삭제에 실패했습니다." }
  }

  revalidatePath(CULTURE_PICKS_PATH)
  return { success: true }
}

