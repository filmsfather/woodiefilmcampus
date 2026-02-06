"use client"

import { useState, useTransition } from "react"
import { Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { StarRating } from "./StarRating"
import { upsertCulturePickReview } from "@/app/dashboard/culture-picks/actions"

interface ReviewFormProps {
  pickId: string
  existingReview?: {
    id: string
    rating: number
    comment: string | null
  } | null
}

export function ReviewForm({ pickId, existingReview }: ReviewFormProps) {
  const [rating, setRating] = useState(existingReview?.rating ?? 0)
  const [comment, setComment] = useState(existingReview?.comment ?? "")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (rating === 0) {
      setError("별점을 선택해주세요.")
      return
    }

    setError(null)

    startTransition(async () => {
      const result = await upsertCulturePickReview({
        pickId,
        rating,
        comment: comment.trim() || null,
      })

      if (!result.success) {
        setError(result.error ?? "저장에 실패했습니다.")
      }
    })
  }

  const isEditing = !!existingReview

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-700">
          {isEditing ? "내 한줄평 수정하기" : "📝 한줄평 남기기"}
        </label>
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-500">별점</span>
          <StarRating value={rating} onChange={setRating} size="lg" />
        </div>
      </div>

      <Textarea
        placeholder="감상평을 자유롭게 남겨주세요... (선택)"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={2}
        maxLength={500}
        className="resize-none"
      />

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-400">{comment.length}/500</span>
        <Button type="submit" disabled={isPending || rating === 0}>
          {isPending ? (
            <>
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              저장 중...
            </>
          ) : isEditing ? (
            "수정하기"
          ) : (
            "등록하기"
          )}
        </Button>
      </div>
    </form>
  )
}

