'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Loader2, RotateCcw, Send } from 'lucide-react'

import ProgramPicker from '@/components/dashboard/university-wishlist/ProgramPicker'
import WishlistItems from '@/components/dashboard/university-wishlist/WishlistItems'
import WishlistThread from '@/components/dashboard/university-wishlist/WishlistThread'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  principalReplyAction,
  proposeWishlistAction,
  reopenWishlistAction,
} from '@/lib/university-wishlist/actions'
import {
  WISHLIST_STATUS_LABELS,
  type WishlistCatalogEntry,
  type WishlistDetail,
} from '@/lib/university-wishlist/data'
import type { VerdictTier } from '@/lib/university-policy/types'

interface PrincipalWishlistPanelProps {
  studentId: string
  detail: WishlistDetail | null
  catalog: WishlistCatalogEntry[]
  verdictByProgramKey?: Record<string, VerdictTier>
}

function StatusBadge({ status }: { status: WishlistDetail['wishlist']['status'] | 'none' }) {
  const map: Record<string, string> = {
    none: 'bg-slate-200 text-slate-600',
    draft: 'bg-slate-200 text-slate-600',
    proposed: 'bg-sky-100 text-sky-700',
    revising: 'bg-amber-100 text-amber-800',
    confirmed: 'bg-emerald-100 text-emerald-700',
  }
  const label = status === 'none' ? '추천 시작 전' : WISHLIST_STATUS_LABELS[status]
  return <Badge className={map[status] ?? map.none}>{label}</Badge>
}

export default function PrincipalWishlistPanel({
  studentId,
  detail,
  catalog,
  verdictByProgramKey,
}: PrincipalWishlistPanelProps) {
  const router = useRouter()
  const [message, setMessage] = useState('')
  const [isPending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; message: string } | null>(null)

  const status = detail?.wishlist.status ?? 'none'
  const items = detail?.items ?? []
  const existingKeys = items.map((i) => i.programKey).filter((k): k is string => Boolean(k))
  const editable = status !== 'confirmed'

  const run = (
    fn: () => Promise<{ success: true } | { error: string }>,
    okMessage: string,
    clearMessage = false
  ) => {
    setFeedback(null)
    startTransition(async () => {
      const result = await fn()
      if ('error' in result) {
        setFeedback({ kind: 'err', message: result.error })
        return
      }
      setFeedback({ kind: 'ok', message: okMessage })
      if (clearMessage) setMessage('')
      router.refresh()
    })
  }

  return (
    <div className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-800">희망대학 선정 협의</h3>
          <StatusBadge status={status} />
        </div>
        <span className="text-xs text-slate-500">
          일반대 {detail?.generalCount ?? 0} / 6 · 전문대 {detail?.specializedCount ?? 0}
        </span>
      </div>

      {editable ? (
        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-500">추천 대학 추가 (검색 후 선택)</p>
          <ProgramPicker
            studentId={studentId}
            catalog={catalog}
            existingKeys={existingKeys}
            verdictByProgramKey={verdictByProgramKey}
          />
        </div>
      ) : null}

      <WishlistItems
        items={items}
        canRemove={editable ? () => true : undefined}
      />

      {detail && detail.messages.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-500">의견·질문</p>
          <WishlistThread messages={detail.messages} viewerSide="staff" />
        </div>
      ) : null}

      {status === 'confirmed' ? (
        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-700">
            <CheckCircle2 className="size-4" />
            학생이 희망대학을 확정했습니다.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            disabled={isPending}
            onClick={() => run(() => reopenWishlistAction({ studentId }), '재검토를 위해 다시 열었습니다.')}
          >
            {isPending ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
            재검토 열기
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={2}
            className="bg-white text-sm"
            placeholder={
              status === 'revising'
                ? '학생 질문에 대한 답변을 입력해 주세요.'
                : '학생에게 전할 안내 메시지 (선택)'
            }
          />
          <div className="flex flex-wrap items-center gap-2">
            {status === 'revising' ? (
              <Button
                type="button"
                size="sm"
                className="gap-2"
                disabled={isPending || message.trim().length === 0}
                onClick={() =>
                  run(
                    () => principalReplyAction({ studentId, message }),
                    '답변을 전송했습니다.',
                    true
                  )
                }
              >
                {isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                답변 보내기
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                className="gap-2"
                disabled={isPending || items.length === 0}
                onClick={() =>
                  run(
                    () => proposeWishlistAction({ studentId, message: message.trim() || undefined }),
                    '학생에게 추천을 전송했습니다.',
                    true
                  )
                }
              >
                {isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                {status === 'proposed' ? '추천 다시 전송' : '학생에게 추천 전송'}
              </Button>
            )}
          </div>
        </div>
      )}

      {feedback ? (
        <p className={`text-xs ${feedback.kind === 'ok' ? 'text-emerald-700' : 'text-red-600'}`}>
          {feedback.message}
        </p>
      ) : null}
    </div>
  )
}
