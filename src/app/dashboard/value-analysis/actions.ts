"use server"

import { randomUUID } from "node:crypto"
import { revalidatePath } from "next/cache"
import { z } from "zod"

import { getAuthContext } from "@/lib/auth"
import { createClient as createServerSupabase } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { VALUE_ANALYSIS_BUCKET } from "@/lib/storage/buckets"
import { setValueAnalysisPostFeatured } from "@/lib/value-analysis"
import {
  valueAnalysisFeaturedSchema,
  genreCreateSchema,
} from "@/lib/validation/value-analysis"
import type { UploadedObjectMeta } from "@/lib/storage-upload"

type ActionResult = {
  success?: boolean
  error?: string
  id?: string
}

const MAX_UPLOAD_SIZE = 50 * 1024 * 1024

function sanitizeFileName(name: string) {
  if (!name) return "upload.pdf"
  return name.replace(/[^a-zA-Z0-9_.-]/g, "_")
}

function revalidateValueAnalysis(postId?: string) {
  revalidatePath("/dashboard/value-analysis")
  if (postId) {
    revalidatePath(`/dashboard/value-analysis/${postId}`)
  }
}

function parseUploadedMeta(value: FormDataEntryValue | null | undefined): UploadedObjectMeta | null {
  if (!value || typeof value !== "string" || value.trim().length === 0) {
    return null
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new Error("첨부 파일 정보를 확인하지 못했습니다.")
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("첨부 파일 정보 형식이 올바르지 않습니다.")
  }

  const record = parsed as Record<string, unknown>
  const bucket = typeof record.bucket === "string" ? record.bucket : null
  const path = typeof record.path === "string" ? record.path : null
  const size = typeof record.size === "number" ? record.size : Number(record.size)
  const mimeType = typeof record.mimeType === "string" ? record.mimeType : null
  const originalName = typeof record.originalName === "string" ? record.originalName : null

  if (!bucket || !path || !Number.isFinite(size) || !mimeType || !originalName) {
    throw new Error("첨부 파일 정보가 올바르지 않습니다.")
  }

  if (bucket !== VALUE_ANALYSIS_BUCKET) {
    throw new Error("허용되지 않은 저장소 경로가 감지되었습니다.")
  }

  if (size > MAX_UPLOAD_SIZE) {
    throw new Error("첨부 파일 용량 제한을 초과했습니다.")
  }

  return { bucket, path, size, mimeType, originalName }
}

// ── 게시물 CRUD ──

export async function createValueAnalysisPost(formData: FormData): Promise<ActionResult> {
  const { profile } = await getAuthContext()

  if (!profile) {
    return { error: "로그인이 필요합니다." }
  }

  const titleValue = formData.get("title")
  const descriptionValue = formData.get("description")
  const genreIdValue = formData.get("genreId")
  const uploadedMetaValue = formData.get("uploadedFile")

  if (typeof titleValue !== "string" || titleValue.trim().length === 0) {
    return { error: "제목을 입력해주세요." }
  }

  if (typeof genreIdValue !== "string" || genreIdValue.length === 0) {
    return { error: "장르를 선택해주세요." }
  }

  const title = titleValue.trim()
  if (title.length > 200) {
    return { error: "제목은 200자 이내로 입력해주세요." }
  }

  const description =
    typeof descriptionValue === "string" ? descriptionValue.trim() : ""

  let uploadedMeta: UploadedObjectMeta | null = null
  try {
    uploadedMeta = parseUploadedMeta(uploadedMetaValue)
  } catch (err) {
    return { error: err instanceof Error ? err.message : "파일 정보를 확인하지 못했습니다." }
  }

  if (!uploadedMeta) {
    return { error: "PDF 파일을 업로드해주세요." }
  }

  const supabase = await createServerSupabase()
  const postId = randomUUID()

  const sanitizedName = sanitizeFileName(uploadedMeta.originalName)
  const finalPath = `posts/${postId}/${randomUUID()}-${sanitizedName}`

  try {
    if (uploadedMeta.path !== finalPath) {
      const { error: moveError } = await supabase.storage
        .from(VALUE_ANALYSIS_BUCKET)
        .move(uploadedMeta.path, finalPath)
      if (moveError) {
        console.error("[value-analysis] failed to move file", moveError)
        throw new Error("파일을 이동하지 못했습니다.")
      }
    }

    const { data: mediaAsset, error: mediaError } = await supabase
      .from("media_assets")
      .insert({
        owner_id: profile.id,
        scope: "value_analysis",
        bucket: VALUE_ANALYSIS_BUCKET,
        path: finalPath,
        mime_type: uploadedMeta.mimeType,
        size: uploadedMeta.size,
        metadata: { originalName: sanitizedName },
      })
      .select("id")
      .single()

    if (mediaError || !mediaAsset?.id) {
      console.error("[value-analysis] failed to insert media asset", mediaError)
      await supabase.storage.from(VALUE_ANALYSIS_BUCKET).remove([finalPath])
      throw new Error("파일 정보를 저장하지 못했습니다.")
    }

    const { error: insertError } = await supabase
      .from("value_analysis_posts")
      .insert({
        id: postId,
        student_id: profile.id,
        class_id: profile.class_id || null,
        genre_id: genreIdValue,
        title,
        description: description || null,
        media_asset_id: mediaAsset.id as string,
      })

    if (insertError) {
      console.error("[value-analysis] failed to insert post", insertError)
      await supabase.storage.from(VALUE_ANALYSIS_BUCKET).remove([finalPath])
      await supabase.from("media_assets").delete().eq("id", mediaAsset.id)
      throw new Error("게시물을 저장하지 못했습니다.")
    }

    revalidateValueAnalysis(postId)
    return { success: true, id: postId }
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "게시물 등록 중 문제가 발생했습니다.",
    }
  }
}

