'use client'
/* eslint-disable @next/next/no-img-element */

import { useState } from 'react'
import { Trophy } from 'lucide-react'

import type { WorksheetExcellentMonthGroup, WorksheetExcellentPostItem } from '@/lib/worksheet-excellent'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

interface WorksheetExcellentShowcaseProps {
  groups: WorksheetExcellentMonthGroup[]
}

export function WorksheetExcellentShowcase({ groups }: WorksheetExcellentShowcaseProps) {
  const [detailPost, setDetailPost] = useState<WorksheetExcellentPostItem | null>(null)

  if (groups.length === 0) {
    return null
  }

  return (
    <div className="flex flex-col gap-6">
      {groups.map((group) => (
        <div key={group.month.id} className="rounded-lg border border-amber-200 bg-amber-50/50 p-4">
          <div className="mb-3 flex items-center gap-2">
            <Trophy className="h-5 w-5 text-amber-600" />
            <h2 className="text-lg font-semibold text-amber-900">{group.month.label}의 우수작</h2>
            <span className="text-sm text-amber-600">{group.posts.length}건</span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {group.posts.map((post) => {
              const cover = post.photos[0]

              return (
                <button
                  key={post.postId}
                  type="button"
                  onClick={() => setDetailPost(post)}
                  className="flex flex-col gap-2 rounded-md border border-amber-200 bg-white p-3 text-left shadow-sm transition-transform hover:scale-[1.01] focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-1"
                >
                  {cover ? (
                    <div className="aspect-[4/3] overflow-hidden rounded bg-slate-100">
                      <img
                        src={cover.url}
                        alt={`${post.studentName} 우수 워크시트`}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    </div>
                  ) : null}

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-medium text-slate-900">{post.studentName}</p>
                      {post.className ? <Badge variant="secondary">{post.className}</Badge> : null}
                    </div>
                    <p className="truncate text-sm text-slate-500">{post.workbookTitle ?? '제목 없음'}</p>
                  </div>

                  {post.featuredComment ? (
                    <p className="line-clamp-2 text-sm text-slate-600">{post.featuredComment}</p>
                  ) : null}

                  <p className="text-xs text-slate-400">사진 {post.photos.length}장 · 자세히 보기</p>
                </button>
              )
            })}
          </div>
        </div>
      ))}

      <Dialog open={detailPost !== null} onOpenChange={(open) => (!open ? setDetailPost(null) : undefined)}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">
              {detailPost?.studentName} · {detailPost?.workbookTitle ?? '제목 없음'}
            </DialogTitle>
          </DialogHeader>

          {detailPost ? (
            <div className="flex flex-col gap-4">
              {detailPost.featuredComment ? (
                <div className="whitespace-pre-wrap rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-slate-700">
                  {detailPost.featuredComment}
                </div>
              ) : null}

              <div className="flex flex-col gap-3">
                {detailPost.photos.map((photo, index) => (
                  <div key={photo.id} className="overflow-hidden rounded-md bg-slate-100">
                    <img
                      src={photo.url}
                      alt={`${detailPost.studentName} 워크시트 ${index + 1}`}
                      className="w-full object-contain"
                      loading="lazy"
                    />
                  </div>
                ))}
              </div>

              <div className="flex justify-end">
                <Button type="button" size="sm" variant="ghost" onClick={() => setDetailPost(null)}>
                  닫기
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
