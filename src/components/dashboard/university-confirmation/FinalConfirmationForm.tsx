'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Loader2, Plus, Search, Sparkles, X } from 'lucide-react'

import { submitFinalConfirmationAction } from '@/app/confirm/[token]/actions'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  WEEKDAY_PREFERENCE_OPTIONS,
  type WeekdayPreference,
} from '@/lib/university-confirmation/constants'
import type {
  FinalConfirmationDetail,
  FinalConfirmationItem,
} from '@/lib/university-confirmation/data'
import type { WishlistCatalogEntry } from '@/lib/university-wishlist/data'

type SlotCategory = 'general' | 'specialized'

interface SelectedProgram {
  programKey: string
  category: SlotCategory
  universityName: string
  shortName: string | null
  programName: string
  admissionTrack: string
}

export interface RecommendedProgram {
  programKey: string
  category: SlotCategory
  universityName: string
  shortName: string | null
  programName: string
  admissionTrack: string
}

export interface FinalConfirmationRecommendation {
  general: RecommendedProgram[]
  specialized: RecommendedProgram[]
  karts: boolean
}

interface FinalConfirmationFormProps {
  token: string
  detail: FinalConfirmationDetail
  catalog: WishlistCatalogEntry[]
  recommendation?: FinalConfirmationRecommendation | null
}

const GENERAL_SLOTS = 6
const SPECIALIZED_SLOTS = 4
const MAX_RESULTS = 20

function fromEntry(entry: WishlistCatalogEntry): SelectedProgram {
  return {
    programKey: entry.programKey,
    category: entry.category === 'specialized' ? 'specialized' : 'general',
    universityName: entry.universityName,
    shortName: entry.shortName,
    programName: entry.programName,
    admissionTrack: entry.admissionTrack,
  }
}

function fromRecommended(rec: RecommendedProgram): SelectedProgram {
  return {
    programKey: rec.programKey,
    category: rec.category,
    universityName: rec.universityName,
    shortName: rec.shortName,
    programName: rec.programName,
    admissionTrack: rec.admissionTrack,
  }
}

function initSlots(
  items: FinalConfirmationItem[],
  count: number,
  category: SlotCategory
): (SelectedProgram | null)[] {
  const slots: (SelectedProgram | null)[] = Array(count).fill(null)
  items
    .filter((item) => item.programKey)
    .slice(0, count)
    .forEach((item, index) => {
      slots[index] = {
        programKey: item.programKey as string,
        category,
        universityName: item.universityName,
        shortName: item.shortName,
        programName: item.programName,
        admissionTrack: item.admissionTrack,
      }
    })
  return slots
}

