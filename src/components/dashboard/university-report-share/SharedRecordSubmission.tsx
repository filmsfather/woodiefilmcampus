'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Download, FileText, Loader2, Upload } from 'lucide-react'

import { Button } from '@/components/ui/button'
import type { RecordRequestStatus, WishlistRecordFile } from '@/lib/university-wishlist/data'

const MAX_RECORD_SIZE = 20 * 1024 * 1024 // 20MB

interface SharedRecordSubmissionProps {
  token: string
  recordStatus: RecordRequestStatus
  recordFile: WishlistRecordFile | null
}

/**
 * 공유 링크(/r/[token])에서 학생·학부모가 원장이 요청한 생기부를 업로드해 제출한다.
 * 로그인 없이 접근하므로 토큰 기반 API 라우트로 파일을 전송한다.
 */
export default function SharedRecordSubmission({
  token,
  recordStatus,
  recordFile,
}: SharedRecordSubmissionProps) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; message: string } | null>(null)

  if (recordStatus === 'none') return null

  const handleSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (file.size > MAX_RECORD_SIZE) {
      setFeedback({ kind: 'err', message: '파일 크기는 최대 20MB까지 업로드할 수 있습니다.' })
      if (inputRef.current) inputRef.current.value = ''
      return
    }

    setFeedback(null)
    setIsUploading(true)
    try {
      const formData = new FormData()
      formData.append('token', token)
      formData.append('file', file)

      const res = await fetch('/api/university-wishlist/submit-record-via-token', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json().catch(() => ({}))

      if (!res.ok || data.error) {
        setFeedback({ kind: 'err', message: data.error ?? '생기부 제출에 실패했습니다.' })
        return
      }

      setFeedback({ kind: 'ok', message: '생기부를 제출했습니다.' })
      router.refresh()
    } catch (error) {
      console.error('[shared-record] upload error', error)
      setFeedback({ kind: 'err', message: '생기부 업로드에 실패했습니다. 다시 시도해 주세요.' })
    } finally {
      setIsUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const submitted = recordStatus === 'submitted'

  return (
    <div className="space-y-3 rounded-xl border border-sky-200 bg-sky-50 p-4 sm:p-5">
      <div className="flex items-center gap-2 text-sm font-semibold text-sky-900">
        <FileText className="size-4 shrink-0" />
        생기부(학교생활기록부) 제출
      </div>
      {submitted ? (
        <div className="space-y-2 text-sm text-emerald-800">
          <p className="flex items-center gap-1.5 font-medium">
            <CheckCircle2 className="size-4" />
            생기부를 제출했습니다.
          </p>
          {recordFile?.signedUrl ? (
            <a
              href={recordFile.signedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-sky-700 hover:underline"
            >
              <Download className="size-3.5" />
              {recordFile.name}
            </a>
          ) : null}
          <p className="text-xs text-emerald-700">
            다시 제출하려면 아래에서 파일을 새로 업로드해 주세요.
          </p>
        </div>
      ) : (
        <p className="text-sm leading-relaxed text-sky-900">
          원장 선생님이 생기부 제출을 요청했습니다. 생기부 파일(PDF 또는 이미지)을 업로드해 주세요.
        </p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept=".pdf,image/*"
        className="hidden"
        onChange={handleSelect}
      />
      <Button
        type="button"
        size="sm"
        variant={submitted ? 'outline' : 'default'}
        className="gap-2"
        disabled={isUploading}
        onClick={() => inputRef.current?.click()}
      >
        {isUploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
        {submitted ? '생기부 다시 제출' : '생기부 파일 제출'}
      </Button>

      {feedback ? (
        <p className={`text-xs ${feedback.kind === 'ok' ? 'text-emerald-700' : 'text-red-600'}`}>
          {feedback.message}
        </p>
      ) : null}
    </div>
  )
}
