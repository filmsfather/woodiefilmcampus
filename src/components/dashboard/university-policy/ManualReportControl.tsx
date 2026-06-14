'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { EyeOff, Loader2, Send } from 'lucide-react'

import {
  publishManualReportAction,
  revokeReportAction,
} from '@/app/dashboard/principal/university-reports/[studentId]/analysis/actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'

interface ManualReportControlProps {
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

export default function ManualReportControl({
  studentId,
  publication,
}: ManualReportControlProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [comment, setComment] = useState(publication?.principalComment ?? '')
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; message: string } | null>(null)

  const isPublished = publication?.status === 'published'

  const handlePublish = () => {
    setFeedback(null)
    startTransition(async () => {
      const result = await publishManualReportAction({ studentId, comment })
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
    <Card className="border-slate-200 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-base font-semibold text-slate-900">
          수동 리포트 발행
          {isPublished ? (
            <Badge className="bg-emerald-100 text-emerald-700">공개됨</Badge>
          ) : (
            <Badge className="bg-slate-200 text-slate-600">비공개</Badge>
          )}
        </CardTitle>
        {isPublished && publication ? (
          <span className="text-xs text-slate-500">{formatDateTime(publication.publishedAt)} 공개</span>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-slate-600">
          성적증명서가 없는 학생(검정고시 등)에게는 자동 분석 대신 원장님이 직접 작성한 리포트를
          공개합니다. 아래 내용이 학생·학부모 화면에 그대로 표시됩니다.
        </p>
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-500">학생에게 전달할 리포트 내용</label>
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="예) 검정고시 성적과 실기 준비 상황을 고려해 지원 가능한 대학과 전략을 안내합니다..."
            rows={6}
            className="bg-white text-sm"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={handlePublish} disabled={isPending} size="sm" className="gap-2">
            {isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            {isPublished ? '다시 공개 (내용 갱신)' : '학생에게 공개'}
          </Button>
          {isPublished ? (
            <Button onClick={handleRevoke} disabled={isPending} size="sm" variant="outline" className="gap-2">
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
      </CardContent>
    </Card>
  )
}
