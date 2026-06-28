'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Clock, Download, FileText, Loader2, Send, ThumbsUp, Upload } from 'lucide-react'

import ProgramPicker from '@/components/dashboard/university-wishlist/ProgramPicker'
import WishlistItems from '@/components/dashboard/university-wishlist/WishlistItems'
import WishlistThread from '@/components/dashboard/university-wishlist/WishlistThread'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { STUDENT_RECORDS_BUCKET } from '@/lib/storage/buckets'
import {
  buildRandomizedFileName,
  uploadFileToStorageViaClient,
} from '@/lib/storage-upload'
import { studentRespondAction, submitStudentRecordAction } from '@/lib/university-wishlist/actions'
import type {
  RecordRequestStatus,
  WishlistCatalogEntry,
  WishlistDetail,
  WishlistItem,
  WishlistRecordFile,
} from '@/lib/university-wishlist/data'

interface StudentWishlistPanelProps {
  studentId: string
  detail: WishlistDetail | null
  catalog: WishlistCatalogEntry[]
}

const MAX_RECORD_SIZE = 20 * 1024 * 1024 // 20MB

function StudentRecordSubmission({
  studentId,
  recordStatus,
  recordFile,
}: {
  studentId: string
  recordStatus: RecordRequestStatus
  recordFile: WishlistRecordFile | null
}) {
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
      const path = `${studentId}/${buildRandomizedFileName(file.name)}`
      const uploaded = await uploadFileToStorageViaClient({
        bucket: STUDENT_RECORDS_BUCKET,
        file,
        path,
        maxSizeBytes: MAX_RECORD_SIZE,
      })

      const result = await submitStudentRecordAction({
        studentId,
        bucket: STUDENT_RECORDS_BUCKET,
        path: uploaded.path,
        fileName: uploaded.originalName,
        mimeType: uploaded.mimeType,
        size: uploaded.size,
      })

      if ('error' in result) {
        setFeedback({ kind: 'err', message: result.error })
        return
      }
      setFeedback({ kind: 'ok', message: '생기부를 제출했습니다.' })
      router.refresh()
    } catch (error) {
      console.error('[university-wishlist] record upload error', error)
      setFeedback({ kind: 'err', message: '생기부 업로드에 실패했습니다. 다시 시도해 주세요.' })
    } finally {
      setIsUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const submitted = recordStatus === 'submitted'

  return (
    <div className="space-y-3 rounded-lg border border-sky-200 bg-sky-50 p-4">
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
        <p className="text-sm text-sky-900">
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

export default function StudentWishlistPanel({
  studentId,
  detail,
  catalog,
}: StudentWishlistPanelProps) {
  const router = useRouter()
  const [message, setMessage] = useState('')
  const [isPending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; message: string } | null>(null)

  const status = detail?.wishlist.status ?? 'none'
  const items = detail?.items ?? []
  const existingKeys = items.map((i) => i.programKey).filter((k): k is string => Boolean(k))
  const recordStatus = detail?.wishlist.recordRequestStatus ?? 'none'
  const recordFile = detail?.recordFile ?? null

  if (!detail || status === 'draft' || status === 'none') {
    return (
      <div className="space-y-5">
        <StudentRecordSubmission
          studentId={studentId}
          recordStatus={recordStatus}
          recordFile={recordFile}
        />
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          아직 원장 선생님이 추천 대학을 보내지 않았습니다. 추천이 도착하면 이곳에서 확인하고 응답할 수
          있어요.
        </div>
      </div>
    )
  }

  const canRespond = status === 'proposed'
  const editable = status === 'proposed' || status === 'revising'
  const canRemove = (item: WishlistItem) => editable && item.proposedBy === 'student'

  const respond = (decision: 'approve' | 'revise') => {
    setFeedback(null)
    startTransition(async () => {
      const result = await studentRespondAction({
        wishlistId: detail.wishlist.id,
        decision,
        message: message.trim() || undefined,
      })
      if ('error' in result) {
        setFeedback({ kind: 'err', message: result.error })
        return
      }
      setMessage('')
      setFeedback({
        kind: 'ok',
        message: decision === 'approve' ? '희망대학을 확정했습니다.' : '의견을 전송했습니다.',
      })
      router.refresh()
    })
  }

  return (
    <div className="space-y-5">
      <StudentRecordSubmission
        studentId={studentId}
        recordStatus={recordStatus}
        recordFile={recordFile}
      />

      {status === 'confirmed' ? (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          <CheckCircle2 className="size-5 shrink-0" />
          <div>
            <p className="font-semibold">희망대학이 확정되었습니다.</p>
            <p className="text-xs text-emerald-700">
              확정된 대학의 모집 일정과 D-day는 곧 학생 대시보드에서 안내될 예정입니다.
            </p>
          </div>
        </div>
      ) : status === 'revising' ? (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <Clock className="size-5 shrink-0" />
          <div>
            <p className="font-semibold">원장 선생님의 답변을 기다리고 있어요.</p>
            <p className="text-xs text-amber-700">
              남긴 의견·질문을 검토한 뒤 다시 추천이 도착하면 확정할 수 있습니다.
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
          원장 선생님이 추천한 대학 목록입니다. 그대로 동의하거나, 희망하는 대학을 직접 추가하고 의견·질문을
          남겨 주세요.
        </div>
      )}

      <WishlistItems items={items} canRemove={canRemove} />

      {editable ? (
        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-500">희망 대학 직접 추가</p>
          <ProgramPicker
            studentId={studentId}
            catalog={catalog}
            existingKeys={existingKeys}
            disabled={!editable}
          />
        </div>
      ) : null}

      <div className="space-y-2">
        <p className="text-xs font-medium text-slate-500">원장 선생님과 주고받은 의견</p>
        <WishlistThread messages={detail.messages} viewerSide="student" />
      </div>

      {canRespond ? (
        <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            className="bg-white text-sm"
            placeholder="의견이나 질문을 적어 주세요. (수정 요청 시 필수)"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              className="gap-2"
              disabled={isPending}
              onClick={() => respond('approve')}
            >
              {isPending ? <Loader2 className="size-4 animate-spin" /> : <ThumbsUp className="size-4" />}
              이대로 동의하고 확정
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-2"
              disabled={isPending || message.trim().length === 0}
              onClick={() => respond('revise')}
            >
              {isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              의견·질문 보내기
            </Button>
          </div>
          <p className="text-xs text-slate-500">
            동의하면 곧바로 희망대학이 확정됩니다. 추가한 대학이나 질문이 있다면 먼저 의견을 보내 주세요.
          </p>
        </div>
      ) : null}

      {feedback ? (
        <p className={`text-xs ${feedback.kind === 'ok' ? 'text-emerald-700' : 'text-red-600'}`}>
          {feedback.message}
        </p>
      ) : null}
    </div>
  )
}
