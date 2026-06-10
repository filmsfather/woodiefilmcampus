'use client'

import { useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { GraduationCap, Loader2, Sparkles, X } from 'lucide-react'

import { removeWishlistItemAction } from '@/lib/university-wishlist/actions'
import type { WishlistItem } from '@/lib/university-wishlist/data'
import { Badge } from '@/components/ui/badge'

interface WishlistItemsProps {
  items: WishlistItem[]
  /** 삭제 가능한 항목 판정. 없으면 삭제 버튼을 숨긴다. */
  canRemove?: (item: WishlistItem) => boolean
  /** 일반대 목표 개수 안내(기본 6). */
  generalLimit?: number
  emptyHint?: string
}

function ItemCard({
  item,
  removable,
  onRemoved,
}: {
  item: WishlistItem
  removable: boolean
  onRemoved: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const handleRemove = () => {
    setError(null)
    startTransition(async () => {
      const result = await removeWishlistItemAction({ itemId: item.id })
      if ('error' in result) {
        setError(result.error)
        return
      }
      onRemoved()
    })
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-0.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-medium text-slate-900">{item.universityName}</span>
            {item.proposedBy === 'student' ? (
              <Badge className="bg-indigo-100 text-indigo-700">학생 추천</Badge>
            ) : (
              <Badge className="bg-sky-100 text-sky-700">원장 추천</Badge>
            )}
          </div>
          <p className="truncate text-xs text-slate-500">
            {item.programName}
            {item.admissionTrack ? ` · ${item.admissionTrack}` : ''}
            {item.programYear ? ` · ${item.programYear}학년도` : ''}
            {item.region ? ` · ${item.region}` : ''}
          </p>
          {item.note ? <p className="text-xs text-slate-600">메모: {item.note}</p> : null}
          {error ? <p className="text-xs text-red-600">{error}</p> : null}
        </div>
        {removable ? (
          <button
            type="button"
            onClick={handleRemove}
            disabled={isPending}
            aria-label="삭제"
            className="shrink-0 rounded-md p-1 text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
          >
            {isPending ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />}
          </button>
        ) : null}
      </div>
    </div>
  )
}

function Group({
  title,
  icon,
  hint,
  items,
  canRemove,
  onChanged,
}: {
  title: string
  icon: ReactNode
  hint: string
  items: WishlistItem[]
  canRemove?: (item: WishlistItem) => boolean
  onChanged: () => void
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {icon}
        <h4 className="text-sm font-semibold text-slate-900">{title}</h4>
        <span className="text-xs text-slate-400">{hint}</span>
      </div>
      {items.length === 0 ? (
        <p className="rounded-md border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-400">
          아직 선택된 대학이 없습니다.
        </p>
      ) : (
        <div className="grid gap-2">
          {items.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              removable={canRemove ? canRemove(item) : false}
              onRemoved={onChanged}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default function WishlistItems({
  items,
  canRemove,
  generalLimit = 6,
}: WishlistItemsProps) {
  const router = useRouter()
  const general = items.filter((i) => i.category === 'general')
  const specialized = items.filter((i) => i.category === 'specialized')
  const onChanged = () => router.refresh()

  return (
    <div className="space-y-4">
      <Group
        title="일반대 (4년제)"
        icon={<GraduationCap className="size-4 text-sky-600" />}
        hint={`${general.length} / ${generalLimit}개`}
        items={general}
        canRemove={canRemove}
        onChanged={onChanged}
      />
      <Group
        title="전문대 · 예대 (추가 지원)"
        icon={<Sparkles className="size-4 text-amber-600" />}
        hint={`${specialized.length}개`}
        items={specialized}
        canRemove={canRemove}
        onChanged={onChanged}
      />
    </div>
  )
}
