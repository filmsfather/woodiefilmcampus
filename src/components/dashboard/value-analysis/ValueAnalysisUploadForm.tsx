"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { FileUp, Loader2, X } from "lucide-react"

import type { ValueAnalysisGenre } from "@/lib/value-analysis"
import { VALUE_ANALYSIS_BUCKET } from "@/lib/storage/buckets"
import {
  uploadFileToStorageViaClient,
  buildPendingStoragePath,
  type UploadedObjectMeta,
} from "@/lib/storage-upload"
import { MAX_PDF_FILE_SIZE } from "@/lib/storage/limits"
import { createValueAnalysisPost } from "@/app/dashboard/value-analysis/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"

interface ValueAnalysisUploadFormProps {
  genres: ValueAnalysisGenre[]
  uploaderId: string
}

export function ValueAnalysisUploadForm({
  genres,
  uploaderId,
}: ValueAnalysisUploadFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [uploadedFile, setUploadedFile] = useState<UploadedObjectMeta | null>(
    null
  )
  const [uploading, setUploading] = useState(false)
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (file.type !== "application/pdf") {
      setError("PDF 파일만 업로드할 수 있습니다.")
      return
    }

    if (file.size > MAX_PDF_FILE_SIZE) {
      setError("파일 크기는 최대 50MB까지 허용됩니다.")
      return
    }

    setError(null)
    setUploading(true)
    setSelectedFileName(file.name)

    try {
      const path = buildPendingStoragePath({
        ownerId: uploaderId,
        prefix: "pending",
        fileName: file.name,
      })

      const result = await uploadFileToStorageViaClient({
        bucket: VALUE_ANALYSIS_BUCKET,
        file,
        path,
        maxSizeBytes: MAX_PDF_FILE_SIZE,
      })

      setUploadedFile({
        bucket: VALUE_ANALYSIS_BUCKET,
        path: result.path,
        size: result.size,
        mimeType: result.mimeType,
        originalName: result.originalName,
      })
    } catch (err) {
      console.error("[value-analysis] upload failed", err)
      setError(
        err instanceof Error ? err.message : "파일 업로드에 실패했습니다."
      )
      setSelectedFileName(null)
    } finally {
      setUploading(false)
    }
  }

  const handleRemoveFile = () => {
    setUploadedFile(null)
    setSelectedFileName(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    const formData = new FormData(event.currentTarget)

    if (!uploadedFile) {
      setError("PDF 파일을 업로드해주세요.")
      return
    }

    formData.set("uploadedFile", JSON.stringify(uploadedFile))

    startTransition(async () => {
      const result = await createValueAnalysisPost(formData)
      if (result.success) {
        router.push("/dashboard/value-analysis")
        router.refresh()
      } else {
        setError(result.error ?? "게시물 등록에 실패했습니다.")
      }
    })
  }

  const isDisabled = isPending || uploading

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="va-title">제목 *</Label>
        <Input
          id="va-title"
          name="title"
          placeholder="가치분석 제목을 입력하세요"
          maxLength={200}
          required
          disabled={isDisabled}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="va-genre">장르 *</Label>
        <select
          id="va-genre"
          name="genreId"
          required
          disabled={isDisabled}
          className="w-full rounded-md border border-slate-300 bg-white p-2 text-sm"
        >
          <option value="">장르를 선택하세요</option>
          {genres.map((genre) => (
            <option key={genre.id} value={genre.id}>
              {genre.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="va-description">설명</Label>
        <Textarea
          id="va-description"
          name="description"
          placeholder="가치분석에 대한 설명을 입력하세요 (선택)"
          rows={4}
          maxLength={2000}
          disabled={isDisabled}
        />
      </div>

      <div className="space-y-2">
        <Label>PDF 파일 *</Label>
        {uploadedFile ? (
          <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 p-3">
            <FileUp className="h-5 w-5 text-slate-500" />
            <span className="flex-1 truncate text-sm text-slate-700">
              {selectedFileName}
            </span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={handleRemoveFile}
              disabled={isDisabled}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 rounded-lg border-2 border-dashed border-slate-300 p-8">
            {uploading ? (
              <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
            ) : (
              <FileUp className="h-8 w-8 text-slate-400" />
            )}
            <p className="text-sm text-slate-500">
              {uploading ? "업로드 중..." : "PDF 파일을 선택하세요 (최대 50MB)"}
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              onChange={handleFileSelect}
              disabled={isDisabled}
              className="hidden"
              id="va-file-input"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isDisabled}
              onClick={() => fileInputRef.current?.click()}
            >
              파일 선택
            </Button>
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 pt-2">
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.back()}
          disabled={isPending}
        >
          취소
        </Button>
        <Button type="submit" disabled={isDisabled || !uploadedFile}>
          {isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : null}
          제출하기
        </Button>
      </div>
    </form>
  )
}
