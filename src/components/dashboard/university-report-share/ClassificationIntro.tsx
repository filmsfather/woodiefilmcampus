'use client'

import { ArrowRight } from 'lucide-react'

import { CLASSIFICATION_GUIDES } from '@/components/dashboard/university-report-share/classification-guide'
import { Button } from '@/components/ui/button'

interface ClassificationIntroProps {
  studentName: string
  totalCount: number
  onStart: () => void
}

const GUIDE_ORDER = ['recommend', 'reach', 'risk', 'record'] as const

export default function ClassificationIntro({
  studentName,
  totalCount,
  onStart,
}: ClassificationIntroProps) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-white px-6 py-12">
      <div className="flex w-full max-w-xl flex-col gap-6">
        <div className="space-y-1 text-center">
          <p className="text-xs font-medium uppercase tracking-wide text-[#8a9472]">
            지원 희망 대학 분류
          </p>
          <h2 className="text-xl font-semibold tracking-tight text-[#5a6450] sm:text-2xl">
            {studentName} 학생이 지원하고 싶은 대학을 골라주세요
          </h2>
        </div>

        <div className="rounded-xl border border-[#e3e6db] bg-[#f7f8f3] p-6 text-[15px] leading-relaxed text-slate-700 sm:p-8">
          <p>
            지금부터 대학을 {totalCount > 0 ? `${totalCount}곳 ` : ''}하나씩 보여드립니다. 각 대학을
            <span className="font-semibold text-[#5a6450]"> 지원 희망 </span>
            또는
            <span className="font-semibold text-[#5a6450]"> 희망하지 않음</span>
            으로 분류해 주세요.
          </p>
          <p className="mt-3">
            먼저 학생과 학부모님이 원하는 대학을 표시해 주시면, 이를 바탕으로 원장 선생님이 직접
            컨설팅을 진행합니다.
          </p>
        </div>

        <div className="space-y-3">
          <p className="text-sm font-semibold text-[#5a6450]">분류할 때 이렇게 참고해 주세요</p>
          {GUIDE_ORDER.map((key) => {
            const guide = CLASSIFICATION_GUIDES[key]
            return (
              <div
                key={guide.category}
                className={`flex gap-3 rounded-lg border p-3.5 text-sm ${guide.box}`}
              >
                <span className={`mt-1.5 size-2.5 shrink-0 rounded-full ${guide.dot}`} aria-hidden />
                <div className="space-y-0.5">
                  <p className="font-semibold">{guide.title}</p>
                  <p className="leading-relaxed">{guide.description}</p>
                </div>
              </div>
            )
          })}
        </div>

        <div className="flex justify-center">
          <Button type="button" size="lg" className="w-full max-w-[220px] gap-2" onClick={onStart}>
            시작하기
            <ArrowRight className="size-4" />
          </Button>
        </div>
      </div>
    </main>
  )
}
