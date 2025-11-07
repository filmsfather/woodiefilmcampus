'use client'
/* eslint-disable @next/next/no-img-element */

import { useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, CheckCircle2, Download, Loader2, Upload } from 'lucide-react'

import { submitPdfSubmission } from '@/app/dashboard/student/tasks/actions'
import { Button } from '@/components/ui/button'
import type { StudentTaskSubmission } from '@/types/student-task'
import { Badge } from '@/components/ui/badge'
import { SUBMISSIONS_BUCKET } from '@/lib/storage/buckets'
import { MAX_PDF_FILE_SIZE } from '@/lib/storage/limits'
import { buildRandomizedFileName, uploadFileToStorageViaClient, type UploadedObjectMeta } from '@/lib/storage-upload'
import { createClient as createBrowserSupabase } from '@/lib/supabase/client'

interface PdfTaskPanelProps {
  studentTaskId: string
  existingSubmission: StudentTaskSubmission | null
  existingAssets: Array<{ id: string; filename: string; url: string | null }>
  instructions?: string | null
  items: Array<{
    id: string
    index: number
    prompt: string
    attachments: Array<{
      id: string
      filename: string
      url: string
      mimeType: string | null
    }>
  }>
}

const MAX_DISPLAY_SIZE_MB = Math.round(MAX_PDF_FILE_SIZE / (1024 * 1024))
const ALLOWED_MIME_TYPES = ['application/pdf']

type PendingUpload = {
  clientId: string
  name: string
  size: number
  meta: UploadedObjectMeta
}

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

