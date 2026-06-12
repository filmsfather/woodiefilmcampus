'use client'

import { useMemo, useState, useTransition } from 'react'
import { ArrowLeft, ArrowRight, Check, Loader2, X } from 'lucide-react'

import { submitUniversityWishesAction } from '@/app/r/[token]/actions'
import { Button } from '@/components/ui/button'
import type { ReportUniversityItem } from '@/lib/university-policy/report-view'

interface ClassificationSummaryProps {
  token: string
  items: ReportUniversityItem[]
  wishes: Record<string, boolean>
  onBack: () => void
  onSubmitted: () => void
}

function ItemRow({ item }: { item: ReportUniversityItem }) {
  return (
    <li className="flex items-baseline justify-between gap-2 py-1.5 text-sm">
      <span className="font-medium text-slate-800">{item.universityName}</span>
      <span className="shrink-0 text-xs text-slate-500">
        {item.programName}
        {item.programTrack ? ` · ${item.programTrack}` : ''}
      </span>
    </li>
  )
}

export default function ClassificationSummary({
  token,
  items,
  wishes,
  onBack,
  onSubmitted,
}: ClassificationSummaryProps) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const { wished, notWished } = useMemo(() => {
    const wishedItems: ReportUniversityItem[] = []
    const notWishedItems: ReportUniversityItem[] = []
    for (const item of items) {
      if (wishes[item.id]) wishedItems.push(item)
      else notWishedItems.push(item)
    }
    return { wished: wishedItems, notWished: notWishedItems }
  }, [items, wishes])

  const handleSubmit = () => {
    setError(null)
    startTransition(async () => {
      const payload = {
        token,
        wishes: items.map((item) => ({
          evaluationId: item.id,
          wish: Boolean(wishes[item.id]),
          universityId: item.universityId,
          universityName: item.universityName,
          programName: item.programName,
          programTrack: item.programTrack,
          tier: item.tier,
        })),
      }
      const result = await submitUniversityWishesAction(payload)
      if ('error' in result) {
        setError(result.error)
        return
      }
      onSubmitted()
    })
  }

  return (
    <main className="flex min-h-dvh flex-col items-center bg-white px-4 py-8 sm:py-12">
      <div className="flex w-full max-w-2xl flex-col gap-6">
        <div className="space-y-1 text-center">
          <p className="text-xs font-medium uppercase tracking-wide text-[#8a9472]">분류 결과 확인</p>
          <h2 className="text-xl font-semibold tracking-tight text-[#5a6450] sm:text-2xl">
            선택하신 내용을 확인해 주세요
          </h2>
          <p className="pt-1 text-sm text-slate-500">
            제출하시면 원장 선생님이 이 내용을 바탕으로 컨설팅을 준비합니다.
          </p>
        </div>

        <div className="overflow-hidden rounded-xl border border-emerald-200 bg-white">
          <div className="flex items-center gap-2 border-b border-emerald-100 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800">
            <Check className="size-4" />
            지원 희망 {wished.length}곳
          </div>
          <div className="px-4">
            {wished.length > 0 ? (
              <ul className="divide-y divide-slate-100">
                {wished.map((item) => (
                  <ItemRow key={item.id} item={item} />
                ))}
              </ul>
            ) : (
              <p className="py-3 text-sm text-slate-400">아직 지원 희망으로 선택한 대학이 없어요.</p>
            )}
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-600">
            <X className="size-4" />
            희망하지 않음 {notWished.length}곳
          </div>
          <div className="px-4">
            {notWished.length > 0 ? (
              <ul className="divide-y divide-slate-100">
                {notWished.map((item) => (
                  <ItemRow key={item.id} item={item} />
                ))}
              </ul>
            ) : (
              <p className="py-3 text-sm text-slate-400">희망하지 않음으로 선택한 대학이 없어요.</p>
            )}
          </div>
        </div>

        {error ? <p className="text-center text-xs text-red-600">{error}</p> : null}

        <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Button
            type="button"
            size="lg"
            variant="outline"
            className="w-full gap-2 sm:w-auto"
            onClick={onBack}
            disabled={isPending}
          >
            <ArrowLeft className="size-4" />
            다시 분류하기
          </Button>
          <Button
            type="button"
            size="lg"
            className="w-full gap-2 sm:w-auto sm:min-w-[200px]"
            onClick={handleSubmit}
            disabled={isPending}
          >
            {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            제출하고 진단 결과 보기
            {!isPending ? <ArrowRight className="size-4" /> : null}
          </Button>
        </div>
      </div>
    </main>
  )
}
