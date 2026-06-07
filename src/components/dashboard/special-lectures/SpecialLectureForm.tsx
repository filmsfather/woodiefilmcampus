'use client'

import { useMemo, useRef, useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  AudienceSelector,
  type AudienceClassOption,
  type AudienceStudentOption,
} from '@/components/dashboard/special-lectures/AudienceSelector'
import {
  SPECIAL_LECTURE_MAX_VIDEO_SIZE,
  SPECIAL_LECTURE_VIDEOS_BUCKET,
  type SpecialLecture,
  type SpecialLectureAudienceMode,
} from '@/lib/special-lectures'
import {
  buildPendingStoragePath,
  uploadFileToStorageViaClient,
  type UploadedObjectMeta,
} from '@/lib/storage-upload'
import { createClient as createBrowserSupabase } from '@/lib/supabase/client'

export type SpecialLectureFormResult = {
  success?: boolean
  error?: string
  lectureId?: string
}

interface SpecialLectureFormProps {
  lecture?: SpecialLecture
  defaultAudienceMode?: SpecialLectureAudienceMode
  defaultClassIds?: string[]
  defaultStudentIds?: string[]
  classes: AudienceClassOption[]
  students: AudienceStudentOption[]
  action: (formData: FormData) => Promise<SpecialLectureFormResult>
  currentUserId: string
  submitLabel?: string
  redirectAfterCreatePath?: string
}

interface PendingVideo {
  clientId: string
  meta: UploadedObjectMeta
}

const formatFileSize = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0B'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)}${units[unitIndex]}`
}