export function PdfTaskPanel({
  studentTaskId,
  existingSubmission,
  existingAssets,
  instructions,
  items,
}: PdfTaskPanelProps) {
  const router = useRouter()
  const supabase = useMemo(() => createBrowserSupabase(), [])
  const [isPending, startTransition] = useTransition()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([])
  const [removedAssetIds, setRemovedAssetIds] = useState<Set<string>>(new Set())
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const hasChanges = pendingUploads.length > 0 || removedAssetIds.size > 0

  const toggleExistingAttachment = (assetId: string) => {
    setRemovedAssetIds((prev) => {
      const next = new Set(prev)
      if (next.has(assetId)) {
        next.delete(assetId)
      } else {
        next.add(assetId)
      }
      return next
    })
  }

  const handleRemovePendingUpload = (clientId: string) => {
    setPendingUploads((prev) => {
      const target = prev.find((item) => item.clientId === clientId)
      if (target) {
        supabase.storage
          .from(SUBMISSIONS_BUCKET)
          .remove([target.meta.path])
          .catch((storageError) => {
            console.error('[PdfTaskPanel] failed to remove pending upload', storageError)
          })
      }
      return prev.filter((item) => item.clientId !== clientId)
    })
  }

  const uploadFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) {
      return
    }

    setErrorMessage(null)
    setSuccessMessage(null)
    setIsUploading(true)

    for (const file of Array.from(files)) {
      const mimeType = file.type || 'application/octet-stream'
      const isPdf = ALLOWED_MIME_TYPES.includes(mimeType) || file.name.toLowerCase().endsWith('.pdf')

      if (!isPdf) {
        setErrorMessage('PDF 형식의 파일만 업로드할 수 있습니다.')
        continue
      }

      if (file.size > MAX_PDF_FILE_SIZE) {
        setErrorMessage(`파일 크기는 최대 ${MAX_DISPLAY_SIZE_MB}MB까지 지원합니다.`)
        continue
      }

      const storagePath = `student_tasks/${studentTaskId}/${buildRandomizedFileName(file.name)}`

      try {
        const uploaded = await uploadFileToStorageViaClient({
          bucket: SUBMISSIONS_BUCKET,
          file,
          path: storagePath,
          maxSizeBytes: MAX_PDF_FILE_SIZE,
        })

        const enrichedMeta: UploadedObjectMeta = {
          bucket: SUBMISSIONS_BUCKET,
          path: uploaded.path,
          size: uploaded.size,
          mimeType: uploaded.mimeType,
          originalName: uploaded.originalName,
        }

        setPendingUploads((prev) => [
          ...prev,
          {
            clientId: crypto.randomUUID(),
            name: file.name,
            size: file.size,
            meta: enrichedMeta,
          },
        ])
      } catch (error) {
        console.error('[PdfTaskPanel] upload failed', error)
        setErrorMessage('파일 업로드 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.')
        break
      }
    }

    setIsUploading(false)
    const input = fileInputRef.current
    if (input) {
      input.value = ''
    }
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    setErrorMessage(null)
    setSuccessMessage(null)

    if (isUploading) {
      setErrorMessage('파일 업로드가 완료될 때까지 기다려주세요.')
      return
    }

    if (pendingUploads.length === 0 && removedAssetIds.size === 0) {
      setErrorMessage('업로드할 파일을 추가하거나 삭제할 파일을 선택해주세요.')
      return
    }

    const formData = new FormData()
    formData.append('studentTaskId', studentTaskId)

    if (pendingUploads.length > 0) {
      const payload = pendingUploads.map((upload) => ({
        bucket: SUBMISSIONS_BUCKET,
        path: upload.meta.path,
        size: upload.meta.size,
        mimeType: upload.meta.mimeType,
        originalName: upload.meta.originalName,
      }))
      formData.append('uploadedFiles', JSON.stringify(payload))
    }

    removedAssetIds.forEach((assetId) => {
      formData.append('removedAssetIds', assetId)
    })

    startTransition(async () => {
      try {
        const response = await submitPdfSubmission(formData)

        if (!response.success) {
          setErrorMessage(response.error ?? '파일 제출에 실패했습니다.')
          return
        }

        setSuccessMessage('PDF 파일을 업로드했습니다.')
        setPendingUploads([])
        setRemovedAssetIds(new Set())
        fileInputRef.current?.form?.reset()
        router.refresh()
      } catch (error) {
        console.error('[PdfTaskPanel] submit failed', error)
        setErrorMessage('제출 과정에서 오류가 발생했습니다. 잠시 후 다시 시도해주세요.')
      }
    })
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
        <p className="text-base font-medium text-slate-900">PDF 파일을 업로드해주세요</p>
        <p className="mt-1">최대 {MAX_DISPLAY_SIZE_MB}MB까지 제출할 수 있습니다.</p>
        {instructions && <p className="mt-2 whitespace-pre-line">{instructions}</p>}
        {existingSubmission?.updatedAt && (
          <p className="mt-2 text-xs text-slate-500">
            최근 제출: {new Date(existingSubmission.updatedAt).toLocaleString('ko-KR')}
          </p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          multiple
          onChange={(event) => uploadFiles(event.currentTarget.files)}
        />
        <input type="hidden" name="studentTaskId" value={studentTaskId} />

        <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-800">제출된 파일</p>
            <span className="text-xs text-slate-500">{existingAssets.length}개</span>
          </div>
          {existingAssets.length === 0 ? (
            <p className="text-xs text-slate-500">제출된 파일이 없습니다.</p>
          ) : (
            <div className="space-y-2">
              {existingAssets.map((asset) => {
                const isRemoved = removedAssetIds.has(asset.id)
                return (
                  <div
                    key={asset.id}
                    className={`flex flex-col gap-2 rounded-lg border px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between ${
                      isRemoved ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-slate-200 bg-white text-slate-700'
                    }`}
                  >
                    <div className="flex flex-col">
                      <span className={isRemoved ? 'line-through' : ''}>{asset.filename}</span>
                      {isRemoved ? <span className="text-xs">삭제 예정</span> : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {asset.url ? (
                        <Button asChild variant="outline" size="sm">
                          <a href={asset.url} target="_blank" rel="noreferrer">
                            <Download className="mr-1 h-3 w-3" /> 다운로드
                          </a>
                        </Button>
                      ) : (
                        <span className="text-xs text-slate-400">URL 생성 실패</span>
                      )}
                      <Button
                        type="button"
                        variant={isRemoved ? 'secondary' : 'outline'}
                        size="sm"
                        onClick={() => toggleExistingAttachment(asset.id)}
                        disabled={isPending || isUploading}
                      >
                        {isRemoved ? '삭제 취소' : '삭제'}
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {pendingUploads.length > 0 && (
          <div className="space-y-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
            <p className="text-sm font-medium text-slate-800">업로드 대기 중</p>
            <div className="space-y-2">
              {pendingUploads.map((upload) => (
                <div
                  key={upload.clientId}
                  className="flex flex-col gap-1 rounded-md border border-slate-200 bg-white px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex flex-col">
                    <span>{upload.name}</span>
                    <span className="text-xs text-slate-500">{formatFileSize(upload.size)}</span>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => handleRemovePendingUpload(upload.clientId)}
                    disabled={isPending}
                  >
                    제거
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-600">
          <p>여러 개의 PDF 파일을 한 번에 업로드할 수 있습니다. 최대 {MAX_DISPLAY_SIZE_MB}MB까지 지원합니다.</p>
          <Button
            type="button"
            variant="outline"
            className="mt-3 inline-flex items-center gap-2"
            onClick={() => fileInputRef.current?.click()}
            disabled={isPending || isUploading}
          >
            {isUploading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> 업로드 중...
              </span>
            ) : (
              <>
                <Upload className="h-4 w-4" /> 파일 추가
              </>
            )}
          </Button>
          <p className="mt-2 text-xs text-slate-500">업로드한 파일은 위 목록에서 삭제하거나 변경할 수 있습니다.</p>
        </div>

        {errorMessage && (
          <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4" />
            <p>{errorMessage}</p>
          </div>
        )}

        {successMessage && (
          <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
            <CheckCircle2 className="h-4 w-4" />
            <p>{successMessage}</p>
          </div>
        )}

        <div className="flex justify-end">
          <Button type="submit" disabled={isPending || isUploading || !hasChanges} className="min-w-[140px]">
            {isPending ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> 업로드 중
              </span>
            ) : existingSubmission ? (
              '변경 저장'
            ) : (
              '업로드'
            )}
          </Button>
        </div>
      </form>

      {items.length > 0 && (
        <div className="space-y-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-base font-semibold text-slate-900">문항 안내</h2>
            <p className="text-xs text-slate-500">
              PDF를 작성할 때 아래 문항을 참고하세요. 각 첨부 파일은 클릭해 내려받을 수 있습니다.
            </p>
          </div>
          <div className="space-y-4">
            {items.map((item) => {
              const attachments = item.attachments ?? []
              const promptText = item.prompt?.trim()
              return (
                <div
                  key={item.id}
                  className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-700"
                >
                  <div className="flex items-start gap-2">
                    <Badge variant="secondary">문항 {item.index}</Badge>
                    <p className="whitespace-pre-line">
                      {promptText && promptText.length > 0 ? promptText : '문항 설명이 제공되지 않았습니다.'}
                    </p>
                  </div>
                  {attachments.length > 0 && (
                    <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                      <p className="font-medium text-slate-700">첨부 파일</p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {attachments.map((file) => {
                          const mime = file.mimeType ?? ''
                          if (mime.startsWith('image/')) {
                            return (
                              <figure key={file.id} className="space-y-1">
                                <img
                                  src={file.url}
                                  alt={file.filename}
                                  className="max-h-64 w-full rounded-md border border-slate-200 object-contain"
                                  loading="lazy"
                                />
                                <figcaption className="break-all text-slate-500">{file.filename}</figcaption>
                              </figure>
                            )
                          }

                          const isPdf = mime === 'application/pdf' || file.filename.toLowerCase().endsWith('.pdf')

                          return (
                            <div key={file.id} className="flex flex-col gap-1">
                              <a
                                href={file.url}
                                target="_blank"
                                rel="noreferrer"
                                className="break-all text-primary underline"
                                download={isPdf ? file.filename : undefined}
                              >
                                {file.filename}
                              </a>
                              <span className="text-slate-500">{isPdf ? 'PDF 파일' : mime || '파일'}</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
