'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlarmClock, ImagePlus, Loader2, Play, Send, Trash2 } from 'lucide-react'

import {
  startWritingAttemptAction,
  submitWritingAttemptAction,
} from '@/app/dashboard/student/writing/actions'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { WRITING_SUBMISSIONS_BUCKET } from '@/lib/storage/buckets'
import {
  buildPendingStoragePath,
  uploadFileToStorageViaClient,
  type UploadedObjectMeta,
} from '@/lib/storage-upload'
import type { StudentWritingExamData } from '@/types/writing'

const MAX_IMAGE_SIZE = 20 * 1024 * 1024
const MAX_IMAGES = 10

interface UploadedImage {
  key: string
  meta: UploadedObjectMeta
  previewUrl: string
}

function formatRemaining(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const mm = String(minutes).padStart(2, '0')
  const ss = String(seconds).padStart(2, '0')
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`
}

export function WritingExamRoom({ exam, studentId }: { exam: StudentWritingExamData; studentId: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [images, setImages] = useState<UploadedImage[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const deadlineMs = useMemo(
    () => (exam.deadlineAt ? new Date(exam.deadlineAt).getTime() : null),
    [exam.deadlineAt]
  )
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (exam.attemptStatus !== 'in_progress' || !deadlineMs) {
      return
    }
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [exam.attemptStatus, deadlineMs])

  const remainingMs = deadlineMs ? deadlineMs - now : null
  const isOverdue = remainingMs !== null && remainingMs <= 0

  const handleStart = () => {
    if (
      !window.confirm(
        `시험을 시작하면 ${exam.timeLimitMinutes}분 타이머가 바로 시작되고 중간에 멈출 수 없습니다.\n지금 시작할까요?`
      )
    ) {
      return
    }

    setError(null)
    startTransition(async () => {
      const result = await startWritingAttemptAction({ attemptId: exam.attemptId })
      if (result.success) {
        router.refresh()
      } else {
        setError(result.error ?? '시험 시작에 실패했습니다.')
      }
    })
  }

  const handleImageSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (files.length === 0) return

    if (images.length + files.length > MAX_IMAGES) {
      setError(`원고 사진은 최대 ${MAX_IMAGES}장까지 업로드할 수 있습니다.`)
      return
    }

    setError(null)
    setIsUploading(true)

    try {
      for (const file of files) {
        if (!file.type.startsWith('image/')) {
          throw new Error('이미지 파일만 업로드할 수 있습니다.')
        }
        if (file.size > MAX_IMAGE_SIZE) {
          throw new Error('사진 한 장의 크기는 최대 20MB까지 허용됩니다.')
        }

        const path = buildPendingStoragePath({ ownerId: studentId, prefix: 'pending', fileName: file.name })
        const result = await uploadFileToStorageViaClient({
          bucket: WRITING_SUBMISSIONS_BUCKET,
          file,
          path,
          maxSizeBytes: MAX_IMAGE_SIZE,
        })

        setImages((prev) => [
          ...prev,
          {
            key: crypto.randomUUID(),
            meta: {
              bucket: WRITING_SUBMISSIONS_BUCKET,
              path: result.path,
              size: result.size,
              mimeType: result.mimeType,
              originalName: result.originalName,
            },
            previewUrl: URL.createObjectURL(file),
          },
        ])
      }
    } catch (err) {
      console.error('[writings] submission image upload failed', err)
      setError(err instanceof Error ? err.message : '사진 업로드에 실패했습니다.')
    } finally {
      setIsUploading(false)
    }
  }

  const moveImage = (index: number, direction: -1 | 1) => {
    setImages((prev) => {
      const next = [...prev]
      const target = index + direction
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  const handleSubmit = () => {
    if (images.length === 0) {
      setError('원고 사진을 1장 이상 업로드해주세요.')
      return
    }

    if (!window.confirm('원고를 제출할까요? 제출 후에는 수정할 수 없습니다.')) {
      return
    }

    setError(null)
    startTransition(async () => {
      const result = await submitWritingAttemptAction({
        attemptId: exam.attemptId,
        images: images.map((image) => image.meta),
      })

      if (result.success) {
        router.refresh()
      } else {
        setError(result.error ?? '제출에 실패했습니다.')
      }
    })
  }

  const isBusy = isPending || isUploading

  if (exam.attemptStatus === 'assigned') {
    return (
      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base text-slate-900">시험 시작 전 안내</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
            <li>
              시작 버튼을 누르는 순간 문제가 공개되고{' '}
              <span className="font-semibold text-slate-900">{exam.timeLimitMinutes}분</span> 타이머가 시작됩니다.
            </li>
            <li>페이지를 닫아도 타이머는 멈추지 않습니다.</li>
            <li>제한시간 안에 손으로 쓴 원고를 사진으로 찍어 업로드하고 제출해야 합니다.</li>
            <li>원고지, 필기구, 촬영할 휴대폰(또는 카메라)을 미리 준비해주세요.</li>
          </ul>
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
          )}
          {exam.sessionStatus === 'closed' ? (
            <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
              마감된 회차입니다. 선생님께 문의해주세요.
            </p>
          ) : (
            <Button onClick={handleStart} disabled={isBusy} size="lg" className="w-full sm:w-auto">
              {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
              시험 시작하기
            </Button>
          )}
        </CardContent>
      </Card>
    )
  }

  // in_progress
  return (
    <div className="space-y-6">
      <div
        className={`sticky top-2 z-10 flex items-center justify-between gap-3 rounded-lg border p-4 shadow-sm ${
          isOverdue
            ? 'border-red-300 bg-red-50'
            : remainingMs !== null && remainingMs < 10 * 60 * 1000
              ? 'border-amber-300 bg-amber-50'
              : 'border-slate-200 bg-white'
        }`}
      >
        <div className="flex items-center gap-2">
          <AlarmClock className={`h-5 w-5 ${isOverdue ? 'text-red-600' : 'text-slate-600'}`} />
          <span className="text-sm text-slate-600">남은 시간</span>
        </div>
        <span
          className={`font-mono text-2xl font-bold tabular-nums ${
            isOverdue ? 'text-red-600' : 'text-slate-900'
          }`}
        >
          {remainingMs !== null ? formatRemaining(remainingMs) : '--:--'}
        </span>
      </div>

      {isOverdue && (
        <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          제한시간이 지났습니다. 업로드가 진행 중이었다면 잠시 안에 제출은 접수될 수 있지만, 더 늦어지면 제출이
          거부됩니다. 바로 제출해주세요.
        </p>
      )}

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base text-slate-900">작문 문항</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal space-y-4 pl-5 text-sm text-slate-700">
            {exam.questions.map((question) => (
              <li key={question.id} className="space-y-2">
                <p className="whitespace-pre-line">{question.prompt}</p>
                {question.assets.length > 0 && (
                  <div className="flex flex-wrap gap-3">
                    {question.assets.map((asset, index) =>
                      asset.url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={asset.id}
                          src={asset.url}
                          alt={`문항 이미지 ${index + 1}`}
                          className="max-h-64 rounded-md border border-slate-200 object-contain"
                        />
                      ) : null
                    )}
                  </div>
                )}
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base text-slate-900">원고 제출</CardTitle>
          <p className="text-xs text-slate-500">
            손으로 쓴 원고를 페이지 순서대로 찍어 올려주세요. 최대 {MAX_IMAGES}장, 장당 20MB까지 가능합니다.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {images.length > 0 && (
            <div className="space-y-2">
              {images.map((image, index) => (
                <div
                  key={image.key}
                  className="flex items-center gap-3 rounded-md border border-slate-200 bg-white p-2"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={image.previewUrl}
                    alt={`원고 ${index + 1}페이지`}
                    className="h-20 w-20 rounded object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900">{index + 1}페이지</p>
                    <p className="truncate text-xs text-slate-500">{image.meta.originalName}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isBusy || index === 0}
                      onClick={() => moveImage(index, -1)}
                    >
                      ↑
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isBusy || index === images.length - 1}
                      onClick={() => moveImage(index, 1)}
                    >
                      ↓
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-red-600 hover:text-red-700"
                      disabled={isBusy}
                      onClick={() => setImages((prev) => prev.filter((item) => item.key !== image.key))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleImageSelect}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={isBusy || images.length >= MAX_IMAGES}
              onClick={() => fileInputRef.current?.click()}
            >
              {isUploading ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <ImagePlus className="mr-1 h-4 w-4" />
              )}
              사진 추가
            </Button>
            <Button type="button" onClick={handleSubmit} disabled={isBusy || images.length === 0}>
              {isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />}
              제출하기
            </Button>
          </div>

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
