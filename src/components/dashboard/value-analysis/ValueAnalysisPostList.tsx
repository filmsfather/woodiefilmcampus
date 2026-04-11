"use client"

import { useState, useTransition } from "react"
import type { FormEvent } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Download, Loader2, Sparkles, Star, Trash2 } from "lucide-react"

import type { ValueAnalysisPostListItem } from "@/lib/value-analysis"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

interface ValueAnalysisPostListProps {
  items: ValueAnalysisPostListItem[]
  viewerId: string
  viewerRole: UserRole
}

function formatDateTime(value: string) {
  try {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return "-"
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, "0")
    const day = String(date.getDate()).padStart(2, "0")
    return `${year}.${month}.${day}`
  } catch {
    return "-"
  }
}

export function ValueAnalysisPostList({
  items,
  viewerId,
  viewerRole,
}: ValueAnalysisPostListProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [pendingPostId, setPendingPostId] = useState<string | null>(null)
  const [downloadingPostId, setDownloadingPostId] = useState<string | null>(null)

  const [featureDialogState, setFeatureDialogState] = useState<{
    item: ValueAnalysisPostListItem
    mode: "add" | "edit"
  } | null>(null)
  const [featureComment, setFeatureComment] = useState("")
  const [viewCommentItem, setViewCommentItem] =
    useState<ValueAnalysisPostListItem | null>(null)

  const canManage =
    viewerRole === "principal" || viewerRole === "manager"

  const openFeatureDialog = (
    item: ValueAnalysisPostListItem,
    mode: "add" | "edit"
  ) => {
    setFeatureDialogState({ item, mode })
    setFeatureComment(item.featuredComment ?? "")
    setErrorMessage(null)
  }

  const closeFeatureDialog = () => {
    setFeatureDialogState(null)
    setFeatureComment("")
  }

  const handleFeatureSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!featureDialogState) return

    const comment = featureComment.trim()
    if (!comment) {
      setErrorMessage("추천 코멘트를 입력해주세요.")
      return
    }

    const { item } = featureDialogState
    setPendingPostId(item.id)
    setErrorMessage(null)
    startTransition(async () => {
      const result = await toggleValueAnalysisFeatured({
        postId: item.id,
        featured: true,
        comment,
      })
      if (!result.success) {
        setErrorMessage(result.error ?? "추천에 실패했습니다.")
      } else {
        closeFeatureDialog()
      }
      setPendingPostId(null)
      router.refresh()
    })
  }

  const handleUnfeature = (postId: string) => {
    setPendingPostId(postId)
    setErrorMessage(null)
    startTransition(async () => {
      const result = await toggleValueAnalysisFeatured({
        postId,
        featured: false,
      })
      if (!result.success) {
        setErrorMessage(result.error ?? "추천 해제에 실패했습니다.")
      }
      setPendingPostId(null)
      closeFeatureDialog()
      router.refresh()
    })
  }

  const handleDelete = (postId: string) => {
    if (!window.confirm("이 게시물을 삭제할까요?")) return

    setPendingPostId(postId)
    setErrorMessage(null)
    startTransition(async () => {
      const result = await deleteValueAnalysisPost(postId)
      if (!result.success) {
        setErrorMessage(result.error ?? "삭제에 실패했습니다.")
      }
      setPendingPostId(null)
      router.refresh()
    })
  }

  const handleDownload = async (postId: string) => {
    setDownloadingPostId(postId)
    setErrorMessage(null)
    try {
      const result = await getValueAnalysisDownloadUrl({ postId })
      if (!result.success) {
        setErrorMessage(result.error)
        return
      }
      const newWindow = window.open(result.url, "_blank", "noopener,noreferrer")
      if (!newWindow) {
        window.location.href = result.url
      }
    } catch {
      setErrorMessage("파일을 다운로드하지 못했습니다.")
    } finally {
      setDownloadingPostId(null)
    }
  }

  const isFeatureFormPending =
    Boolean(featureDialogState) &&
    isPending &&
    pendingPostId === featureDialogState?.item.id

  return (
    <div className="space-y-4">
      {errorMessage && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>이름</TableHead>
              <TableHead>반</TableHead>
              <TableHead>장르</TableHead>
              <TableHead>제목</TableHead>
              <TableHead>등록일</TableHead>
              <TableHead className="text-center">상태</TableHead>
              <TableHead>작업</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="py-10 text-center text-sm text-slate-500"
                >
                  표시할 게시물이 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              items.map((item) => {
                const isOwner = item.studentId === viewerId
                const isDownloading = downloadingPostId === item.id
                const isRowPending = isPending && pendingPostId === item.id

                return (
                  <TableRow key={item.id}>
                    <TableCell className="text-sm text-slate-700">
                      <div className="flex flex-col gap-1">
                        <span className="font-medium text-slate-900">
                          {item.studentName}
                        </span>
                        {isOwner ? (
                          <Badge variant="outline">내 제출</Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">
                      {item.className ?? (
                        <span className="text-slate-400">미지정</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">
                      <Badge variant="secondary">{item.genreName}</Badge>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-sm text-slate-700">
                      <Link
                        href={`/dashboard/value-analysis/${item.id}`}
                        className="hover:text-blue-600 hover:underline"
                      >
                        {item.title}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">
                      {formatDateTime(item.createdAt)}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex flex-col items-center gap-1 text-xs">
                        {item.isFeatured ? (
                          canManage ? (
                            <Badge className="bg-amber-100 text-amber-800">
                              <Sparkles className="mr-1 h-3 w-3" /> 추천
                            </Badge>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="gap-1"
                              onClick={() => setViewCommentItem(item)}
                            >
                              <Sparkles className="h-4 w-4" />
                              <span>추천</span>
                            </Button>
                          )
                        ) : null}
                        {item.mediaAssetId ? (
                          <Badge variant="outline" className="text-slate-500">
                            PDF
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-red-500">
                            파일 없음
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        {item.mediaAssetId ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isDownloading}
                            onClick={() => handleDownload(item.id)}
                            className="gap-1"
                          >
                            {isDownloading ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Download className="h-4 w-4" />
                            )}
                            <span>PDF</span>
                          </Button>
                        ) : null}

                        {canManage ? (
                          <>
                            <Button
                              size="sm"
                              variant={item.isFeatured ? "default" : "outline"}
                              onClick={() =>
                                openFeatureDialog(
                                  item,
                                  item.isFeatured ? "edit" : "add"
                                )
                              }
                              disabled={isRowPending}
                              className="gap-1"
                            >
                              <Star
                                className={`h-4 w-4 ${item.isFeatured ? "fill-yellow-400 text-yellow-500" : ""}`}
                              />
                              <span>
                                {item.isFeatured ? "코멘트 수정" : "추천하기"}
                              </span>
                            </Button>
                            {item.isFeatured ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleUnfeature(item.id)}
                                disabled={isRowPending}
                                className="gap-1"
                              >
                                {isRowPending ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Star className="h-4 w-4" />
                                )}
                                <span>추천 해제</span>
                              </Button>
                            ) : null}
                          </>
                        ) : null}

                        {(isOwner || canManage) ? (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleDelete(item.id)}
                            disabled={isRowPending}
                            className="gap-1"
                          >
                            {isRowPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                            <span>삭제</span>
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* 추천 코멘트 작성/수정 Sheet */}
      <Sheet
        open={featureDialogState !== null}
        onOpenChange={(open) => (!open ? closeFeatureDialog() : undefined)}
      >
        <SheetContent
          side="bottom"
          className="mx-auto w-full max-w-xl rounded-t-lg border-t border-slate-200 bg-white pb-6"
        >
          <SheetHeader className="pb-0">
            <SheetTitle>
              {featureDialogState?.mode === "edit"
                ? "추천 코멘트 수정"
                : "추천 코멘트 작성"}
            </SheetTitle>
            <SheetDescription>
              {featureDialogState?.item.studentName} 학생의 제출물에 추천
              코멘트를 남길 수 있습니다.
            </SheetDescription>
          </SheetHeader>

          <form
            onSubmit={handleFeatureSubmit}
            className="flex flex-col gap-4 px-4 pt-4"
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="va-feature-comment">추천 코멘트</Label>
              <Textarea
                id="va-feature-comment"
                value={featureComment}
                onChange={(e) => setFeatureComment(e.target.value)}
                placeholder="학생에게 전달할 메시지를 입력하세요."
                rows={5}
                disabled={isFeatureFormPending}
              />
              <p className="text-xs text-slate-500">
                작성한 코멘트는 모든 사용자에게 보여집니다.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={closeFeatureDialog}
                disabled={isFeatureFormPending}
              >
                취소
              </Button>
              <Button
                type="submit"
                size="sm"
                className="gap-1"
                disabled={
                  isFeatureFormPending || featureComment.trim().length === 0
                }
              >
                {isFeatureFormPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                <span>
                  {featureDialogState?.mode === "edit"
                    ? "코멘트 저장"
                    : "추천하기"}
                </span>
              </Button>
            </div>

            {featureDialogState?.item.isFeatured ? (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    featureDialogState
                      ? handleUnfeature(featureDialogState.item.id)
                      : undefined
                  }
                  disabled={!featureDialogState || isPending}
                >
                  <Star className="mr-1 h-4 w-4" />
                  추천 해제
                </Button>
              </div>
            ) : null}
          </form>
        </SheetContent>
      </Sheet>

      {/* 추천 코멘트 열람 Sheet (학생/교사용) */}
      <Sheet
        open={viewCommentItem !== null}
        onOpenChange={(open) =>
          !open ? setViewCommentItem(null) : undefined
        }
      >
        <SheetContent
          side="bottom"
          className="mx-auto w-full max-w-xl rounded-t-lg border-t border-slate-200 bg-white pb-6"
        >
          <SheetHeader className="pb-0">
            <SheetTitle>추천 코멘트</SheetTitle>
            <SheetDescription>
              {viewCommentItem?.studentName} 학생에게 전달된 추천 코멘트입니다.
            </SheetDescription>
          </SheetHeader>

          <div className="flex flex-col gap-4 px-4 pt-4">
            <div className="whitespace-pre-wrap rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              {viewCommentItem?.featuredComment ??
                "등록된 코멘트가 없습니다."}
            </div>
            {viewCommentItem?.featuredCommentedAt ? (
              <p className="text-xs text-slate-500">
                작성일: {formatDateTime(viewCommentItem.featuredCommentedAt)}
              </p>
            ) : null}
            <div className="flex justify-end">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setViewCommentItem(null)}
              >
                닫기
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