export default function FinalConfirmationForm({
  token,
  detail,
  catalog,
  recommendation,
}: FinalConfirmationFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(detail.confirmation.status === 'confirmed')

  const [generalSlots, setGeneralSlots] = useState<(SelectedProgram | null)[]>(() =>
    initSlots(detail.generalItems, GENERAL_SLOTS, 'general')
  )
  const [specializedSlots, setSpecializedSlots] = useState<(SelectedProgram | null)[]>(() =>
    initSlots(detail.specializedItems, SPECIALIZED_SLOTS, 'specialized')
  )

  const [kartsApply, setKartsApply] = useState(detail.confirmation.kartsApply)
  const [weekdays, setWeekdays] = useState<Set<WeekdayPreference>>(
    () =>
      new Set(
        detail.confirmation.weekdayPreferences.filter((value): value is WeekdayPreference =>
          WEEKDAY_PREFERENCE_OPTIONS.some((option) => option.value === value)
        )
      )
  )

  const usedKeys = useMemo(() => {
    const keys = new Set<string>()
    for (const slot of generalSlots) if (slot) keys.add(slot.programKey)
    for (const slot of specializedSlots) if (slot) keys.add(slot.programKey)
    return keys
  }, [generalSlots, specializedSlots])

  const toggleWeekday = (value: WeekdayPreference) => {
    setWeekdays((prev) => {
      const next = new Set(prev)
      if (next.has(value)) next.delete(value)
      else next.add(value)
      return next
    })
  }

  // 원장 추천 대학을 빈 슬롯에 그대로 담는다(중복은 건너뜀).
  const applyRecommendation = () => {
    if (!recommendation) return
    setError(null)
    const fillInto = (
      setter: typeof setGeneralSlots,
      recs: RecommendedProgram[]
    ) => {
      setter((prev) => {
        const next = [...prev]
        const already = new Set(next.filter(Boolean).map((s) => s!.programKey))
        for (const rec of recs) {
          if (already.has(rec.programKey)) continue
          const emptyIndex = next.findIndex((s) => s === null)
          if (emptyIndex === -1) break
          next[emptyIndex] = fromRecommended(rec)
          already.add(rec.programKey)
        }
        return next
      })
    }
    fillInto(setGeneralSlots, recommendation.general)
    fillInto(setSpecializedSlots, recommendation.specialized)
    if (recommendation.karts) setKartsApply(true)
  }

  const handleSubmit = () => {
    if (isPending) return
    if (weekdays.size === 0) {
      setError('수업 희망 요일을 최소 1개 선택해 주세요.')
      return
    }
    if (
      !window.confirm(
        '입력한 내용으로 지원 대학을 최종 확정할까요? 확정 후에도 이 링크에서 다시 수정할 수 있습니다.'
      )
    ) {
      return
    }
    setError(null)
    const programKeys = [...generalSlots, ...specializedSlots]
      .filter((s): s is SelectedProgram => Boolean(s))
      .map((s) => s.programKey)
    startTransition(async () => {
      const result = await submitFinalConfirmationAction({
        token,
        programKeys,
        kartsApply,
        weekdayPreferences: Array.from(weekdays),
      })
      if ('error' in result) {
        setError(result.error)
        return
      }
      setDone(true)
      router.refresh()
    })
  }

  const hasRecommendation =
    recommendation &&
    (recommendation.general.length > 0 ||
      recommendation.specialized.length > 0 ||
      recommendation.karts)

  return (
    <div className="space-y-5">
      {done ? (
        <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
          <p className="leading-relaxed">
            지원 대학이 최종 확정되었습니다. 내용을 바꾸려면 아래에서 수정한 뒤 다시 확정해 주세요.
          </p>
        </div>
      ) : null}

      {/* 원장 추천 대학 안내 */}
      {hasRecommendation ? (
        <Card className="border-sky-200 bg-sky-50/60 shadow-sm">
          <CardContent className="space-y-3 py-4">
            <div className="flex items-center gap-1.5">
              <Sparkles className="size-4 text-sky-600" />
              <p className="text-sm font-semibold text-sky-900">원장 선생님 추천 대학</p>
            </div>
            <p className="text-xs text-sky-800/80">
              컨설팅에서 원장 선생님이 추천한 대학이에요. 아래에서 실제 지원할 대학을 직접 선택해
              주세요.
            </p>
            <div className="space-y-1.5">
              {recommendation!.general.length > 0 ? (
                <RecommendationLine label="일반대" items={recommendation!.general} />
              ) : null}
              {recommendation!.specialized.length > 0 ? (
                <RecommendationLine label="전문대·예대" items={recommendation!.specialized} />
              ) : null}
              {recommendation!.karts ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="w-16 shrink-0 text-xs font-medium text-sky-900">한예종</span>
                  <Badge className="bg-violet-100 text-violet-700">지원 추천</Badge>
                </div>
              ) : null}
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isPending}
              onClick={applyRecommendation}
              className="gap-1.5 border-sky-300 bg-white text-sky-700 hover:bg-sky-50"
            >
              <Plus className="size-3.5" />
              추천 대학 그대로 담기
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {/* 수시 6장 · 일반대 (6칸 슬롯) */}
      <SlotSection
        title="수시 6장 · 일반대"
        description="수시 6장에 지원할 4년제 일반대학을 각 칸에 선택하세요."
        searchPlaceholder="일반대 검색 (예: 중앙대, 영화)"
        category="general"
        slots={generalSlots}
        setSlots={setGeneralSlots}
        catalog={catalog}
        usedKeys={usedKeys}
        disabled={isPending}
      />

      {/* 전문대 · 예대 (4칸 슬롯) */}
      <SlotSection
        title="전문대 · 예대"
        description="수시 6장과 별개로 추가 지원할 전문대·예대를 각 칸에 선택하세요."
        searchPlaceholder="전문대·예대 검색 (예: 서울예대, 연기)"
        category="specialized"
        slots={specializedSlots}
        setSlots={setSpecializedSlots}
        catalog={catalog}
        usedKeys={usedKeys}
        disabled={isPending}
      />

      {/* 한예종 지원 여부 */}
      <Card className="border-slate-200 shadow-sm">
        <CardContent className="py-4">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={kartsApply}
              onChange={(event) => setKartsApply(event.target.checked)}
              disabled={isPending}
              className="mt-0.5 size-4 cursor-pointer rounded border-slate-300"
            />
            <span>
              <span className="block text-sm font-semibold text-slate-800">한예종 지원</span>
              <span className="mt-0.5 block text-xs text-slate-500">
                한국예술종합학교(한예종)에 지원할 예정이면 체크해 주세요.
              </span>
            </span>
          </label>
        </CardContent>
      </Card>

      {/* 수업 희망 요일 */}
      <Card className="border-slate-200 shadow-sm">
        <CardContent className="space-y-3 py-4">
          <div>
            <p className="text-sm font-semibold text-slate-800">
              수업 희망 요일 <span className="text-rose-500">*</span>
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              희망하는 반을 모두 선택해 주세요. (중복 선택 가능)
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {WEEKDAY_PREFERENCE_OPTIONS.map((option) => {
              const active = weekdays.has(option.value)
              return (
                <label
                  key={option.value}
                  className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 transition ${
                    active ? 'border-sky-400 bg-sky-50' : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={() => toggleWeekday(option.value)}
                    disabled={isPending}
                    className="mt-0.5 size-4 cursor-pointer rounded border-slate-300"
                  />
                  <span>
                    <span className="block text-sm font-medium text-slate-800">{option.label}</span>
                    <span className="mt-0.5 block text-xs text-slate-500">{option.schedule}</span>
                  </span>
                </label>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      <Button
        type="button"
        onClick={handleSubmit}
        disabled={isPending}
        className="w-full gap-2"
        size="lg"
      >
        {isPending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
        {done ? '수정 후 다시 확정하기' : '지원 대학 최종 확정'}
      </Button>
    </div>
  )
}

interface SlotSectionProps {
  title: string
  description: string
  searchPlaceholder: string
  category: SlotCategory
  slots: (SelectedProgram | null)[]
  setSlots: React.Dispatch<React.SetStateAction<(SelectedProgram | null)[]>>
  catalog: WishlistCatalogEntry[]
  usedKeys: Set<string>
  disabled: boolean
}

function SlotSection({
  title,
  description,
  searchPlaceholder,
  category,
  slots,
  setSlots,
  catalog,
  usedKeys,
  disabled,
}: SlotSectionProps) {
  const [activeSlot, setActiveSlot] = useState<number | null>(null)
  const [search, setSearch] = useState('')

  const filledCount = slots.filter(Boolean).length

  const results = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    if (keyword.length === 0) return []
    return catalog
      .filter((entry) => entry.category === category)
      .filter((entry) => !usedKeys.has(entry.programKey))
      .filter((entry) => {
        const haystack =
          `${entry.universityName} ${entry.shortName ?? ''} ${entry.programName} ${entry.admissionTrack}`.toLowerCase()
        return haystack.includes(keyword)
      })
      .slice(0, MAX_RESULTS)
  }, [catalog, category, search, usedKeys])

  const openSlot = (index: number) => {
    setActiveSlot((prev) => (prev === index ? null : index))
    setSearch('')
  }

  const fillSlot = (index: number, entry: WishlistCatalogEntry) => {
    setSlots((prev) => {
      const next = [...prev]
      next[index] = fromEntry(entry)
      return next
    })
    setActiveSlot(null)
    setSearch('')
  }

  const clearSlot = (index: number) => {
    setSlots((prev) => {
      const next = [...prev]
      next[index] = null
      return next
    })
    setActiveSlot((prev) => (prev === index ? null : prev))
  }

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardContent className="space-y-3 py-4">
        <div>
          <p className="text-sm font-semibold text-slate-800">{title}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            {description} ({filledCount}/{slots.length})
          </p>
        </div>
        <div className="space-y-2">
          {slots.map((slot, index) => (
            <div key={index} className="rounded-lg border border-slate-200">
              <div className="flex items-center gap-2 px-3 py-2">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-500">
                  {index + 1}
                </span>
                {slot ? (
                  <>
                    <span className="min-w-0 flex-1">
                      <span className="text-sm font-medium text-slate-900">
                        {slot.shortName ?? slot.universityName}
                      </span>
                      <span className="ml-1.5 text-xs text-slate-500">
                        {slot.programName}
                        {slot.admissionTrack ? ` · ${slot.admissionTrack}` : ''}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => openSlot(index)}
                      disabled={disabled}
                      className="rounded px-2 py-1 text-xs text-slate-500 transition hover:bg-slate-100 disabled:opacity-50"
                    >
                      변경
                    </button>
                    <button
                      type="button"
                      onClick={() => clearSlot(index)}
                      disabled={disabled}
                      className="rounded p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
                      aria-label="선택 취소"
                    >
                      <X className="size-4" />
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => openSlot(index)}
                    disabled={disabled}
                    className="flex flex-1 items-center gap-1.5 text-left text-sm text-slate-400 transition hover:text-slate-600 disabled:opacity-50"
                  >
                    <Plus className="size-4" />
                    대학 선택
                  </button>
                )}
              </div>

              {activeSlot === index ? (
                <div className="space-y-1 border-t border-slate-100 p-2">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      autoFocus
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder={searchPlaceholder}
                      disabled={disabled}
                      className="pl-8 text-sm"
                    />
                  </div>
                  {search.trim().length > 0 ? (
                    results.length > 0 ? (
                      <div className="max-h-52 space-y-1 overflow-y-auto rounded-md border border-slate-200 bg-white p-1">
                        {results.map((entry) => (
                          <button
                            key={entry.programKey}
                            type="button"
                            disabled={disabled}
                            onClick={() => fillSlot(index, entry)}
                            className="flex w-full items-start justify-between gap-2 rounded-md px-2 py-2 text-left text-sm transition hover:bg-slate-50 disabled:opacity-50"
                          >
                            <span className="min-w-0">
                              <span className="font-medium text-slate-900">
                                {entry.universityName}
                              </span>
                              <span className="mt-0.5 block truncate text-xs text-slate-500">
                                {entry.programName}
                                {entry.admissionTrack ? ` · ${entry.admissionTrack}` : ''}
                              </span>
                            </span>
                            <Plus className="mt-0.5 size-4 shrink-0 text-slate-400" />
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="px-2 py-2 text-center text-xs text-slate-400">
                        검색 결과가 없어요.
                      </p>
                    )
                  ) : null}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function RecommendationLine({
  label,
  items,
}: {
  label: string
  items: RecommendedProgram[]
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-16 shrink-0 text-xs font-medium text-sky-900">{label}</span>
      {items.map((item) => (
        <Badge key={item.programKey} variant="outline" className="border-sky-200 bg-white text-sky-800">
          {item.shortName ?? item.universityName}
          <span className="ml-1 font-normal opacity-70">· {item.programName}</span>
        </Badge>
      ))}
    </div>
  )
}
