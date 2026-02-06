"use client"

import { useState, useTransition } from "react"
import { Trash2, Loader2 } from "lucide-react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { StarRating } from "./StarRating"
import { LikeButton } from "./LikeButton"
import { CommentThread } from "./CommentThread"
import { deleteCulturePickReview } from "@/app/dashboard/culture-picks/actions"

interface CommentData {
  id: string
  body: string
  createdAt: string
  parentId: string | null
  user: {
    id: string
    name: string | null
    role: string
  }
}

interface ReviewData {
  id: string
  rating: number
  comment: string | null
  createdAt: string
  user: {
    id: string
    name: string | null
    role: string
  }
  likeCount: number
  isLikedByMe: boolean
  comments: CommentData[]
}

interface ReviewItemProps {
  review: ReviewData
  currentUserId: string
}

export function ReviewItem({ review, currentUserId }: ReviewItemProps) {
  const [isDeleting, startDelete] = useTransition()

  const isOwner = review.user.id === currentUserId
  const roleLabel = review.user.role === "student" ? "학생" : "교사"
  const displayName = review.user.name || "익명"
  const initial = displayName.charAt(0)

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (minutes < 1) return "방금 전"
    if (minutes < 60) return `${minutes}분 전`
    if (hours < 24) return `${hours}시간 전`
    if (days < 7) return `${days}일 전`
    return date.toLocaleDateString("ko-KR", { month: "short", day: "numeric" })
  }

  const handleDelete = () => {
    if (!confirm("한줄평을 삭제하시겠습니까?")) return

    startDelete(async () => {
      await deleteCulturePickReview(review.id)
    })
  }

  // 댓글을 계층 구조로 변환
  const buildCommentTree = (comments: CommentData[]) => {
    const commentMap = new Map<string, CommentData & { replies?: CommentData[] }>()
    const topLevel: (CommentData & { replies?: CommentData[] })[] = []

    // 먼저 모든 댓글을 맵에 넣기
    comments.forEach((c) => {
      commentMap.set(c.id, { ...c, replies: [] })
    })

    // 부모-자식 관계 설정
    comments.forEach((c) => {
      const comment = commentMap.get(c.id)!
      if (c.parentId) {
        const parent = commentMap.get(c.parentId)
        if (parent) {
          parent.replies = parent.replies || []
          parent.replies.push(comment)
        } else {
          topLevel.push(comment)
        }
      } else {
        topLevel.push(comment)
      }
    })

    return topLevel
  }

  const commentTree = buildCommentTree(review.comments)

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
      {/* 헤더 */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10">
            <AvatarFallback className="bg-slate-100 text-slate-600">{initial}</AvatarFallback>
          </Avatar>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-slate-800">{displayName}</span>
              <span className="text-xs text-slate-400">({roleLabel})</span>
            </div>
            <div className="flex items-center gap-2">
              <StarRating value={review.rating} readonly size="sm" />
              <span className="text-xs text-slate-400">{formatDate(review.createdAt)}</span>
            </div>
          </div>
        </div>
        {isOwner && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={isDeleting}
            className="text-slate-400 hover:text-red-500 p-1"
          >
            {isDeleting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </button>
        )}
      </div>

      {/* 한줄평 내용 */}
      {review.comment && (
        <p className="text-slate-700 whitespace-pre-wrap">{review.comment}</p>
      )}

      {/* 좋아요 & 댓글 */}
      <div className="flex items-center gap-2 border-t border-slate-100 pt-3">
        <LikeButton
          reviewId={review.id}
          initialLiked={review.isLikedByMe}
          initialCount={review.likeCount}
        />
      </div>

      {/* 댓글 스레드 */}
      <CommentThread
        reviewId={review.id}
        comments={commentTree}
        currentUserId={currentUserId}
      />
    </div>
  )
}

interface ReviewListProps {
  reviews: ReviewData[]
  currentUserId: string
}

export function ReviewList({ reviews, currentUserId }: ReviewListProps) {
  if (reviews.length === 0) {
    return (
      <div className="text-center py-8 text-slate-500">
        아직 한줄평이 없습니다. 첫 번째 한줄평을 남겨보세요!
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {reviews.map((review) => (
        <ReviewItem key={review.id} review={review} currentUserId={currentUserId} />
      ))}
    </div>
  )
}

