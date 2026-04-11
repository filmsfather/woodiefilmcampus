"use client"

import { useState, useTransition } from "react"
import type { FormEvent } from "react"
import { useRouter } from "next/navigation"
import { Download, Loader2, Sparkles, Star, Trash2 } from "lucide-react"

import type { UserRole } from "@/types/user"
import {
  toggleValueAnalysisFeatured,
  deleteValueAnalysisPost,
  getValueAnalysisDownloadUrl,
} from "@/app/dashboard/value-analysis/actions"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

interface PostDetail {
  id: string
  title: string
  description: string | null
  studentId: string
  studentName: string
  className: string | null
  genreName: string
  mediaAssetId: string | null
  isFeatured: boolean
  featuredComment: string | null
  featuredCommentedAt: string | null
  createdAt: string
}

interface Props {
  post: PostDetail
  viewerId: string
  viewerRole: UserRole
}

function formatDate(value: string) {
  try {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return "-"
    return date.toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
    })
  } catch {
    return "-"
  }
}

export function ValueAnalysisDetailClient({ post, viewerId, viewerRole }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)

  const [featureSheetOpen, setFeatureSheetOpen] = useState(false)
  const [featureComment, setFeatureComment] = useState(
    post.featuredComment ?? ""
  )

  const canManage = viewerRole === "principal" || viewerRole === "manager"
  const isOwner = post.studentId === viewerId

  const handleDownload = async () => {
    setDownloading(true)
    setError(null)
    try {
      const result = await getValueAnalysisDownloadUrl({ postId: post.id })
      if (!result.success) {
        setError(result.error)
        return
      }
      const newWindow = window.open(
        result.url,
        "_blank",
        "noopener,noreferrer"
      )
      if (!newWindow) {
        window.location.href = result.url
      }
    } catch {
      setError("파일을 다운로드하지 못했습니다.")
    } finally {
      setDownloading(false)
    }
  }

  const handleDelete = () => {
    if (!window.confirm("이 게시물을 삭제할까요?")) return
    setError(null)
    startTransition(async () => {
      const result = await deleteValueAnalysisPost(post.id)
      if (result.success) {
        router.push("/dashboard/value-analysis")
        router.refresh()
      } else {
        setError(result.error ?? "삭제에 실패했습니다.")
      }
    })
  }

  const handleFeatureSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const comment = featureComment.trim()
    if (!comment) {
      setError("추천 코멘트를 입력해주세요.")
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await toggleValueAnalysisFeatured({
        postId: post.id,
        featured: true,
        comment,
      })
      if (!result.success) {
        setError(result.error ?? "추천에 실패했습니다.")
      } else {
        setFeatureSheetOpen(false)
      }
      router.refresh()
    })
  }

  const handleUnfeature = () => {
    setError(null)
    startTransition(async () => {
      const result = await toggleValueAnalysisFeatured({
        postId: post.id,
        featured: false,
      })
      if (!result.success) {
        setError(result.error ?? "추천 해제에 실패했습니다.")
      }
      setFeatureSheetOpen(false)
      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-2">
              <h1 className="text-xl font-semibold text-slate-900">
                {post.title}
              </h1>
              <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
                <span className="font-medium">{post.studentName}</span>
                {post.className ? (
                  <>
                    <span className="text-slate-300">|</span>
                    <span>{post.className}</span>
                  </>
                ) : null}
                <span className="text-slate-300">|</span>
                <Badge variant="secondary">{post.genreName}</Badge>
                <span className="text-slate-300">|</span>
                <span>{formatDate(post.createdAt)}</span>
              </div>
            </div>

            {post.isFeatured ? (
              <Badge className="bg-amber-100 text-amber-800">
                <Sparkles className="mr-1 h-3 w-3" /> 추천
              </Badge>
            ) : null}
          </div>

          {post.description ? (
            <div className="whitespace-pre-wrap text-sm text-slate-700">
              {post.description}
            </div>
          ) : null}

          {post.isFeatured && post.featuredComment ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
              <p className="mb-1 text-xs font-medium text-amber-700">
                추천 코멘트
              </p>
              <p className="whitespace-pre-wrap text-sm text-amber-900">
                {post.featuredComment}
              </p>
              {post.featuredCommentedAt ? (
                <p className="mt-2 text-xs text-amber-600">
                  {formatDate(post.featuredCommentedAt)}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
            {post.mediaAssetId ? (
              <Button
                variant="outline"
                size="sm"
                disabled={downloading}
                onClick={handleDownload}
                className="gap-1"
              >
                {downloading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                <span>PDF 다운로드</span>
              </Button>
            ) : null}

            {canManage ? (
              <>
                <Button
                  variant={post.isFeatured ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setFeatureComment(post.featuredComment ?? "")
                    setFeatureSheetOpen(true)
                  }}
                  disabled={isPending}
                  className="gap-1"
                >
                  <Star
                    className={`h-4 w-4 ${post.isFeatured ? "fill-yellow-400 text-yellow-500" : ""}`}
                  />
                  <span>
                    {post.isFeatured ? "코멘트 수정" : "추천하기"}
                  </span>
                </Button>
                {post.isFeatured ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleUnfeature}
                    disabled={isPending}
                    className="gap-1"
                  >
                    <Star className="h-4 w-4" />
                    <span>추천 해제</span>
                  </Button>
                ) : null}
              </>
            ) : null}

            {(isOwner || canManage) ? (
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDelete}
                disabled={isPending}
                className="gap-1"
              >
                {isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                <span>삭제</span>
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      {/* 추천 코멘트 Sheet */}
      <Sheet
        open={featureSheetOpen}
        onOpenChange={(open) => (!open ? setFeatureSheetOpen(false) : undefined)}
      >
        <SheetContent
          side="bottom"
          className="mx-auto w-full max-w-xl rounded-t-lg border-t border-slate-200 bg-white pb-6"
        >
          <SheetHeader className="pb-0">
            <SheetTitle>
              {post.isFeatured ? "추천 코멘트 수정" : "추천 코멘트 작성"}
            </SheetTitle>
            <SheetDescription>
              {post.studentName} 학생의 제출물에 추천 코멘트를 남길 수 있습니다.
            </SheetDescription>
          </SheetHeader>

          <form
            onSubmit={handleFeatureSubmit}
            className="flex flex-col gap-4 px-4 pt-4"
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="va-detail-feature-comment">추천 코멘트</Label>
              <Textarea
                id="va-detail-feature-comment"
                value={featureComment}
                onChange={(e) => setFeatureComment(e.target.value)}
                placeholder="학생에게 전달할 메시지를 입력하세요."
                rows={5}
                disabled={isPending}
              />
            </div>

            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setFeatureSheetOpen(false)}
                disabled={isPending}
              >
                취소
              </Button>
              <Button
                type="submit"
                size="sm"
                className="gap-1"
                disabled={isPending || featureComment.trim().length === 0}
              >
                {isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                <span>
                  {post.isFeatured ? "코멘트 저장" : "추천하기"}
                </span>
              </Button>
            </div>

            {post.isFeatured ? (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleUnfeature}
                  disabled={isPending}
                >
                  <Star className="mr-1 h-4 w-4" />
                  추천 해제
                </Button>
              </div>
            ) : null}
          </form>
        </SheetContent>
      </Sheet>
    </div>
  )
}
