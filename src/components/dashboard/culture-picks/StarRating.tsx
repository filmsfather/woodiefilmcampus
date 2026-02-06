"use client"

import { Star } from "lucide-react"
import { cn } from "@/lib/utils"

interface StarRatingProps {
  value: number
  onChange?: (value: number) => void
  readonly?: boolean
  size?: "sm" | "md" | "lg"
  showValue?: boolean
}

const sizeClasses = {
  sm: "h-4 w-4",
  md: "h-5 w-5",
  lg: "h-6 w-6",
}

export function StarRating({
  value,
  onChange,
  readonly = false,
  size = "md",
  showValue = false,
}: StarRatingProps) {
  const stars = [1, 2, 3, 4, 5]

  return (
    <div className="flex items-center gap-1">
      {stars.map((star) => (
        <button
          key={star}
          type="button"
          disabled={readonly}
          onClick={() => onChange?.(star)}
          className={cn(
            "transition-colors",
            readonly ? "cursor-default" : "cursor-pointer hover:scale-110"
          )}
        >
          <Star
            className={cn(
              sizeClasses[size],
              star <= value
                ? "fill-amber-400 text-amber-400"
                : "fill-transparent text-slate-300"
            )}
          />
        </button>
      ))}
      {showValue && (
        <span className="ml-1 text-sm font-medium text-slate-600">{value.toFixed(1)}</span>
      )}
    </div>
  )
}

interface AverageRatingProps {
  average: number
  count: number
  size?: "sm" | "md"
}

export function AverageRating({ average, count, size = "md" }: AverageRatingProps) {
  return (
    <div className="flex items-center gap-1.5">
      <Star
        className={cn(
          size === "sm" ? "h-4 w-4" : "h-5 w-5",
          "fill-amber-400 text-amber-400"
        )}
      />
      <span className={cn("font-medium text-slate-700", size === "sm" ? "text-sm" : "text-base")}>
        {average > 0 ? average.toFixed(1) : "-"}
      </span>
      <span className={cn("text-slate-500", size === "sm" ? "text-xs" : "text-sm")}>
        ({count})
      </span>
    </div>
  )
}

