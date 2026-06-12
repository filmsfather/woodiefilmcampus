'use client'

import { useState } from 'react'
import { ArrowLeft, Check, X } from 'lucide-react'

import { guideForItem } from '@/components/dashboard/university-report-share/classification-guide'
import UniversityVerdictCard from '@/components/dashboard/university-report-share/UniversityVerdictCard'
import { Button } from '@/components/ui/button'
import type { ReportUniversityItem } from '@/lib/university-policy/report-view'

interface UniversityClassifierProps {
  items: ReportUniversityItem[]
  onComplete: (wishes: Record<string, boolean>) => void
}

export default function UniversityClassifier({ items, onComplete }: UniversityClassifierProps) {
  const [index, setIndex] = useState(0)
  const [wishes, setWishes] = useState<Record<string, boolean>>({})

  const item = items[index]
  const guide = guideForItem(item)
  const total = items.length
  const current = wishes[item.id]

  const goNext = (nextWishes: Record<string, boolean>) => {
    if (index >= total - 1) {
      onComplete(nextWishes)
      return
    }
    setIndex((i) => i + 1)
  }

  const choose = (wish: boolean) => {
    const next = { ...wishes, [item.id]: wish }
    setWishes(next)
    goNext(next)
  }

  return (
    <main className="flex min-h-dvh flex-col bg-white px-4 py-8 sm:py-12">
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <button
              type="button"
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
              disabled={index === 0}
              className="flex items-center gap-1 text-slate-500 transition-colors hover:text-slate-800 disabled:opacity-40"
            >
              <ArrowLeft className="size-4" />
              이전
            </button>
            <span className="font-medium text-[#5a6450]">
              {index + 1} / {total}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-[#8a9472] transition-all"
              style={{ width: `${((index + 1) / total) * 100}%` }}
            />
          </div>
        </div>

        <div className={`flex gap-3 rounded-lg border p-3.5 text-sm ${guide.box}`}>
          <span className={`mt-1.5 size-2.5 shrink-0 rounded-full ${guide.dot}`} aria-hidden />
          <div className="space-y-0.5">
            <p className="font-semibold">{guide.title}</p>
            <p className="leading-relaxed">{guide.description}</p>
          </div>
        </div>

        <UniversityVerdictCard item={item} />

        <div className="mt-auto space-y-3 pt-2">
          <div className="space-y-1 text-center">
            <p className="text-sm text-slate-500">이 대학에 지원하고 싶으신가요?</p>
            <p className="text-xs text-slate-400">
              최종 지원 대학을 확정하는 단계가 아니에요. 원장 선생님이 컨설팅을 준비하기 위한 참고
              자료이니 편하게 표시해 주세요.
            </p>
          </div>
          <div className="flex gap-3">
            <Button
              type="button"
              size="lg"
              variant={current === false ? 'default' : 'outline'}
              className="flex-1 gap-2"
              onClick={() => choose(false)}
            >
              <X className="size-4" />
              희망하지 않음
            </Button>
            <Button
              type="button"
              size="lg"
              variant={current === true ? 'default' : 'outline'}
              className="flex-1 gap-2"
              onClick={() => choose(true)}
            >
              <Check className="size-4" />
              지원 희망
            </Button>
          </div>
        </div>
      </div>
    </main>
  )
}
