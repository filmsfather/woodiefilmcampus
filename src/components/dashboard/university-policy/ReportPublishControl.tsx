'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { EyeOff, Loader2, Send } from 'lucide-react'

import {
  publishReportAction,
  revokeReportAction,
} from '@/app/dashboard/principal/university-reports/[studentId]/analysis/actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

interface ReportPublishControlProps {
  studentId: string
  publication: {
    id: string
    status: 'published' | 'revoked'
    publishedAt: string
    principalComment: string | null
  } | null
}

function formatDateTime(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function ReportPublishControl({
  studentId,
  publication,
}: ReportPublishControlProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [comment, setComment] = useState(publication?.principalComment ?? '')
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; message: string } | null>(null)

  const isPublished = publication?.status === 'published'

  const handlePublish = () => {
    setFeedback(null)
    startTransition(async () => {
      const result = await publishReportAction({ studentId, comment })
      if ('error' in result) {
        setFeedback({ kind: 'err', message: result.error })
        return
      }
      setFeedback({ kind: 'ok', message: '학생에게 공개되었습니다.' })
      router.refresh()
    })
  }

  const handleRevoke = () => {
    if (!publication) return
    setFeedback(null)
    startTransition(async () => {
      const result = await revokeReportAction({ publicationId: publication.id, studentId })
      if ('error' in result) {
        setFeedback({ kind: 'err', message: result.error })
        return
      }
      setFeedback({ kind: 'ok', message: '비공개 처리되었습니다.' })
      router.refresh()
    })
  }

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-800">학생·학부모 공개</span>
          {isPublished ? (
            <Badge className="bg-emerald-100 text-emerald-700">공개됨</Badge>
          ) : (
            <Badge className="bg-slate-200 text-slate-600">비공개</Badge>
          )}
        </div>
        {isPublished && publication ? (
          <span className="text-xs text-slate-500">
            {formatDateTime(publication.publishedAt)} 공개
          </span>
        ) : null}
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-slate-500">
          학생에게 보여줄 한 줄 총평 (선택)
        </label>
        <Textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="예) 안정·적정 위주로 6장을 구성하고, 예대군은 모두 지원해 보자."
          rows={2}
          className="bg-white text-sm"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={handlePublish} disabled={isPending} size="sm" className="gap-2">
          {isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          {isPublished ? '다시 공개 (총평 갱신)' : '학생에게 공개'}
        </Button>
        {isPublished ? (
          <Button
            onClick={handleRevoke}
            disabled={isPending}
            size="sm"
            variant="outline"
            className="gap-2"
          >
            <EyeOff className="size-4" />
            비공개로 전환
          </Button>
        ) : null}
      </div>

      {feedback ? (
        <p className={`text-xs ${feedback.kind === 'ok' ? 'text-emerald-700' : 'text-red-600'}`}>
          {feedback.message}
        </p>
      ) : null}
    </div>
  )
}
