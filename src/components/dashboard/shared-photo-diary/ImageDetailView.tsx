'use client'
/* eslint-disable @next/next/no-img-element */

import { useState, useTransition } from 'react'
import { Calendar, Heart, MessageCircle, Send, Trash2, User } from 'lucide-react'

import { toggleLike, addComment, deleteComment } from '@/app/dashboard/shared-photo-diary/actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import DateUtil from '@/lib/date-util'

interface Comment {
  id: string
  content: string
  createdAt: string
  user: {
    id: string
    name: string
  }
}

interface SubmissionInfo {
  studentName: string
  submittedAt: string
  prompt: string | null
  subject: string | null
}

interface ImageDetailViewProps {
  assetId: string
  url: string
  likeCount: number
  isLiked: boolean
  comments: Comment[]
  currentUserId: string
  submission: SubmissionInfo | null
}

export function ImageDetailView({
  assetId,
  url,
  likeCount: initialLikeCount,
  isLiked: initialIsLiked,
  comments,
  currentUserId,
  submission,
}: ImageDetailViewProps) {
  const [likeCount, setLikeCount] = useState(initialLikeCount)
  const [isLiked, setIsLiked] = useState(initialIsLiked)
  const [commentText, setCommentText] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [isLikePending, startLikeTransition] = useTransition()
  const [isCommentPending, startCommentTransition] = useTransition()
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null)

  const handleToggleLike = () => {
    // Optimistic update
    const wasLiked = isLiked
    setIsLiked(!wasLiked)
    setLikeCount((prev) => (wasLiked ? prev - 1 : prev + 1))

    startLikeTransition(async () => {
      const result = await toggleLike({ assetId })
      if (result.error) {
        // Revert on error
        setIsLiked(wasLiked)
        setLikeCount((prev) => (wasLiked ? prev + 1 : prev - 1))
        setMessage(result.error)
      }
    })
  }

  const handleAddComment = () => {
    if (!commentText.trim()) return

    startCommentTransition(async () => {
      const result = await addComment({ assetId, content: commentText.trim() })
      if (result.error) {
        setMessage(result.error)
      } else {
        setCommentText('')
        setMessage(null)
      }
    })
  }

  const handleDeleteComment = (commentId: string) => {
    if (!window.confirm('댓글을 삭제하시겠습니까?')) return

    setDeletingCommentId(commentId)
    startCommentTransition(async () => {
      const result = await deleteComment({ commentId })
      if (result.error) {
        setMessage(result.error)
      }
      setDeletingCommentId(null)
    })
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* 이미지 */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
        <img
          src={url}
          alt="공유된 사진"
          className="w-full object-contain"
          style={{ maxHeight: '70vh' }}
        />
      </div>

      {/* 제출 정보 */}
      {submission && (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-center gap-3">
            {submission.subject && (
              <Badge variant="secondary">{submission.subject}</Badge>
            )}
            <div className="flex items-center gap-1.5 text-sm text-slate-700">
              <User className="h-4 w-4 text-slate-400" />
              <span className="font-medium">{submission.studentName}</span>
            </div>
            <div className="flex items-center gap-1.5 text-sm text-slate-500">
              <Calendar className="h-4 w-4 text-slate-400" />
              <span>
                {DateUtil.formatForDisplay(submission.submittedAt, {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
          </div>
          {submission.prompt && (
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs font-medium text-slate-500">과제 문제</p>
              <p className="mt-1 whitespace-pre-line text-sm text-slate-700">
                {submission.prompt}
              </p>
            </div>
          )}
        </div>
      )}

      {/* 좋아요 & 댓글 카운트 */}
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={handleToggleLike}
          disabled={isLikePending}
          className="flex items-center gap-1.5 text-sm transition-colors hover:text-rose-500 disabled:opacity-50"
        >
          <Heart
            className={`h-5 w-5 transition-colors ${
              isLiked ? 'fill-rose-500 text-rose-500' : 'text-slate-500'
            }`}
          />
          <span className={isLiked ? 'font-medium text-rose-500' : 'text-slate-600'}>
            {likeCount}
          </span>
        </button>
        <div className="flex items-center gap-1.5 text-sm text-slate-500">
          <MessageCircle className="h-5 w-5" />
          <span>{comments.length}</span>
        </div>
      </div>

      {/* 에러 메시지 */}
      {message && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {message}
        </div>
      )}

      {/* 댓글 작성 */}
      <div className="space-y-2">
        <Textarea
          placeholder="댓글을 작성해주세요..."
          value={commentText}
          onChange={(e) => setCommentText(e.target.value)}
          rows={2}
          className="resize-none"
          disabled={isCommentPending}
        />
        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={handleAddComment}
            disabled={!commentText.trim() || isCommentPending}
            className="gap-1.5"
          >
            <Send className="h-4 w-4" />
            댓글 작성
          </Button>
        </div>
      </div>

      {/* 댓글 목록 */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-900">
          댓글 {comments.length}개
        </h2>
        {comments.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
            <p className="text-sm text-slate-500">아직 댓글이 없습니다.</p>
            <p className="mt-1 text-xs text-slate-400">첫 번째 댓글을 남겨보세요!</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {comments.map((comment) => (
              <li
                key={comment.id}
                className="group rounded-lg border border-slate-200 bg-white px-4 py-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-900">
                        {comment.user.name}
                      </span>
                      <span className="text-xs text-slate-400">
                        {DateUtil.formatForDisplay(comment.createdAt, {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                      {comment.content}
                    </p>
                  </div>
                  {comment.user.id === currentUserId && (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                      onClick={() => handleDeleteComment(comment.id)}
                      disabled={deletingCommentId === comment.id}
                    >
                      <Trash2 className="h-4 w-4 text-slate-400 hover:text-destructive" />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

