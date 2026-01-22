'use client'
/* eslint-disable @next/next/no-img-element */

import { useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, CheckCircle2, Edit2, ImageIcon, Loader2, Trash2, Upload, ZoomIn } from 'lucide-react'

import { submitImageResponses, updateImageSubmission } from '@/app/dashboard/student/tasks/actions'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { SUBMISSIONS_BUCKET } from '@/lib/storage/buckets'
import { MAX_IMAGE_FILE_SIZE, MAX_IMAGES_PER_QUESTION } from '@/lib/storage/limits'
import { buildRandomizedFileName, uploadFileToStorageViaClient, type UploadedObjectMeta } from '@/lib/storage-upload'
import { compressImageFile, isImageFile } from '@/lib/image-compress'
import { createClient as createBrowserSupabase } from '@/lib/supabase/client'
import type { StudentTaskDetail, StudentTaskItemDetail, StudentTaskSubmissionAsset } from '@/types/student-task'

interface ImageTaskRunnerProps {
  task: StudentTaskDetail
  instructions?: string | null
}

type PendingUpload = {
  clientId: string
  name: string
  size: number
  previewUrl: string
  meta: UploadedObjectMeta
}

type ItemUploadState = {
  pendingUploads: PendingUpload[]
  isUploading: boolean
  errorMessage: string | null
  successMessage: string | null
  isEditing: boolean
  previewImage: { url: string; name: string } | null
  removedAssetIds: string[] // 편집 모드에서 삭제할 기존 asset ID 목록
}

const MAX_DISPLAY_SIZE_MB = Math.round(MAX_IMAGE_FILE_SIZE / (1024 * 1024))