export async function deleteValueAnalysisPost(postId: string): Promise<ActionResult> {
  const { profile } = await getAuthContext()

  if (!profile) {
    return { error: "로그인이 필요합니다." }
  }

  const supabase = await createServerSupabase()

  const { data: post, error: fetchError } = await supabase
    .from("value_analysis_posts")
    .select("id, student_id, media_asset_id")
    .eq("id", postId)
    .maybeSingle()

  if (fetchError) {
    console.error("[value-analysis] failed to load post for delete", fetchError)
    return { error: "게시물 정보를 불러오지 못했습니다." }
  }

  if (!post) {
    return { error: "게시물을 찾을 수 없습니다." }
  }

  const isOwner = post.student_id === profile.id
  const isAdmin = profile.role === "principal" || profile.role === "manager"
  if (!isOwner && !isAdmin) {
    return { error: "삭제 권한이 없습니다." }
  }

  if (post.media_asset_id) {
    const { data: asset } = await supabase
      .from("media_assets")
      .select("id, bucket, path")
      .eq("id", post.media_asset_id)
      .maybeSingle()

    if (asset?.path) {
      const bucketId = (asset.bucket as string) ?? VALUE_ANALYSIS_BUCKET
      await supabase.storage.from(bucketId).remove([asset.path])
    }

    if (asset?.id) {
      await supabase.from("media_assets").delete().eq("id", asset.id)
    }
  }

  const { error: deleteError } = await supabase
    .from("value_analysis_posts")
    .delete()
    .eq("id", postId)

  if (deleteError) {
    console.error("[value-analysis] failed to delete post", deleteError)
    return { error: "게시물 삭제에 실패했습니다." }
  }

  revalidateValueAnalysis()
  return { success: true }
}

// ── PDF 다운로드 URL 생성 ──

const downloadSchema = z.object({
  postId: z.string().uuid(),
})

