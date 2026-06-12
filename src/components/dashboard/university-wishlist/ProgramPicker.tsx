'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2, Plus, Search, X } from 'lucide-react'

import { tierStyle } from '@/components/dashboard/university-report-share/tier-styles'
import { addWishlistItemAction } from '@/lib/university-wishlist/actions'
import type { VerdictTier } from '@/lib/university-policy/types'
import type { WishlistCatalogEntry } from '@/lib/university-wishlist/data'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'

// 모집단위 정렬 순서: 위험 → 도전 → 적정 → 안정(이후 부적합·문의·미상).
const PICKER_TIER_ORDER: Record<VerdictTier, number> = {
  risk: 0,
  reach: 1,
  fit: 2,
  safe: 3,
  unfit: 4,
  consult: 5,
  unknown: 6,
}

interface ProgramPickerProps {
  studentId: string
  catalog: WishlistCatalogEntry[]
  existingKeys: string[]
  disabled?: boolean
  /** 학생 분석 결과의 모집단위별 판정(안정/적정/도전 등). 있으면 목록에 배지로 표시·정렬한다. */
  verdictByProgramKey?: Record<string, VerdictTier>
  /** 학생이 공유 링크에서 분류한 모집단위별 희망 여부(true=지원 희망, false=희망하지 않음). */
  wishByProgramKey?: Record<string, boolean>
}

export default function ProgramPicker({
  studentId,
  catalog,
  existingKeys,
  disabled = false,
  verdictByProgramKey,
  wishByProgramKey,
}: ProgramPickerProps) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [pendingKey, setPendingKey] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const existing = useMemo(() => new Set(existingKeys), [existingKeys])

  const filtered = useMemo(() => {
    const lc = search.trim().toLowerCase()
    const list = lc.length === 0
      ? catalog
      : catalog.filter((c) =>
          `${c.universityName} ${c.shortName ?? ''} ${c.programName} ${c.admissionTrack} ${c.region ?? ''}`
            .toLowerCase()
            .includes(lc)
        )

    const needsSort = Boolean(verdictByProgramKey) || Boolean(wishByProgramKey)
    if (!needsSort) {
      return list.slice(0, 40)
    }

    // 학생이 "지원 희망"으로 고른 모집단위를 먼저, 그다음 판정 순(위험→도전→적정→안정)으로 노출한다.
    const wishRank = (key: string) => {
      const wish = wishByProgramKey?.[key]
      if (wish === true) return 0
      if (wish === false) return 1
      return 2
    }
    const tierRank = (key: string) => {
      const tier = verdictByProgramKey?.[key]
      return tier ? PICKER_TIER_ORDER[tier] : Number.MAX_SAFE_INTEGER
    }
    return [...list]
      .sort((a, b) => {
        const wishDiff = wishRank(a.programKey) - wishRank(b.programKey)
        if (wishDiff !== 0) return wishDiff
        return tierRank(a.programKey) - tierRank(b.programKey)
      })
      .slice(0, 40)
  }, [catalog, search, verdictByProgramKey, wishByProgramKey])

  const handleAdd = (programKey: string) => {
    if (disabled) return
    setError(null)
    setPendingKey(programKey)
    startTransition(async () => {
      const result = await addWishlistItemAction({ studentId, programKey })
      setPendingKey(null)
      if ('error' in result) {
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
        <Input
          placeholder="대학명·모집단위·지역으로 검색"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
          disabled={disabled}
        />
      </div>

      {error ? <p className="text-xs text-red-600">{error}</p> : null}

      <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border border-slate-200 bg-white p-1 pr-2.5">
        {filtered.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-slate-400">검색 결과가 없습니다.</p>
        ) : (
          filtered.map((c) => {
            const added = existing.has(c.programKey)
            const loading = isPending && pendingKey === c.programKey
            const tier = verdictByProgramKey?.[c.programKey]
            const studentWish = wishByProgramKey?.[c.programKey]
            return (
              <button
                key={c.programKey}
                type="button"
                disabled={disabled || added || loading}
                onClick={() => handleAdd(c.programKey)}
                className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-left text-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium text-slate-900">{c.universityName}</span>
                    {tier ? (
                      <Badge className={tierStyle(tier).badge}>{tierStyle(tier).label}</Badge>
                    ) : null}
                    {studentWish === true ? (
                      <Badge className="gap-0.5 bg-emerald-100 text-emerald-700">
                        <Check className="size-3" />
                        학생 희망
                      </Badge>
                    ) : studentWish === false ? (
                      <Badge className="gap-0.5 bg-slate-100 text-slate-500">
                        <X className="size-3" />
                        희망 안 함
                      </Badge>
                    ) : null}
                    <Badge
                      variant="outline"
                      className={
                        c.category === 'specialized'
                          ? 'border-amber-200 text-amber-700'
                          : c.category === 'karts'
                            ? 'border-violet-200 text-violet-700'
                            : 'border-sky-200 text-sky-700'
                      }
                    >
                      {c.category === 'specialized'
                        ? '전문대·예대'
                        : c.category === 'karts'
                          ? '한예종(추가)'
                          : '일반대'}
                    </Badge>
                  </span>
                  <span className="block truncate text-xs text-slate-500">
                    {c.programName} · {c.admissionTrack} · {c.year}학년도
                  </span>
                </span>
                <span className="shrink-0 text-slate-400">
                  {loading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : added ? (
                    <span className="text-xs text-emerald-600">추가됨</span>
                  ) : (
                    <Plus className="size-4" />
                  )}
                </span>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