const formatFileSize = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0B'
  }
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)}${units[unitIndex]}`
}

function ImageItemPanel({
  item,
  index,
  studentTaskId,
  onComplete,
}: {
  item: StudentTaskItemDetail
  index: number
  studentTaskId: string
  onComplete: () => void
}) {
  const router = useRouter()
  const supabase = useMemo(() => createBrowserSupabase(), [])
  const [isPending, startTransition] = useTransition()
  const [state, setState] = useState<ItemUploadState>({
    pendingUploads: [],
    isUploading: false,
    errorMessage: null,
    successMessage: null,
    isEditing: false,
    previewImage: null,
    removedAssetIds: [],
  })
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isCompleted = Boolean(item.completedAt)
  const existingAssets = item.submission?.assets ?? []
  // 편집 모드에서 삭제 표시된 것을 제외한 기존 이미지
  const visibleExistingAssets = state.isEditing
    ? existingAssets.filter((a) => !state.removedAssetIds.includes(a.id))
    : existingAssets
  const showUploadArea = !isCompleted || state.isEditing

  const handleOpenPreview = (asset: StudentTaskSubmissionAsset) => {
    const originalName = (asset.metadata as { originalName?: string } | null)?.originalName ?? '이미지'
    setState((prev) => ({
      ...prev,
      previewImage: {
        url: `/api/storage/${asset.bucket}/${asset.path}`,
        name: originalName,
      },
    }))
  }

  const handleClosePreview = () => {
    setState((prev) => ({ ...prev, previewImage: null }))
  }

  const handleToggleEditing = () => {
    setState((prev) => ({
      ...prev,
      isEditing: !prev.isEditing,
      pendingUploads: [],
      removedAssetIds: [],
      errorMessage: null,
      successMessage: null,
    }))
  }

  const handleCancelEditing = () => {
    // 편집 취소 시 pending uploads 정리
    state.pendingUploads.forEach((upload) => {
      URL.revokeObjectURL(upload.previewUrl)
      supabase.storage
        .from(SUBMISSIONS_BUCKET)
        .remove([upload.meta.path])
        .catch((err) => console.error('[ImageTaskRunner] failed to remove pending upload on cancel', err))
    })
    setState((prev) => ({
      ...prev,
      isEditing: false,
      pendingUploads: [],
      removedAssetIds: [],
      errorMessage: null,
      successMessage: null,
    }))
  }

  const handleRemoveExistingAsset = (assetId: string) => {
    setState((prev) => ({
      ...prev,
      removedAssetIds: [...prev.removedAssetIds, assetId],
      errorMessage: null,
    }))
  }

  const handleRemovePendingUpload = (clientId: string) => {
    const target = state.pendingUploads.find((upload) => upload.clientId === clientId)
    if (target) {
      URL.revokeObjectURL(target.previewUrl)
      supabase.storage
        .from(SUBMISSIONS_BUCKET)
        .remove([target.meta.path])
        .catch((err) => console.error('[ImageTaskRunner] failed to remove pending upload', err))
    }
    setState((prev) => ({
      ...prev,
      pendingUploads: prev.pendingUploads.filter((upload) => upload.clientId !== clientId),
    }))
  }

  const handleFileInputChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files?.length) return

    setState((prev) => ({
      ...prev,
      isUploading: true,
      errorMessage: null,
      successMessage: null,
    }))

    // 편집 모드에서는 (기존 - 삭제 + 새로 추가) 로 계산
    const currentCount = state.isEditing
      ? visibleExistingAssets.length + state.pendingUploads.length
      : state.pendingUploads.length + existingAssets.length
    const remainingSlots = MAX_IMAGES_PER_QUESTION - currentCount

    if (remainingSlots <= 0) {
      setState((prev) => ({
        ...prev,
        isUploading: false,
        errorMessage: `최대 ${MAX_IMAGES_PER_QUESTION}장까지 업로드할 수 있습니다.`,
      }))
      event.target.value = ''
      return
    }

    const filesToProcess = Array.from(files).slice(0, remainingSlots)
    const newUploads: PendingUpload[] = []

    for (const file of filesToProcess) {
      if (!isImageFile(file)) {
        setState((prev) => ({
          ...prev,
          errorMessage: '이미지 파일만 업로드할 수 있습니다. (JPEG, PNG, GIF, WebP)',
        }))
        continue
      }

      try {
        // Compress image if needed
        const { file: processedFile, wasCompressed } = await compressImageFile(file, MAX_IMAGE_FILE_SIZE)

        if (wasCompressed) {
          console.log(`[ImageTaskRunner] compressed ${file.name}: ${formatFileSize(file.size)} -> ${formatFileSize(processedFile.size)}`)
        }

        const storagePath = `student_tasks/${studentTaskId}/${buildRandomizedFileName(processedFile.name)}`

        const uploaded = await uploadFileToStorageViaClient({
          bucket: SUBMISSIONS_BUCKET,
          file: processedFile,
          path: storagePath,
          maxSizeBytes: MAX_IMAGE_FILE_SIZE,
        })

        const previewUrl = URL.createObjectURL(processedFile)

        newUploads.push({
          clientId: crypto.randomUUID(),
          name: file.name, // Keep original name for display
          size: processedFile.size,
          previewUrl,
          meta: {
            bucket: SUBMISSIONS_BUCKET,
            path: uploaded.path,
            size: uploaded.size,
            mimeType: uploaded.mimeType,
            originalName: file.name,
          },
        })
      } catch (error) {
        console.error('[ImageTaskRunner] upload failed', error)
        setState((prev) => ({
          ...prev,
          errorMessage: '이미지 업로드 중 오류가 발생했습니다.',
        }))
        break
      }
    }

    setState((prev) => ({
      ...prev,
      isUploading: false,
      pendingUploads: [...prev.pendingUploads, ...newUploads],
    }))

    event.target.value = ''
  }

  const handleSubmit = () => {
    // 편집 모드에서는 삭제할 이미지가 있거나 새 이미지가 있어야 함
    if (state.isEditing) {
      if (state.pendingUploads.length === 0 && state.removedAssetIds.length === 0) {
        setState((prev) => ({
          ...prev,
          errorMessage: '변경 사항이 없습니다.',
        }))
        return
      }
      // 최종 이미지 수가 0이면 에러
      if (visibleExistingAssets.length + state.pendingUploads.length === 0) {
        setState((prev) => ({
          ...prev,
          errorMessage: '최소 1장의 이미지가 필요합니다.',
        }))
        return
      }
    } else {
      if (state.pendingUploads.length === 0) {
        setState((prev) => ({
          ...prev,
          errorMessage: '최소 1장의 이미지를 업로드해주세요.',
        }))
        return
      }
    }

    setState((prev) => ({
      ...prev,
      errorMessage: null,
      successMessage: null,
    }))

    startTransition(async () => {
      try {
        const uploads = state.pendingUploads.map((upload) => ({
          bucket: upload.meta.bucket,
          path: upload.meta.path,
          size: upload.meta.size,
          mimeType: upload.meta.mimeType,
          originalName: upload.meta.originalName,
        }))

        let response: { success: boolean; error?: string }

        if (state.isEditing) {
          // 편집 모드: updateImageSubmission 사용
          response = await updateImageSubmission({
            studentTaskId,
            studentTaskItemId: item.id,
            workbookItemId: item.workbookItem.id,
            uploads,
            removedAssetIds: state.removedAssetIds,
          })
        } else {
          // 신규 제출: submitImageResponses 사용
          response = await submitImageResponses({
            studentTaskId,
            studentTaskItemId: item.id,
            workbookItemId: item.workbookItem.id,
            uploads,
          })
        }

        if (!response.success) {
          setState((prev) => ({
            ...prev,
            errorMessage: response.error ?? '제출에 실패했습니다.',
          }))
          return
        }

        // Cleanup preview URLs
        state.pendingUploads.forEach((upload) => {
          URL.revokeObjectURL(upload.previewUrl)
        })

        setState({
          pendingUploads: [],
          isUploading: false,
          errorMessage: null,
          successMessage: state.isEditing ? '이미지를 수정했습니다.' : '이미지를 제출했습니다.',
          isEditing: false,
          previewImage: null,
          removedAssetIds: [],
        })

        onComplete()
        router.refresh()
      } catch (error) {
        console.error('[ImageTaskRunner] submit failed', error)
        setState((prev) => ({
          ...prev,
          errorMessage: '제출 과정에서 오류가 발생했습니다.',
        }))
      }
    })
  }

  return (
    <Card className={`border-slate-200 ${isCompleted ? 'bg-green-50/50' : ''}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant={isCompleted && !state.isEditing ? 'default' : 'outline'}>
              문항 {index + 1}
            </Badge>
            {isCompleted && !state.isEditing && (
              <Badge variant="secondary" className="gap-1">
                <CheckCircle2 className="h-3 w-3" />
                완료
              </Badge>
            )}
            {state.isEditing && (
              <Badge variant="outline" className="gap-1 border-amber-300 bg-amber-50 text-amber-700">
                <Edit2 className="h-3 w-3" />
                수정 중
              </Badge>
            )}
          </div>
          <span className="text-xs text-slate-500">
            {state.isEditing
              ? `${visibleExistingAssets.length + state.pendingUploads.length} / ${MAX_IMAGES_PER_QUESTION}장`
              : `${state.pendingUploads.length + existingAssets.length} / ${MAX_IMAGES_PER_QUESTION}장`}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Question prompt */}
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="whitespace-pre-line text-sm text-slate-700">
            {item.workbookItem.prompt || '질문이 제공되지 않았습니다.'}
          </p>
        </div>

        {/* Existing assets (if already submitted) */}
        {visibleExistingAssets.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-slate-700">
                {state.isEditing ? '기존 이미지' : '제출된 이미지'}
                {state.isEditing && state.removedAssetIds.length > 0 && (
                  <span className="ml-2 text-xs text-red-500">
                    ({state.removedAssetIds.length}개 삭제 예정)
                  </span>
                )}
              </p>
              {isCompleted && !state.isEditing && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleToggleEditing}
                  className="gap-1.5 text-xs"
                >
                  <Edit2 className="h-3.5 w-3.5" />
                  수정하기
                </Button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {visibleExistingAssets.map((asset) => (
                <div
                  key={asset.id}
                  className="group relative aspect-square overflow-hidden rounded-lg border border-slate-200 bg-slate-100 transition-all hover:border-slate-400 hover:shadow-md"
                >
                  <button
                    type="button"
                    onClick={() => handleOpenPreview(asset)}
                    className="h-full w-full focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2"
                  >
                    <img
                      src={`/api/storage/${asset.bucket}/${asset.path}`}
                      alt="제출된 이미지"
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/30">
                      <ZoomIn className="h-6 w-6 text-white opacity-0 transition-opacity group-hover:opacity-100" />
                    </div>
                  </button>
                  {/* 편집 모드에서 삭제 버튼 */}
                  {state.isEditing && (
                    <Button
                      type="button"
                      size="icon"
                      variant="destructive"
                      className="absolute right-1.5 top-1.5 h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleRemoveExistingAsset(asset.id)
                      }}
                      disabled={isPending || state.isUploading}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Pending uploads */}
        {state.pendingUploads.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-700">업로드 대기</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {state.pendingUploads.map((upload) => (
                <div
                  key={upload.clientId}
                  className="group relative aspect-square overflow-hidden rounded-lg border border-dashed border-slate-300 bg-slate-50"
                >
                  <img
                    src={upload.previewUrl}
                    alt={upload.name}
                    className="h-full w-full object-cover"
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/40">
                    <Button
                      type="button"
                      size="icon"
                      variant="destructive"
                      className="opacity-0 transition-opacity group-hover:opacity-100"
                      onClick={() => handleRemovePendingUpload(upload.clientId)}
                      disabled={isPending || state.isUploading}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                    <p className="truncate text-xs text-white">{upload.name}</p>
                    <p className="text-xs text-white/70">{formatFileSize(upload.size)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Upload area */}
        {showUploadArea && (
          <div className="space-y-3">
            {state.isEditing && (
              <div className="flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">
                <Edit2 className="h-4 w-4 shrink-0" />
                <p>기존 이미지를 삭제하거나 새 이미지를 추가할 수 있습니다.</p>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
              multiple
              className="hidden"
              onChange={handleFileInputChange}
              disabled={isPending || state.isUploading}
            />

            <div
              className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 p-6 text-center transition-colors hover:border-slate-400 hover:bg-slate-100"
              onClick={() => fileInputRef.current?.click()}
            >
              {state.isUploading ? (
                <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
              ) : (
                <ImageIcon className="h-8 w-8 text-slate-400" />
              )}
              <p className="mt-2 text-sm text-slate-600">
                {state.isUploading ? '업로드 중...' : '클릭하여 이미지 선택'}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                최대 {MAX_IMAGES_PER_QUESTION}장, 각 {MAX_DISPLAY_SIZE_MB}MB (초과 시 자동 압축)
              </p>
            </div>

            {state.errorMessage && (
              <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{state.errorMessage}</p>
              </div>
            )}

            {state.successMessage && (
              <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                <CheckCircle2 className="h-4 w-4" />
                <p>{state.successMessage}</p>
              </div>
            )}

            <div className="flex justify-end gap-2">
              {state.isEditing && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCancelEditing}
                  disabled={isPending || state.isUploading}
                >
                  취소
                </Button>
              )}
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={
                  isPending ||
                  state.isUploading ||
                  (state.isEditing
                    ? (state.pendingUploads.length === 0 && state.removedAssetIds.length === 0) ||
                      (visibleExistingAssets.length + state.pendingUploads.length === 0)
                    : state.pendingUploads.length === 0)
                }
                className="min-w-[120px]"
              >
                {isPending ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {state.isEditing ? '저장 중' : '제출 중'}
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Upload className="h-4 w-4" />
                    {state.isEditing ? '변경사항 저장' : '제출하기'}
                  </span>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Image preview modal */}
        <Dialog open={state.previewImage !== null} onOpenChange={(open) => !open && handleClosePreview()}>
          <DialogContent className="max-h-[90vh] max-w-4xl overflow-auto p-0">
            <DialogTitle className="sr-only">{state.previewImage?.name ?? '이미지 미리보기'}</DialogTitle>
            {state.previewImage && (
              <div className="relative">
                <img
                  src={state.previewImage.url}
                  alt={state.previewImage.name}
                  className="h-auto w-full"
                />
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-4">
                  <p className="text-sm font-medium text-white">{state.previewImage.name}</p>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
}

export function ImageTaskRunner({ task, instructions }: ImageTaskRunnerProps) {
  const [completedCount, setCompletedCount] = useState(() =>
    task.items.filter((item) => Boolean(item.completedAt)).length
  )

  const totalItems = task.items.length
  const progressPercent = totalItems > 0 ? Math.round((completedCount / totalItems) * 100) : 0

  const handleItemComplete = () => {
    setCompletedCount((prev) => Math.min(prev + 1, totalItems))
  }

  return (
    <div className="space-y-6">
      {/* Instructions */}
      <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
        <p className="text-base font-medium text-slate-900">이미지를 업로드해주세요</p>
        <p className="mt-1">각 질문에 대해 최대 {MAX_IMAGES_PER_QUESTION}장, 각 {MAX_DISPLAY_SIZE_MB}MB까지 제출할 수 있습니다.</p>
        <p className="mt-1 text-xs text-slate-500">{MAX_DISPLAY_SIZE_MB}MB를 초과하는 이미지는 자동으로 압축됩니다.</p>
        {instructions && <p className="mt-2 whitespace-pre-line">{instructions}</p>}
      </div>

      {/* Progress */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-600">진행률</span>
          <span className="font-medium text-slate-900">{completedCount}/{totalItems} 완료</span>
        </div>
        <Progress value={progressPercent} className="h-2" />
      </div>

      {/* Items */}
      <div className="space-y-4">
        {task.items.map((item, index) => (
          <ImageItemPanel
            key={item.id}
            item={item}
            index={index}
            studentTaskId={task.id}
            onComplete={handleItemComplete}
          />
        ))}
      </div>
    </div>
  )
}



