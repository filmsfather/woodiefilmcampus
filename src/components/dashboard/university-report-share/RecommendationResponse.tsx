'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, CheckCircle2, Loader2, Plus, Search, Send, X } from 'lucide-react'

import {
  confirmRecommendationAction,
  reviseRecommendationAction,
} from '@/app/r/[token]/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type { WishlistCategory } from '@/lib/university-policy/yedae'
import type {
  WishlistCatalogEntry,
  WishlistStatus,
} from '@/lib/university-wishlist/data'

interface RecommendationResponseProps {
  token: string
  status: WishlistStatus
  catalog: WishlistCatalogEntry[]
  existingProgramKeys: string[]
}

const CATEGORY_LABEL: Record<WishlistCategory, string> = {
  general: '일반대',
  specialized: '전문대 · 예대',
  karts: '한예종',
}

const MAX_RESULTS = 20

export default function RecommendationResponse({
  token,
  status,
  catalog,
  existingProgramKeys,
}: RecommendationResponseProps) {
  const router = useRouter()
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<WishlistCatalogEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const existingSet = useMemo(() => new Set(existingProgramKeys), [existingProgramKeys])

  const results = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    const selectedKeys = new Set(selected.map((s) => s.programKey))
    return catalog
      .filter((entry) => !existingSet.has(entry.programKey) && !selectedKeys.has(entry.programKey))
      .filter((entry) => {
        if (keyword.length === 0) return false
        const haystack = `${entry.universityName} ${entry.shortName ?? ''} ${entry.programName} ${entry.admissionTrack}`.toLowerCase()
        return haystack.includes(keyword)
      })
      .slice(0, MAX_RESULTS)
  }, [catalog, existingSet, search, selected])

  if (status === 'confirmed') {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
        <p className="leading-relaxed">
          위 추천 대학으로 지원을 확정했어요. 변경이 필요하면 원장 선생님께 문의해 주세요.
        </p>
      </div>
    )
  }

  if (status === 'revising') {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800">
        <Send className="mt-0.5 size-4 shrink-0 text-sky-600" />
        <p className="leading-relaxed">
          보내주신 질문·희망 대학을 원장 선생님이 확인하고 있어요. 답변이 준비되면 다시 안내해
          드릴게요.
        </p>
      </div>
    )
  }

  const handleConfirm = () => {
    if (isPending) return
    if (!window.confirm('위 추천 대학으로 지원을 확정할까요? 확정 후에는 원장 선생님께 문의해야 변경할 수 있어요.')) {
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await confirmRecommendationAction({ token })
      if ('error' in result) {
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  const handleSend = () => {
    if (isPending) return
    if (message.trim().length === 0 && selected.length === 0) {
      setError('질문을 입력하거나 희망하는 대학을 선택해 주세요.')
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await reviseRecommendationAction({
        token,
        message: message.trim().length > 0 ? message.trim() : undefined,
        programKeys: selected.map((s) => s.programKey),
      })
      if ('error' in result) {
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="space-y-4 rounded-lg border border-[#e3e6db] bg-white p-4">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-[#5a6450]">원장 선생님께 의견 보내기</h3>
        <p className="text-xs leading-relaxed text-slate-500">
          궁금한 점이나 원장 선생님께 묻고 싶은 내용을 자유롭게 적어주세요.
          <br className="hidden sm:block" />
          추천 대학 외에 다른 대학을 희망한다면 아래에서 직접 검색해 선택할 수 있어요.
        </p>
      </div>

      <Textarea
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        placeholder="예) ○○대학교도 지원 가능한지 궁금해요. / 면접 일정이 겹치는데 어떻게 할까요?"
        rows={4}
        disabled={isPending}
        className="resize-none border-[#dfe4d4] bg-[#fbfcf8] text-sm"
      />

      <div className="space-y-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="희망하는 대학·모집단위 검색 (예: 중앙대, 영화)"
            disabled={isPending}
            className="border-[#dfe4d4] bg-[#fbfcf8] pl-8 text-sm"
          />
        </div>

        {search.trim().length > 0 ? (
          results.length > 0 ? (
            <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border border-slate-200 bg-white p-1">
              {results.map((entry) => (
                <button
                  key={entry.programKey}
                  type="button"
                  disabled={isPending}
                  onClick={() => {
                    setSelected((prev) => [...prev, entry])
                    setSearch('')
                  }}
                  className="flex w-full items-start justify-between gap-2 rounded-md px-2 py-2 text-left text-sm transition hover:bg-slate-50 disabled:opacity-50"
                >
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium text-slate-900">{entry.universityName}</span>
                      <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
                        {CATEGORY_LABEL[entry.category]}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-slate-500">
                      {entry.programName}
                      {entry.admissionTrack ? ` · ${entry.admissionTrack}` : ''}
                    </span>
                  </span>
                  <Plus className="mt-0.5 size-4 shrink-0 text-[#8a9472]" />
                </button>
              ))}
            </div>
          ) : (
            <p className="rounded-md border border-dashed border-slate-200 px-2 py-3 text-center text-xs text-slate-400">
              검색 결과가 없어요. 다른 검색어를 입력해 보세요.
            </p>
          )
        ) : null}

        {selected.length > 0 ? (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-slate-500">선택한 희망 대학 {selected.length}개</p>
            <div className="grid gap-1.5">
              {selected.map((entry) => (
                <div
                  key={entry.programKey}
                  className="flex items-center justify-between gap-2 rounded-md border border-[#dfe4d4] bg-[#f7f8f3] px-2.5 py-1.5"
                >
                  <span className="min-w-0">
                    <span className="text-sm font-medium text-slate-900">{entry.universityName}</span>
                    <span className="ml-1.5 truncate text-xs text-slate-500">{entry.programName}</span>
                  </span>
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() =>
                      setSelected((prev) => prev.filter((s) => s.programKey !== entry.programKey))
                    }
                    className="rounded p-0.5 text-slate-400 transition hover:bg-white hover:text-slate-600 disabled:opacity-50"
                    aria-label="선택 취소"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {error ? <p className="text-xs text-rose-600">{error}</p> : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          onClick={handleSend}
          disabled={isPending}
          variant="outline"
          className="flex-1 border-[#8a9472] text-[#5a6450] hover:bg-[#eef0e6]"
        >
          {isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Send className="size-4" />
          )}
          질문 · 희망 대학 보내기
        </Button>
        <Button
          type="button"
          onClick={handleConfirm}
          disabled={isPending}
          className="flex-1 bg-[#5a6450] text-white hover:bg-[#4a5340]"
        >
          {isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Check className="size-4" />
          )}
          이대로 지원 확정
        </Button>
      </div>
    </div>
  )
}