export function SpecialLectureForm({
  lecture,
  defaultAudienceMode,
  defaultClassIds = [],
  defaultStudentIds = [],
  classes,
  students,
  action,
  currentUserId,
  submitLabel,
  redirectAfterCreatePath = '/dashboard/manager/special-lectures',
}: SpecialLectureFormProps) {
  const router = useRouter()
  const supabase = useMemo(() => createBrowserSupabase(), [])
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgressLabel, setUploadProgressLabel] = useState<string | null>(null)
  const [published, setPublished] = useState(lecture?.is_published ?? false)
  const [pendingVideo, setPendingVideo] = useState<PendingVideo | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const currentVideoLabel = lecture?.video_asset?.originalName ?? lecture?.video_asset?.path ?? null
  const maxSizeLabel = useMemo(
    () => `${Math.round(SPECIAL_LECTURE_MAX_VIDEO_SIZE / (1024 * 1024))}MB`,
    []
  )

  const handleRemovePendingVideo = () => {
    if (!pendingVideo) return
    supabase.storage
      .from(SPECIAL_LECTURE_VIDEOS_BUCKET)
      .remove([pendingVideo.meta.path])
      .catch((removeError) => {
        console.error('[special-lectures] failed to remove pending video', removeError)
      })
    setPendingVideo(null)
  }

  const handleUpload = async (file: File) => {
    if (file.size > SPECIAL_LECTURE_MAX_VIDEO_SIZE) {
      setError(`영상 파일은 최대 ${maxSizeLabel}까지 업로드할 수 있습니다.`)
      return
    }

    setError(null)
    setIsUploading(true)
    setUploadProgressLabel('업로드 준비 중...')

    if (pendingVideo) {
      handleRemovePendingVideo()
    }

    const storagePath = buildPendingStoragePath({
      ownerId: currentUserId,
      prefix: 'pending/special-lectures',
      fileName: file.name,
    })

    try {
      setUploadProgressLabel('업로드 중...')
      const uploaded = await uploadFileToStorageViaClient({
        bucket: SPECIAL_LECTURE_VIDEOS_BUCKET,
        file,
        path: storagePath,
        maxSizeBytes: SPECIAL_LECTURE_MAX_VIDEO_SIZE,
      })

      setPendingVideo({
        clientId: crypto.randomUUID(),
        meta: {
          bucket: SPECIAL_LECTURE_VIDEOS_BUCKET,
          path: uploaded.path,
          size: uploaded.size,
          mimeType: uploaded.mimeType,
          originalName: uploaded.originalName,
        },
      })
      setUploadProgressLabel(null)
    } catch (uploadError) {
      console.error('[special-lectures] upload failed', uploadError)
      setError(uploadError instanceof Error ? uploadError.message : '영상 업로드 중 오류가 발생했습니다.')
      setUploadProgressLabel(null)
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    if (isUploading) {
      setError('영상 업로드가 완료될 때까지 기다려주세요.')
      return
    }

    const form = event.currentTarget
    const formData = new FormData(form)

    if (pendingVideo) {
      formData.set('uploadedVideo', JSON.stringify(pendingVideo.meta))
    } else {
      formData.delete('uploadedVideo')
    }

    if (!lecture && !pendingVideo) {
      setError('영상 파일을 업로드해주세요.')
      return
    }

    startTransition(async () => {
      const result = await action(formData)

      if (result?.error) {
        setError(result.error)
        return
      }

      if (result?.success) {
        setPendingVideo(null)
        if (lecture) {
          router.push(`/dashboard/manager/special-lectures/${lecture.id}/edit`)
          router.refresh()
          return
        }
        router.push(redirectAfterCreatePath)
        router.refresh()
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="title">특강 제목</Label>
        <Input
          id="title"
          name="title"
          defaultValue={lecture?.title}
          required
          placeholder="예: 2025 신입생 오리엔테이션"
          disabled={isPending}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">설명</Label>
        <Textarea
          id="description"
          name="description"
          defaultValue={lecture?.description ?? ''}
          placeholder="특강 내용을 간단히 소개하세요."
          rows={4}
          disabled={isPending}
        />
      </div>

      <Card className="border-slate-200">
        <CardHeader className="space-y-1">
          <CardTitle className="text-base text-slate-900">영상 파일</CardTitle>
          <p className="text-xs text-slate-500">
            mp4 등 동영상 파일을 업로드해주세요. 최대 {maxSizeLabel}까지 가능합니다. 영상은 외부에 공개되지 않으며,
            허용된 학생에게만 30분 단위 임시 링크로 제공됩니다.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {currentVideoLabel && !pendingVideo ? (
            <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate">현재 영상: {currentVideoLabel}</span>
                <Badge variant="secondary" className="shrink-0">
                  교체하려면 새 파일 선택
                </Badge>
              </div>
            </div>
          ) : null}

          {pendingVideo ? (
            <div className="flex items-center justify-between rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              <div className="flex flex-col gap-1">
                <span>{pendingVideo.meta.originalName}</span>
                <Badge variant="secondary" className="w-fit">
                  {formatFileSize(pendingVideo.meta.size)} 업로드 완료
                </Badge>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleRemovePendingVideo}
                disabled={isPending}
              >
                제거
              </Button>
            </div>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0]
                if (file) {
                  void handleUpload(file)
                }
              }}
            />
            <Button
              type="button"
              variant="outline"
              className="sm:w-48"
              onClick={() => fileInputRef.current?.click()}
              disabled={isPending || isUploading}
            >
              {isUploading ? uploadProgressLabel ?? '업로드 중...' : pendingVideo || currentVideoLabel ? '영상 교체' : '영상 선택'}
            </Button>
            <p className="text-xs text-slate-400 sm:text-right">
              한 번에 한 개의 영상만 업로드할 수 있습니다.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardHeader className="space-y-1">
          <CardTitle className="text-base text-slate-900">시청 권한</CardTitle>
          <p className="text-xs text-slate-500">
            누가 이 특강을 시청할 수 있는지 지정합니다.
          </p>
        </CardHeader>
        <CardContent>
          <AudienceSelector
            classes={classes}
            students={students}
            defaultMode={defaultAudienceMode ?? lecture?.audience_mode ?? 'class'}
            defaultClassIds={defaultClassIds}
            defaultStudentIds={defaultStudentIds}
            disabled={isPending}
          />
        </CardContent>
      </Card>

      <div className="flex items-center space-x-2">
        <input type="hidden" name="is_published" value={published ? 'on' : 'off'} />
        <Switch
          id="is_published_switch"
          checked={published}
          onCheckedChange={setPublished}
          disabled={isPending}
        />
        <Label htmlFor="is_published_switch">학생에게 공개</Label>
      </div>

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push('/dashboard/manager/special-lectures')}
          disabled={isPending}
        >
          취소
        </Button>
        <Button type="submit" disabled={isPending || isUploading}>
          {isPending ? (
            <span className="flex items-center justify-center gap-2">
              <LoadingSpinner />
              저장 중...
            </span>
          ) : (
            submitLabel ?? (lecture ? '수정하기' : '등록하기')
          )}
        </Button>
      </div>
    </form>
  )
}
