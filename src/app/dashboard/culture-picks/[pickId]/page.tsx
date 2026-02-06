import Link from "next/link"
import { notFound } from "next/navigation"
import { Book, Film, Music, ExternalLink, Pencil, Trash2 } from "lucide-react"

import DashboardBackLink from "@/components/dashboard/DashboardBackLink"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { AverageRating } from "@/components/dashboard/culture-picks/StarRating"
import { ReviewForm } from "@/components/dashboard/culture-picks/ReviewForm"
import { ReviewList } from "@/components/dashboard/culture-picks/ReviewItem"
import { requireAuthForDashboard } from "@/lib/auth"
import { createClient as createServerSupabase } from "@/lib/supabase/server"
import {
  CULTURE_PICK_CATEGORY_LABELS,
  type CulturePickCategory,
} from "@/lib/validation/culture-pick"
import { DeletePickButton } from "./DeletePickButton"

interface PageProps {
  params: Promise<{ pickId: string }>
}

const categoryIcons = {
  book: Book,
  movie: Film,
  music: Music,
}

export default async function CulturePickDetailPage({ params }: PageProps) {
  const { pickId } = await params
  const { profile } = await requireAuthForDashboard(["teacher", "manager", "principal", "student"])
  const supabase = await createServerSupabase()

  // 콘텐츠 정보 가져오기
  const { data: pickData, error: pickError } = await supabase
    .from("culture_picks")
    .select(`
      id,
      category,
      title,
      creator,
      description,
      cover_url,
      external_link,
      period_label,
      created_at,
      teacher_id,
      teacher:profiles!culture_picks_teacher_id_fkey(id, name, email, role)
    `)
    .eq("id", pickId)
    .single()

  if (pickError || !pickData) {
    console.error("[culture-picks] pick fetch error", pickError)
    notFound()
  }

  type TeacherInfo = { id: string; name: string | null; email: string | null; role: string }
  type PickRow = typeof pickData & {
    teacher: TeacherInfo | TeacherInfo[] | null
  }

  const pick = pickData as PickRow

  // 리뷰 가져오기
  const { data: reviewsData } = await supabase
    .from("culture_pick_reviews")
    .select(`
      id,
      rating,
      comment,
      created_at,
      user:profiles!culture_pick_reviews_user_id_fkey(id, name, role)
    `)
    .eq("pick_id", pickId)
    .order("created_at", { ascending: false })

  type ReviewRow = {
    id: string
    rating: number
    comment: string | null
    created_at: string
    user: { id: string; name: string | null; role: string } | { id: string; name: string | null; role: string }[] | null
  }

  const reviews = (reviewsData ?? []) as ReviewRow[]

  // 내 리뷰 찾기
  const myReview = reviews.find(
    (r) => (Array.isArray(r.user) ? r.user[0]?.id : r.user?.id) === profile.id
  )

  // 리뷰별 좋아요 수 가져오기
  const reviewIds = (reviews ?? []).map((r) => r.id)
  const { data: allLikes } = reviewIds.length > 0
    ? await supabase
        .from("culture_pick_review_likes")
        .select("review_id, user_id")
        .in("review_id", reviewIds)
    : { data: [] }

  // 리뷰별 댓글 가져오기
  const { data: allComments } = reviewIds.length > 0
    ? await supabase
        .from("culture_pick_review_comments")
        .select(`
          id,
          review_id,
          parent_id,
          body,
          created_at,
          user:profiles!culture_pick_review_comments_user_id_fkey(id, name, role)
        `)
        .in("review_id", reviewIds)
        .order("created_at", { ascending: true })
    : { data: [] }

  // 리뷰 데이터 가공
  const reviewsWithStats = (reviews ?? []).map((review) => {
    const user = Array.isArray(review.user) ? review.user[0] : review.user
    const likes = (allLikes ?? []).filter((l) => l.review_id === review.id)
    const comments = (allComments ?? [])
      .filter((c) => c.review_id === review.id)
      .map((c) => {
        const commentUser = Array.isArray(c.user) ? c.user[0] : c.user
        return {
          id: c.id,
          body: c.body,
          createdAt: c.created_at,
          parentId: c.parent_id,
          user: {
            id: commentUser?.id ?? "",
            name: commentUser?.name ?? null,
            role: commentUser?.role ?? "student",
          },
        }
      })

    return {
      id: review.id,
      rating: review.rating,
      comment: review.comment,
      createdAt: review.created_at,
      user: {
        id: user?.id ?? "",
        name: user?.name ?? null,
        role: user?.role ?? "student",
      },
      likeCount: likes.length,
      isLikedByMe: likes.some((l) => l.user_id === profile.id),
      comments,
    }
  })

  // 평균 평점 계산
  const avgRating =
    reviewsWithStats.length > 0
      ? reviewsWithStats.reduce((sum, r) => sum + r.rating, 0) / reviewsWithStats.length
      : 0

  const teacher = Array.isArray(pick.teacher) ? pick.teacher[0] : pick.teacher
  const teacherName = teacher?.name ?? teacher?.email ?? "선생님"
  const category = pick.category as CulturePickCategory
  const Icon = categoryIcons[category]

  const isStaff = ["teacher", "manager", "principal"].includes(profile.role)
  const canEdit = pick.teacher_id === profile.id || ["manager", "principal"].includes(profile.role)

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <DashboardBackLink
          fallbackHref="/dashboard/culture-picks"
          label="목록으로 돌아가기"
        />
        {canEdit && (
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={`/dashboard/culture-picks/${pickId}/edit`}>
                <Pencil className="mr-1 h-4 w-4" />
                수정
              </Link>
            </Button>
            <DeletePickButton pickId={pickId} />
          </div>
        )}
      </div>

      {/* 콘텐츠 정보 */}
      <div className="flex flex-col gap-6 sm:flex-row">
        {/* 커버 이미지 */}
        <div className="relative aspect-[3/4] w-full max-w-[200px] flex-shrink-0 overflow-hidden rounded-lg bg-gradient-to-br from-slate-100 to-slate-200 shadow-md">
          {pick.cover_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={pick.cover_url}
              alt={pick.title}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Icon className="h-16 w-16 text-slate-300" />
            </div>
          )}
        </div>

        {/* 정보 */}
        <div className="flex-1 space-y-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="secondary" className="gap-1">
                <Icon className="h-3 w-3" />
                {CULTURE_PICK_CATEGORY_LABELS[category]}
              </Badge>
              <Badge variant="outline">{pick.period_label}</Badge>
            </div>
            <h1 className="text-2xl font-bold text-slate-900">{pick.title}</h1>
            <p className="text-lg text-slate-600">{pick.creator}</p>
          </div>

          <AverageRating average={avgRating} count={reviewsWithStats.length} />

          {pick.description && (
            <div className="rounded-lg bg-amber-50 p-4 border border-amber-100">
              <p className="text-sm font-medium text-amber-800 mb-1">💡 추천 이유</p>
              <p className="text-slate-700 whitespace-pre-wrap">{pick.description}</p>
              <p className="text-sm text-slate-500 mt-2 text-right">— {teacherName}</p>
            </div>
          )}

          {pick.external_link && (
            <Button asChild variant="outline">
              <a href={pick.external_link} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-1 h-4 w-4" />
                외부 링크로 보기
              </a>
            </Button>
          )}
        </div>
      </div>

      {/* 구분선 */}
      <hr className="border-slate-200" />

      {/* 리뷰 작성 폼 */}
      <ReviewForm
        pickId={pickId}
        existingReview={myReview ? {
          id: myReview.id,
          rating: myReview.rating,
          comment: myReview.comment,
        } : null}
      />

      {/* 리뷰 목록 */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-800">
          💬 한줄평 {reviewsWithStats.length}개
        </h2>
        <ReviewList reviews={reviewsWithStats} currentUserId={profile.id} />
      </div>
    </section>
  )
}

