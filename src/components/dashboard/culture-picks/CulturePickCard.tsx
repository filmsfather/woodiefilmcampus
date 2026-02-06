import Link from "next/link"
import { Book, Film, Music, MessageCircle } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"
import { AverageRating } from "./StarRating"
import {
  CULTURE_PICK_CATEGORY_LABELS,
  type CulturePickCategory,
} from "@/lib/validation/culture-pick"
import { cn } from "@/lib/utils"

interface CulturePickCardProps {
  id: string
  category: CulturePickCategory
  title: string
  creator: string
  coverUrl?: string | null
  averageRating: number
  reviewCount: number
  commentCount: number
  periodLabel: string
}

const categoryIcons: Record<CulturePickCategory, typeof Book> = {
  book: Book,
  movie: Film,
  music: Music,
}

export function CulturePickCard({
  id,
  category,
  title,
  creator,
  coverUrl,
  averageRating,
  reviewCount,
  commentCount,
}: CulturePickCardProps) {
  const Icon = categoryIcons[category]

  return (
    <Link href={`/dashboard/culture-picks/${id}`}>
      <Card className="group h-full overflow-hidden transition-all hover:shadow-md hover:border-slate-300">
        <CardContent className="p-0">
          {/* 커버 이미지 영역 */}
          <div className="relative aspect-[3/4] w-full overflow-hidden bg-gradient-to-br from-slate-100 to-slate-200">
            {coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={coverUrl}
                alt={title}
                className="h-full w-full object-cover transition-transform group-hover:scale-105"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <Icon className="h-16 w-16 text-slate-300" />
              </div>
            )}
            {/* 카테고리 뱃지 */}
            <div className="absolute left-2 top-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-1 text-xs font-medium text-slate-700 shadow-sm backdrop-blur-sm">
                <Icon className="h-3 w-3" />
                {CULTURE_PICK_CATEGORY_LABELS[category]}
              </span>
            </div>
          </div>

          {/* 콘텐츠 정보 */}
          <div className="space-y-2 p-3">
            <div>
              <h3 className="line-clamp-1 font-semibold text-slate-900 group-hover:text-primary">
                {title}
              </h3>
              <p className="line-clamp-1 text-sm text-slate-500">{creator}</p>
            </div>

            {/* 평점 및 댓글 수 */}
            <div className="flex items-center justify-between">
              <AverageRating average={averageRating} count={reviewCount} size="sm" />
              <div className="flex items-center gap-1 text-slate-500">
                <MessageCircle className="h-4 w-4" />
                <span className="text-xs">{commentCount}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}

interface CulturePickGridProps {
  children: React.ReactNode
  className?: string
}

export function CulturePickGrid({ children, className }: CulturePickGridProps) {
  return (
    <div
      className={cn(
        "grid gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5",
        className
      )}
    >
      {children}
    </div>
  )
}

