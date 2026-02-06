"use client"

import { useState, useTransition } from "react"
import { CornerDownRight, Loader2, Trash2, MessageCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import {
  createReviewComment,
  deleteReviewComment,
} from "@/app/dashboard/culture-picks/actions"

interface CommentData {
  id: string
  body: string
  createdAt: string
  user: {
    id: string
    name: string | null
    role: string
  }
  replies?: CommentData[]
}

interface CommentThreadProps {
  reviewId: string
  comments: CommentData[]
  currentUserId: string
}

export function CommentThread({ reviewId, comments, currentUserId }: CommentThreadProps) {
  const [showForm, setShowForm] = useState(false)

  // 댓글을 부모-자식 구조로 정리
  const topLevelComments = comments.filter((c) => !c.replies)
  const commentMap = new Map<string, CommentData>()
  comments.forEach((c) => commentMap.set(c.id, c))

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setShowForm(!showForm)}
        className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
      >
        <MessageCircle className="h-4 w-4" />
        {showForm ? "닫기" : "댓글 달기"}
      </button>

      {showForm && (
        <CommentForm
          reviewId={reviewId}
          onSuccess={() => setShowForm(false)}
        />
      )}

      {topLevelComments.length > 0 && (
        <div className="space-y-2 border-l-2 border-slate-100 pl-3">
          {topLevelComments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              reviewId={reviewId}
              currentUserId={currentUserId}
              depth={0}
            />
          ))}
        </div>
      )}
    </div>
  )
}

interface CommentItemProps {
  comment: CommentData
  reviewId: string
  currentUserId: string
  depth: number
}

function CommentItem({ comment, reviewId, currentUserId, depth }: CommentItemProps) {
  const [showReplyForm, setShowReplyForm] = useState(false)
  const [isDeleting, startDelete] = useTransition()

  const isOwner = comment.user.id === currentUserId
  const roleLabel = comment.user.role === "student" ? "학생" : "교사"
  const displayName = comment.user.name || "익명"
  const initial = displayName.charAt(0)

  const handleDelete = () => {
    if (!confirm("댓글을 삭제하시겠습니까?")) return

    startDelete(async () => {
      await deleteReviewComment(comment.id)
    })
  }

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

  return (
    <div className={cn("space-y-2", depth > 0 && "ml-4")}>
      <div className="flex gap-2">
        <Avatar className="h-7 w-7 flex-shrink-0">
          <AvatarFallback className="text-xs bg-slate-100">{initial}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-slate-800">{displayName}</span>
            <span className="text-xs text-slate-400">({roleLabel})</span>
            <span className="text-xs text-slate-400">{formatDate(comment.createdAt)}</span>
          </div>
          <p className="text-sm text-slate-600 whitespace-pre-wrap break-words">{comment.body}</p>
          <div className="flex items-center gap-2 mt-1">
            {depth < 2 && (
              <button
                type="button"
                onClick={() => setShowReplyForm(!showReplyForm)}
                className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600"
              >
                <CornerDownRight className="h-3 w-3" />
                답글
              </button>
            )}
            {isOwner && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className="flex items-center gap-1 text-xs text-slate-400 hover:text-red-500"
              >
                {isDeleting ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Trash2 className="h-3 w-3" />
                )}
                삭제
              </button>
            )}
          </div>
        </div>
      </div>

      {showReplyForm && (
        <div className="ml-9">
          <CommentForm
            reviewId={reviewId}
            parentId={comment.id}
            onSuccess={() => setShowReplyForm(false)}
            placeholder="답글을 입력하세요..."
          />
        </div>
      )}

      {comment.replies && comment.replies.length > 0 && (
        <div className="space-y-2">
          {comment.replies.map((reply) => (
            <CommentItem
              key={reply.id}
              comment={reply}
              reviewId={reviewId}
              currentUserId={currentUserId}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  )
}

interface CommentFormProps {
  reviewId: string
  parentId?: string
  onSuccess?: () => void
  placeholder?: string
}

function CommentForm({ reviewId, parentId, onSuccess, placeholder = "댓글을 입력하세요..." }: CommentFormProps) {
  const [body, setBody] = useState("")
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!body.trim()) {
      setError("댓글 내용을 입력해주세요.")
      return
    }

    setError(null)

    startTransition(async () => {
      const result = await createReviewComment({
        reviewId,
        parentId: parentId || null,
        body: body.trim(),
      })

      if (result.success) {
        setBody("")
        onSuccess?.()
      } else {
        setError(result.error ?? "댓글 등록에 실패했습니다.")
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <Textarea
        placeholder={placeholder}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={2}
        maxLength={1000}
        className="resize-none text-sm"
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="submit" size="sm" disabled={isPending || !body.trim()}>
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            "등록"
          )}
        </Button>
      </div>
    </form>
  )
}

