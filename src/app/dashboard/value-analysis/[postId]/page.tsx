import { notFound } from "next/navigation"

import DashboardBackLink from "@/components/dashboard/DashboardBackLink"
import { ValueAnalysisDetailClient } from "@/components/dashboard/value-analysis/ValueAnalysisDetailClient"
import { requireAuthForDashboard } from "@/lib/auth"
import { createClient as createServerSupabase } from "@/lib/supabase/server"

interface PageProps {
  params: Promise<{ postId: string }>
}

export default async function ValueAnalysisDetailPage(props: PageProps) {
  const { postId } = await props.params
  const { profile } = await requireAuthForDashboard([
    "student",
    "teacher",
    "manager",
    "principal",
  ])

  const supabase = await createServerSupabase()

  const { data: post, error } = await supabase
    .from("value_analysis_posts")
    .select(
      `
      id,
      title,
      description,
      student_id,
      class_id,
      genre_id,
      media_asset_id,
      is_featured,
      featured_by,
      featured_comment,
      featured_commented_at,
      created_at,
      student:profiles!value_analysis_posts_student_id_fkey(name),
      class:classes!value_analysis_posts_class_id_fkey(name),
      genre:value_analysis_genres!value_analysis_posts_genre_id_fkey(name)
    `
    )
    .eq("id", postId)
    .maybeSingle()

  if (error || !post) {
    notFound()
  }

  type PostRow = typeof post & {
    student: { name: string | null } | { name: string | null }[] | null
    class: { name: string | null } | { name: string | null }[] | null
    genre: { name: string | null } | { name: string | null }[] | null
  }

  const typedPost = post as PostRow
  const studentRel = Array.isArray(typedPost.student)
    ? typedPost.student[0]
    : typedPost.student
  const classRel = Array.isArray(typedPost.class)
    ? typedPost.class[0]
    : typedPost.class
  const genreRel = Array.isArray(typedPost.genre)
    ? typedPost.genre[0]
    : typedPost.genre

  const detail = {
    id: post.id as string,
    title: post.title as string,
    description: post.description as string | null,
    studentId: post.student_id as string,
    studentName: studentRel?.name ?? "이름 없음",
    className: classRel?.name ?? null,
    genreName: genreRel?.name ?? "미분류",
    mediaAssetId: post.media_asset_id as string | null,
    isFeatured: post.is_featured as boolean,
    featuredComment: post.featured_comment as string | null,
    featuredCommentedAt: post.featured_commented_at as string | null,
    createdAt: post.created_at as string,
  }

  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <DashboardBackLink
        fallbackHref="/dashboard/value-analysis"
        label="게시판으로 돌아가기"
      />

      <ValueAnalysisDetailClient
        post={detail}
        viewerId={profile.id}
        viewerRole={profile.role}
      />
    </section>
  )
}