export async function getValueAnalysisDownloadUrl(
  input: z.infer<typeof downloadSchema>
): Promise<{ success: true; url: string; filename: string } | { success: false; error: string }> {
  const parsed = downloadSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: "잘못된 요청입니다." }
  }

  const { profile } = await getAuthContext()
  if (!profile) {
    return { success: false, error: "로그인이 필요합니다." }
  }

  const admin = createAdminClient()

  const { data: post, error: postError } = await admin
    .from("value_analysis_posts")
    .select("id, media_asset_id")
    .eq("id", parsed.data.postId)
    .maybeSingle()

  if (postError || !post) {
    return { success: false, error: "게시물을 찾을 수 없습니다." }
  }

  if (!post.media_asset_id) {
    return { success: false, error: "첨부 파일이 없습니다." }
  }

  const { data: asset, error: assetError } = await admin
    .from("media_assets")
    .select("id, bucket, path, metadata")
    .eq("id", post.media_asset_id)
    .maybeSingle()

  if (assetError || !asset?.path) {
    return { success: false, error: "파일 정보를 가져오지 못했습니다." }
  }

  const bucketId = (asset.bucket as string) ?? VALUE_ANALYSIS_BUCKET

  const { data: signed, error: signedError } = await admin.storage
    .from(bucketId)
    .createSignedUrl(asset.path, 60 * 30)

  if (signedError || !signed?.signedUrl) {
    console.error("[value-analysis] failed to create signed url", signedError)
    return { success: false, error: "다운로드 URL 생성에 실패했습니다." }
  }

  const metadata = (asset.metadata as Record<string, unknown> | null) ?? null
  const possibleName =
    metadata?.originalName || metadata?.original_name || metadata?.filename
  const fallbackName = asset.path.split("/").pop() ?? "제출물.pdf"
  const filename =
    typeof possibleName === "string" && possibleName.length > 0
      ? possibleName
      : fallbackName

  return { success: true, url: signed.signedUrl, filename }
}

// ── 추천하기 (원장 전용) ──

export async function toggleValueAnalysisFeatured(
  input: z.infer<typeof valueAnalysisFeaturedSchema>
): Promise<ActionResult> {
  const parsed = valueAnalysisFeaturedSchema.safeParse(input)

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "잘못된 요청입니다.",
    }
  }

  const { profile } = await getAuthContext()

  if (!profile || !["principal", "manager"].includes(profile.role)) {
    return { error: "추천은 원장/실장만 가능합니다." }
  }

  const result = await setValueAnalysisPostFeatured({
    postId: parsed.data.postId,
    featured: parsed.data.featured,
    featuredBy: profile.id,
    comment: parsed.data.comment?.trim() ?? null,
  })

  if (result.success) {
    revalidateValueAnalysis(parsed.data.postId)
  }

  return result
}

// ── 장르 관리 (원장 전용) ──

export async function createGenre(
  input: z.infer<typeof genreCreateSchema>
): Promise<ActionResult> {
  const parsed = genreCreateSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "입력값이 올바르지 않습니다." }
  }

  const { profile } = await getAuthContext()
  if (!profile || profile.role !== "principal") {
    return { error: "원장만 장르를 추가할 수 있습니다." }
  }

  const supabase = await createServerSupabase()

  const { data: maxSort } = await supabase
    .from("value_analysis_genres")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle()

  const nextOrder = ((maxSort?.sort_order as number) ?? 0) + 1

  const { data, error } = await supabase
    .from("value_analysis_genres")
    .insert({
      name: parsed.data.name.trim(),
      sort_order: nextOrder,
    })
    .select("id")
    .single()

  if (error) {
    if (error.code === "23505") {
      return { error: "이미 존재하는 장르입니다." }
    }
    console.error("[value-analysis] create genre error", error)
    return { error: "장르 추가에 실패했습니다." }
  }

  revalidateValueAnalysis()
  return { success: true, id: data.id }
}

export async function deleteGenre(genreId: string): Promise<ActionResult> {
  const { profile } = await getAuthContext()
  if (!profile || profile.role !== "principal") {
    return { error: "원장만 장르를 삭제할 수 있습니다." }
  }

  if (!genreId) {
    return { error: "장르 정보를 확인할 수 없습니다." }
  }

  const supabase = await createServerSupabase()

  const { count } = await supabase
    .from("value_analysis_posts")
    .select("id", { count: "exact", head: true })
    .eq("genre_id", genreId)

  if (count && count > 0) {
    return { error: `이 장르를 사용하는 게시물이 ${count}건 있어 삭제할 수 없습니다.` }
  }

  const { error } = await supabase
    .from("value_analysis_genres")
    .delete()
    .eq("id", genreId)

  if (error) {
    console.error("[value-analysis] delete genre error", error)
    return { error: "장르 삭제에 실패했습니다." }
  }

  revalidateValueAnalysis()
  return { success: true }
}
