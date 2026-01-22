'use client'
/* eslint-disable @next/next/no-img-element */

import { useState } from 'react'
import { Calendar, ImageIcon, X } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import DateUtil from '@/lib/date-util'

type PhotoDiaryEntry = {
  id: string
  date: string
  subject: string
  prompt: string
  images: Array<{
    id: string
    url: string | null
    mimeType: string | null
  }>
}

interface PhotoDiaryListProps {
  entries: PhotoDiaryEntry[]
}

function formatDate(value: string) {
  return DateUtil.formatForDisplay(value, {
    locale: 'ko-KR',
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export function PhotoDiaryList({ entries }: PhotoDiaryListProps) {
  const [selectedImage, setSelectedImage] = useState<string | null>(null)

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 py-16 text-center">
        <ImageIcon className="h-12 w-12 text-slate-300" />
        <p className="mt-4 text-sm font-medium text-slate-600">사진일기가 없습니다</p>
        <p className="mt-1 text-xs text-slate-500">
          이미지 제출형 과제를 완료하면 여기에 사진이 표시됩니다.
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="space-y-4">
        {entries.map((entry) => (
          <Card key={entry.id} className="overflow-hidden border-slate-200">
            <CardContent className="p-4">
              <div className="space-y-4">
                {/* Header */}
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{entry.subject}</Badge>
                  <div className="flex items-center gap-1 text-xs text-slate-500">
                    <Calendar className="h-3 w-3" />
                    <span>{formatDate(entry.date)}</span>
                  </div>
                </div>

                {/* Question/Prompt */}
                {entry.prompt && (
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="text-xs font-medium text-slate-500">질문</p>
                    <p className="mt-1 whitespace-pre-line text-sm text-slate-700">
                      {entry.prompt}
                    </p>
                  </div>
                )}

                {/* Images - Masonry-like layout with original aspect ratio */}
                <div className="columns-2 gap-2 sm:columns-3 md:columns-4 lg:columns-5">
                  {entry.images.map((image) => (
                    image.url && (
                      <button
                        key={image.id}
                        type="button"
                        className="group relative mb-2 block w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-100 transition-transform hover:scale-[1.02]"
                        onClick={() => setSelectedImage(image.url)}
                      >
                        <img
                          src={image.url}
                          alt="제출 이미지"
                          className="block w-full"
                          loading="lazy"
                        />
                        <div className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/10" />
                      </button>
                    )
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Image preview dialog */}
      <Dialog open={Boolean(selectedImage)} onOpenChange={() => setSelectedImage(null)}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-auto p-0">
          <button
            type="button"
            className="absolute right-2 top-2 z-10 rounded-full bg-black/50 p-2 text-white transition-colors hover:bg-black/70"
            onClick={() => setSelectedImage(null)}
          >
            <X className="h-4 w-4" />
          </button>
          {selectedImage && (
            <img
              src={selectedImage}
              alt="확대 이미지"
              className="max-h-[85vh] w-full object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}



