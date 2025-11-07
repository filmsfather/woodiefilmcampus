'use client'
/* eslint-disable @next/next/no-img-element */

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, CheckCircle2, Download, Loader2, Upload } from 'lucide-react'

import { submitPdfSubmission } from '@/app/dashboard/student/tasks/actions'
import { Button } from '@/components/ui/button'
import type { StudentTaskSubmission } from '@/types/student-task'
import { Badge } from '@/components/ui/badge'
import { SUBMISSIONS_BUCKET } from '@/lib/storage/buckets'
import { MAX_PDF_FILE_SIZE } from '@/lib/storage/limits'
import { buildRandomizedFileName, uploadFileToStorageViaClient } from '@/lib/storage-upload'

interface PdfTaskPanelProps {
  studentTaskId: string
  existingSubmission: StudentTaskSubmission | null
  signedUrl: { url: string; filename: string } | null
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

export function PdfTaskPanel({
  studentTaskId,
  existingSubmission,
  signedUrl,
  instructions,
  items,
}: PdfTaskPanelProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    setErrorMessage(null)
    setSuccessMessage(null)

    const file = fileInputRef.current?.files?.[0]

    if (!file) {
      setErrorMessage('업로드할 PDF 파일을 선택해주세요.')
      return
    }

    if (file.type !== 'application/pdf') {
      setErrorMessage('PDF 형식의 파일만 업로드할 수 있습니다.')
      return
    }

    if (file.size > MAX_PDF_FILE_SIZE) {
      setErrorMessage(`파일 크기는 최대 ${MAX_DISPLAY_SIZE_MB}MB까지 지원합니다.`)
      return
    }

    startTransition(async () => {
      try {
        const storagePath = `student_tasks/${studentTaskId}/${buildRandomizedFileName(file.name)}`

        const uploaded = await uploadFileToStorageViaClient({
          bucket: SUBMISSIONS_BUCKET,
          file,
          path: storagePath,
          maxSizeBytes: MAX_PDF_FILE_SIZE,
        })

        const formData = new FormData()
        formData.append('studentTaskId', studentTaskId)
        formData.append(
          'uploadedFile',
          JSON.stringify({
            bucket: SUBMISSIONS_BUCKET,
            path: uploaded.path,
            size: uploaded.size,
            mimeType: uploaded.mimeType,
            originalName: uploaded.originalName,
          })
        )

        const response = await submitPdfSubmission(formData)

        if (!response.success) {
          setErrorMessage(response.error ?? '파일 제출에 실패했습니다.')
          return
        }

        setSuccessMessage('PDF 파일을 업로드했습니다.')
        fileInputRef.current?.form?.reset()
        setSelectedFileName(null)
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
          accept="application/pdf"
          className="hidden"
          name="file"
          onChange={(event) => {
            const file = event.target.files?.[0]
            setSelectedFileName(file ? file.name : null)
            setErrorMessage(null)
            setSuccessMessage(null)
          }}
        />
        <input type="hidden" name="studentTaskId" value={studentTaskId} />

        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
          <p className="text-sm text-slate-600">
            {selectedFileName ?? '제출할 PDF 파일을 선택하세요.'}
          </p>
          <Button
            type="button"
            variant="outline"
            className="mt-3 flex items-center gap-2"
            onClick={() => fileInputRef.current?.click()}
            disabled={isPending}
          >
            <Upload className="h-4 w-4" /> 파일 선택
          </Button>
        </div>

        {signedUrl && (
          <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
            <p className="font-medium text-slate-900">현재 제출된 파일</p>
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="truncate" title={signedUrl.filename}>
                {signedUrl.filename}
              </span>
              <Button asChild variant="outline" size="sm" className="flex items-center gap-2">
                <a href={signedUrl.url} target="_blank" rel="noreferrer">
                  <Download className="h-4 w-4" /> 다운로드
                </a>
              </Button>
            </div>
          </div>
        )}

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
          <Button type="submit" disabled={isPending} className="min-w-[140px]">
            {isPending ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> 업로드 중
              </span>
            ) : existingSubmission ? (
              '재업로드'
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
