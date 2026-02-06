import Link from "next/link"
import { Plus, Book, Film, Music } from "lucide-react"

import DashboardBackLink from "@/components/dashboard/DashboardBackLink"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CulturePickCard, CulturePickGrid } from "@/components/dashboard/culture-picks/CulturePickCard"
import { requireAuthForDashboard } from "@/lib/auth"
import { createClient as createServerSupabase } from "@/lib/supabase/server"
import {
  CULTURE_PICK_CATEGORIES,
  CULTURE_PICK_CATEGORY_LABELS,
  type CulturePickCategory,
} from "@/lib/validation/culture-pick"

interface CulturePickWithStats {
  id: string
  category: CulturePickCategory
  title: string
  creator: string
  cover_url: string | null
  period_label: string
  created_at: string
  reviews: Array<{ rating: number; comments: Array<{ id: string }> }>
}

const categoryIcons = {
  book: Book,
  movie: Film,
  music: Music,
}

export default async function CulturePicksPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const searchParams = await props.searchParams
  const { profile } = await requireAuthForDashboard(["teacher", "manager", "principal", "student"])
  const supabase = await createServerSupabase()

  const activeTab = (
    typeof searchParams.tab === "string" && CULTURE_PICK_CATEGORIES.includes(searchParams.tab as CulturePickCategory)
      ? searchParams.tab
      : "book"
  ) as CulturePickCategory

  const isStaff = ["teacher", "manager", "principal"].includes(profile.role)

  // 모든 콘텐츠 가져오기
  const { data: picks, error } = await supabase
    .from("culture_picks")
    .select(`
      id,
      category,
      title,
      creator,
      cover_url,
      period_label,
      created_at,
      reviews:culture_pick_reviews(
        rating,
        comments:culture_pick_review_comments(id)
      )
    `)
    .order("created_at", { ascending: false })

  if (error) {
    console.error("[culture-picks] fetch error", error)
  }

  const allPicks = (picks ?? []) as unknown as CulturePickWithStats[]

  // 카테고리별 그룹화
  const picksByCategory = CULTURE_PICK_CATEGORIES.reduce((acc, category) => {
    acc[category] = allPicks.filter((p) => p.category === category)
    return acc
  }, {} as Record<CulturePickCategory, CulturePickWithStats[]>)

  // 기간별 그룹화 함수
  const groupByPeriod = (items: CulturePickWithStats[]) => {
    const grouped: Record<string, CulturePickWithStats[]> = {}
    for (const item of items) {
      const period = item.period_label
      if (!grouped[period]) {
        grouped[period] = []
      }
      grouped[period].push(item)
    }
    // 최신 기간 순으로 정렬
    return Object.entries(grouped).sort((a, b) => b[0].localeCompare(a[0]))
  }

  return (
    <section className="space-y-6">
      <div className="space-y-3">
        <DashboardBackLink
          fallbackHref={profile.role === "student" ? "/dashboard/student" : "/dashboard/teacher"}
          label="대시보드로 돌아가기"
        />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold text-slate-900">📚 Culture Picks</h1>
            <p className="text-sm text-slate-600">
              선생님들이 추천하는 책, 영화, 음악을 함께 감상하고 이야기해요
            </p>
          </div>
          {isStaff && (
            <Button asChild>
              <Link href="/dashboard/culture-picks/new">
                <Plus className="mr-1 h-4 w-4" />
                새 콘텐츠
              </Link>
            </Button>
          )}
        </div>
      </div>

      <Tabs defaultValue={activeTab} className="space-y-6">
        <TabsList className="grid w-full max-w-md grid-cols-3">
          {CULTURE_PICK_CATEGORIES.map((category) => {
            const Icon = categoryIcons[category]
            const count = picksByCategory[category].length
            return (
              <TabsTrigger key={category} value={category} asChild>
                <Link
                  href={`/dashboard/culture-picks?tab=${category}`}
                  className="flex items-center gap-1.5"
                >
                  <Icon className="h-4 w-4" />
                  <span>{CULTURE_PICK_CATEGORY_LABELS[category]}</span>
                  <span className="text-xs text-slate-500">({count})</span>
                </Link>
              </TabsTrigger>
            )
          })}
        </TabsList>

        {CULTURE_PICK_CATEGORIES.map((category) => {
          const categoryPicks = picksByCategory[category]
          const groupedPicks = groupByPeriod(categoryPicks)

          return (
            <TabsContent key={category} value={category} className="space-y-8">
              {groupedPicks.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 py-16">
                  <div className="text-4xl mb-3">
                    {category === "book" ? "📖" : category === "movie" ? "🎬" : "🎵"}
                  </div>
                  <p className="text-slate-500">
                    아직 등록된 {CULTURE_PICK_CATEGORY_LABELS[category]}이 없습니다.
                  </p>
                  {isStaff && (
                    <Button asChild className="mt-4" variant="outline">
                      <Link href="/dashboard/culture-picks/new">
                        <Plus className="mr-1 h-4 w-4" />첫 번째 {CULTURE_PICK_CATEGORY_LABELS[category]} 등록하기
                      </Link>
                    </Button>
                  )}
                </div>
              ) : (
                groupedPicks.map(([period, items]) => (
                  <div key={period} className="space-y-4">
                    <h2 className="text-lg font-semibold text-slate-800 border-b border-slate-200 pb-2">
                      {period}
                    </h2>
                    <CulturePickGrid>
                      {items.map((pick) => {
                        const reviews = pick.reviews ?? []
                        const avgRating =
                          reviews.length > 0
                            ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
                            : 0
                        const commentCount = reviews.reduce(
                          (sum, r) => sum + (r.comments?.length ?? 0),
                          0
                        )

                        return (
                          <CulturePickCard
                            key={pick.id}
                            id={pick.id}
                            category={pick.category}
                            title={pick.title}
                            creator={pick.creator}
                            coverUrl={pick.cover_url}
                            averageRating={avgRating}
                            reviewCount={reviews.length}
                            commentCount={commentCount}
                            periodLabel={pick.period_label}
                          />
                        )
                      })}
                    </CulturePickGrid>
                  </div>
                ))
              )}
            </TabsContent>
          )
        })}
      </Tabs>
    </section>
  )
}

