'use client'

import { useState } from 'react'
import { Download, Loader2, Trophy } from 'lucide-react'

import type { ExcellentMonthGroup } from '@/lib/atelier-excellent'
import { getAtelierAttachmentDownload } from '@/app/dashboard/atelier/actions'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'

interface AtelierExcellentShowcaseProps {
  groups: ExcellentMonthGroup[]
  viewerId: string
}

type CommentViewState = {
  studentName: string
  comment: string
} | null

export function AtelierExcellentShowcase({ groups, viewerId }: AtelierExcellentShowcaseProps) {
  const [commentView, setCommentView] = useState<CommentViewState>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  if (groups.length === 0) {
    return null
  }

  const handleDownload = async (postId: string, mediaAssetId: string) => {
    const key = `${postId}:${mediaAssetId}`
    setDownloadingId(key)

    try {
      const result = await getAtelierAttachmentDownload({ postId, mediaAssetId })
      if (result.success && result.url) {
        const win = window.open(result.url, '_blank', 'noopener,noreferrer')
        if (!win) {
          window.location.href = result.url
        }
      }
    } catch {
      // silent
    } finally {
      setDownloadingId(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {groups.map((group) => (
        <div key={group.month.id} className="rounded-lg border border-amber-200 bg-amber-50/50 p-4">
          <div className="mb-3 flex items-center gap-2">
            <Trophy className="h-5 w-5 text-amber-600" />
            <h2 className="text-lg font-semibold text-amber-900">
              {group.month.label}의 우수작
            </h2>
            <span className="text-sm text-amber-600">{group.posts.length}건</span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {group.posts.map((post) => {
              const firstAttachment = post.attachments[0]
              const downloadKey = firstAttachment ? `${post.postId}:${firstAttachment.mediaAssetId}` : null
              const isDownloading = downloadKey === downloadingId

              return (
                <div
                  key={post.postId}
                  className="flex flex-col gap-2 rounded-md border border-amber-200 bg-white p-3 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-slate-900">{post.studentName}</p>
                      <p className="truncate text-sm text-slate-500">
                        {post.workbookTitle ?? '제목 없음'}
                      </p>
                    </div>
                    {firstAttachment ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="shrink-0"
                        disabled={isDownloading}
                        onClick={() => handleDownload(post.postId, firstAttachment.mediaAssetId)}
                      >
                        {isDownloading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Download className="h-4 w-4" />
                        )}
                      </Button>
                    ) : null}
                  </div>

                  {post.featuredComment ? (
                    <button
                      type="button"
                      className="line-clamp-2 cursor-pointer text-left text-sm text-slate-600 hover:text-slate-900"
                      onClick={() =>
                        setCommentView({
                          studentName: post.studentName,
                          comment: post.featuredComment!,
                        })
                      }
                    >
                      {post.featuredComment}
                    </button>
                  ) : null}
                </div>
              )
            })}
          </div>
        </div>
      ))}

      <Sheet open={commentView !== null} onOpenChange={(open) => (!open ? setCommentView(null) : undefined)}>
        <SheetContent side="bottom" className="mx-auto w-full max-w-xl rounded-t-lg border-t border-slate-200 bg-white pb-6">
          <SheetHeader className="pb-0">
            <SheetTitle>추천 코멘트</SheetTitle>
            <SheetDescription>
              {commentView?.studentName} 학생에게 전달된 추천 코멘트입니다.
            </SheetDescription>
          </SheetHeader>

          <div className="flex flex-col gap-4 px-4 pt-4">
            <div className="whitespace-pre-wrap rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              {commentView?.comment ?? ''}
            </div>
            <div className="flex justify-end">
              <Button type="button" size="sm" variant="ghost" onClick={() => setCommentView(null)}>
                닫기
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
