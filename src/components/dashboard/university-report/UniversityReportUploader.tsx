'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, KeyRound, Loader2, Upload } from 'lucide-react'

import {
  createSnapshotFromUpload,
  parseSnapshot,
} from '@/app/dashboard/student/university-report/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  UNIVERSITY_REPORTS_BUCKET,
} from '@/lib/storage/buckets'
import {
  sanitizeStorageFileName,
  uploadFileToStorageViaClient,
} from '@/lib/storage-upload'

const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20MB

type UploadStage = 'idle' | 'uploading' | 'parsing' | 'password' | 'done' | 'error'

interface UniversityReportUploaderProps {
  studentId: string
  mode: 'initial' | 'replace'
}

export default function UniversityReportUploader({
  studentId,
  mode,
}: UniversityReportUploaderProps) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [stage, setStage] = useState<UploadStage>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [activeSnapshotId, setActiveSnapshotId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const isBusy = stage === 'uploading' || stage === 'parsing'

  const runParse = async (snapshotId: string, pwd?: string) => {
    setStage('parsing')
    setErrorMessage(null)

    const parseResult = await parseSnapshot(
      pwd ? { snapshotId, password: pwd } : { snapshotId }
    )

    if ('error' in parseResult) {
      if (parseResult.code === 'password_required' || parseResult.code === 'wrong_password') {
        setActiveSnapshotId(snapshotId)
        setStage('password')
        setErrorMessage(
          parseResult.code === 'wrong_password' ? parseResult.error : null
        )
        return
      }

      setErrorMessage(parseResult.error)
      setStage('error')
      if (inputRef.current) inputRef.current.value = ''
      return
    }

    setStage('done')
    setPassword('')
    setActiveSnapshotId(null)
    startTransition(() => {
      router.refresh()
    })
  }

  const handleSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (file.type !== 'application/pdf') {
      setErrorMessage('PDF 파일만 업로드할 수 있습니다.')
      setStage('error')
      if (inputRef.current) inputRef.current.value = ''
      return
    }

    if (file.size > MAX_FILE_SIZE) {
      setErrorMessage('파일 크기는 20MB 이하여야 합니다.')
      setStage('error')
      if (inputRef.current) inputRef.current.value = ''
      return
    }

    setErrorMessage(null)
    setPassword('')
    setActiveSnapshotId(null)
    setStage('uploading')

    try {
      const safeName = sanitizeStorageFileName(file.name)
      const path = `${studentId}/transcripts/${Date.now()}-${crypto.randomUUID()}-${safeName}`

      const uploadResult = await uploadFileToStorageViaClient({
        bucket: UNIVERSITY_REPORTS_BUCKET,
        file,
        path,
        maxSizeBytes: MAX_FILE_SIZE,
      })

      const createResult = await createSnapshotFromUpload({
        studentId,
        path: uploadResult.path,
        originalName: uploadResult.originalName,
        mimeType: uploadResult.mimeType,
        size: uploadResult.size,
      })

      if ('error' in createResult) {
        setErrorMessage(createResult.error)
        setStage('error')
        if (inputRef.current) inputRef.current.value = ''
        return
      }

      await runParse(createResult.snapshotId)
    } catch (error) {
      console.error('[university-report-uploader] upload error', error)
      setErrorMessage(
        error instanceof Error && error.message
          ? error.message
          : '업로드 중 오류가 발생했습니다.'
      )
      setStage('error')
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const handlePasswordSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!activeSnapshotId) return
    const trimmed = password.trim()
    if (!trimmed) {
      setErrorMessage('비밀번호를 입력해 주세요.')
      return
    }
    await runParse(activeSnapshotId, trimmed)
  }

  const triggerFilePick = () => {
    if (isBusy) return
    inputRef.current?.click()
  }

  const buttonLabel =
    mode === 'replace' ? '다른 PDF로 다시 업로드' : '성적증명서 PDF 업로드'

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={handleSelect}
      />

      <Button
        type="button"
        size="lg"
        variant={mode === 'initial' ? 'default' : 'outline'}
        className="gap-2"
        onClick={triggerFilePick}
        disabled={isBusy || isPending}
      >
        {isBusy || isPending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : stage === 'done' ? (
          <CheckCircle2 className="size-4 text-emerald-500" />
        ) : (
          <Upload className="size-4" />
        )}
        {buttonLabel}
      </Button>

      {stage === 'uploading' ? (
        <p className="text-xs text-slate-500">PDF를 안전한 저장소에 업로드 중입니다...</p>
      ) : null}
      {stage === 'parsing' ? (
        <p className="text-xs text-slate-500">
          AI가 학년·학기·과목·등급을 분석 중입니다. 페이지를 닫지 말고 잠시만 기다려 주세요.
        </p>
      ) : null}

      {stage === 'password' && activeSnapshotId ? (
        <form
          onSubmit={handlePasswordSubmit}
          className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3"
        >
          <div className="flex items-center gap-2 text-sm font-medium text-amber-900">
            <KeyRound className="size-4" />
            비밀번호가 설정된 PDF입니다
          </div>
          <p className="text-xs text-amber-800">
            정부24 성적증명서에 설정한 비밀번호를 입력하면, 비밀번호를 풀어 분석합니다.
          </p>
          <Label htmlFor="pdf-password" className="sr-only">
            PDF 비밀번호
          </Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id="pdf-password"
              type="password"
              autoComplete="off"
              placeholder="PDF 비밀번호"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="bg-white"
            />
            <Button type="submit" className="gap-2 sm:w-auto" disabled={isPending}>
              비밀번호 입력 후 분석
            </Button>
          </div>
        </form>
      ) : null}

      {stage === 'done' ? (
        <p className="text-xs text-emerald-700">분석이 완료되었습니다. 결과를 새로고침합니다...</p>
      ) : null}
      {errorMessage ? <p className="text-xs text-red-600">{errorMessage}</p> : null}
    </div>
  )
}
