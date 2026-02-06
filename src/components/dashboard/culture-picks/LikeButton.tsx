"use client"

import { useState, useTransition } from "react"
import { Heart } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { toggleReviewLike } from "@/app/dashboard/culture-picks/actions"

interface LikeButtonProps {
  reviewId: string
  initialLiked: boolean
  initialCount: number
}

export function LikeButton({ reviewId, initialLiked, initialCount }: LikeButtonProps) {
  const [liked, setLiked] = useState(initialLiked)
  const [count, setCount] = useState(initialCount)
  const [isPending, startTransition] = useTransition()

  const handleClick = () => {
    // Optimistic update
    setLiked(!liked)
    setCount(liked ? count - 1 : count + 1)

    startTransition(async () => {
      const result = await toggleReviewLike(reviewId)
      if (!result.success) {
        // Rollback on error
        setLiked(liked)
        setCount(count)
      }
    })
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleClick}
      disabled={isPending}
      className={cn(
        "h-auto gap-1 px-2 py-1 text-sm",
        liked ? "text-rose-500 hover:text-rose-600" : "text-slate-500 hover:text-slate-700"
      )}
    >
      <Heart
        className={cn("h-4 w-4", liked && "fill-current")}
      />
      <span>{count}</span>
    </Button>
  )
}

