'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { createClient as createServerSupabase } from '@/lib/supabase/server'

const toggleLikeSchema = z.object({
  assetId: z.string().uuid(),
})

const addCommentSchema = z.object({
  assetId: z.string().uuid(),
  content: z.string().min(1).max(500),
})

const deleteCommentSchema = z.object({
  commentId: z.string().uuid(),
})

export async function toggleLike(input: z.infer<typeof toggleLikeSchema>) {
  const supabase = await createServerSupabase()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: '로그인이 필요합니다.' }
  }

  const parsed = toggleLikeSchema.safeParse(input)
  if (!parsed.success) {
    return { error: '잘못된 요청입니다.' }
  }

  const { assetId } = parsed.data

  // 기존 좋아요 확인
  const { data: existing } = await supabase
    .from('photo_diary_likes')
    .select('id')
    .eq('media_asset_id', assetId)
    .eq('user_id', user.id)
    .single()

  if (existing) {
    // 좋아요 취소
    const { error } = await supabase
      .from('photo_diary_likes')
      .delete()
      .eq('id', existing.id)

    if (error) {
      console.error('[toggleLike] delete error:', error)
      return { error: '좋아요 취소에 실패했습니다.' }
    }

    revalidatePath(`/dashboard/shared-photo-diary/${assetId}`)
    return { success: true, liked: false }
  } else {
    // 좋아요 추가
    const { error } = await supabase.from('photo_diary_likes').insert({
      media_asset_id: assetId,
      user_id: user.id,
    })

    if (error) {
      console.error('[toggleLike] insert error:', error)
      return { error: '좋아요에 실패했습니다.' }
    }

    revalidatePath(`/dashboard/shared-photo-diary/${assetId}`)
    return { success: true, liked: true }
  }
}

export async function addComment(input: z.infer<typeof addCommentSchema>) {
  const supabase = await createServerSupabase()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: '로그인이 필요합니다.' }
  }

  const parsed = addCommentSchema.safeParse(input)
  if (!parsed.success) {
    return { error: '댓글 내용을 입력해주세요.' }
  }

  const { assetId, content } = parsed.data

  const { error } = await supabase.from('photo_diary_comments').insert({
    media_asset_id: assetId,
    user_id: user.id,
    content: content.trim(),
  })

  if (error) {
    console.error('[addComment] insert error:', error)
    return { error: '댓글 작성에 실패했습니다.' }
  }

  revalidatePath(`/dashboard/shared-photo-diary/${assetId}`)
  return { success: true }
}

export async function deleteComment(input: z.infer<typeof deleteCommentSchema>) {
  const supabase = await createServerSupabase()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: '로그인이 필요합니다.' }
  }

  const parsed = deleteCommentSchema.safeParse(input)
  if (!parsed.success) {
    return { error: '잘못된 요청입니다.' }
  }

  const { commentId } = parsed.data

  // 댓글 정보 조회 (본인 확인 + assetId 조회)
  const { data: comment } = await supabase
    .from('photo_diary_comments')
    .select('id, user_id, media_asset_id')
    .eq('id', commentId)
    .single()

  if (!comment) {
    return { error: '댓글을 찾을 수 없습니다.' }
  }

  if (comment.user_id !== user.id) {
    return { error: '본인의 댓글만 삭제할 수 있습니다.' }
  }

  const { error } = await supabase
    .from('photo_diary_comments')
    .delete()
    .eq('id', commentId)

  if (error) {
    console.error('[deleteComment] delete error:', error)
    return { error: '댓글 삭제에 실패했습니다.' }
  }

  revalidatePath(`/dashboard/shared-photo-diary/${comment.media_asset_id}`)
  return { success: true }
}

