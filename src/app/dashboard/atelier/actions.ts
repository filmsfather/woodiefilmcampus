'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { getAuthContext } from '@/lib/auth'
import { deleteAtelierPost, setAtelierPostFeatured, setAtelierPostHidden } from '@/lib/atelier-posts'

const toggleHiddenSchema = z.object({
  postId: z.string().uuid('유효한 게시물 ID가 아닙니다.'),
  hidden: z.boolean(),
})

const toggleFeaturedSchema = z
  .object({
    postId: z.string().uuid('유효한 게시물 ID가 아닙니다.'),
    featured: z.boolean(),
    comment: z.string().trim().max(500, '코멘트는 500자 이하로 입력해주세요.').optional(),
  })
  .superRefine((value, ctx) => {
    if (value.featured) {
      const comment = value.comment?.trim() ?? ''
      if (comment.length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: '추천 코멘트를 입력해주세요.' })
      }
    }
  })

const deleteSchema = z.object({
  postId: z.string().uuid('유효한 게시물 ID가 아닙니다.'),
})

function revalidateAtelierPaths() {
  revalidatePath('/dashboard/student/atelier')
  revalidatePath('/dashboard/teacher/atelier')
}

export async function toggleAtelierHidden(input: z.infer<typeof toggleHiddenSchema>) {
  const parsed = toggleHiddenSchema.safeParse(input)

  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0]?.message ?? '잘못된 요청입니다.' }
  }

  const { profile } = await getAuthContext()

  if (!profile || profile.role !== 'student') {
    return { success: false as const, error: '학생 계정으로만 숨김을 변경할 수 있습니다.' }
  }

  const result = await setAtelierPostHidden({
    postId: parsed.data.postId,
    hidden: parsed.data.hidden,
    studentId: profile.id,
  })

  if (result.success) {
    revalidateAtelierPaths()
  }

  return result
}

export async function toggleAtelierFeatured(input: z.infer<typeof toggleFeaturedSchema>) {
  const parsed = toggleFeaturedSchema.safeParse(input)

  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0]?.message ?? '잘못된 요청입니다.' }
  }

  const { profile } = await getAuthContext()

  if (!profile || !['teacher', 'manager', 'principal'].includes(profile.role)) {
    return { success: false as const, error: '추천은 교직원만 가능합니다.' }
  }

  const result = await setAtelierPostFeatured({
    postId: parsed.data.postId,
    featured: parsed.data.featured,
    teacherId: profile.id,
    comment: parsed.data.comment?.trim() ?? null,
  })

  if (result.success) {
    revalidateAtelierPaths()
  }

  return result
}

export async function removeAtelierPost(input: z.infer<typeof deleteSchema>) {
  const parsed = deleteSchema.safeParse(input)

  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0]?.message ?? '잘못된 요청입니다.' }
  }

  const { profile } = await getAuthContext()

  if (!profile || !['teacher', 'manager', 'principal'].includes(profile.role)) {
    return { success: false as const, error: '삭제는 교직원만 가능합니다.' }
  }

  const result = await deleteAtelierPost({
    postId: parsed.data.postId,
    teacherId: profile.id,
  })

  if (result.success) {
    revalidateAtelierPaths()
  }

  return result
}
