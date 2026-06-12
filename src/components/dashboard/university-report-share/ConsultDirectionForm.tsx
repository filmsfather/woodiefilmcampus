'use client'

import { useState, useTransition } from 'react'
import { ArrowRight, Loader2 } from 'lucide-react'

import { submitConsultDirectionAction } from '@/app/r/[token]/actions'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

interface ConsultDirectionFormProps {
  token: string
  studentName: string
  onSubmitted: () => void
}

const EXAMPLES = [
  '올해 안에 무조건 대학에 합격하는 것이 가장 큰 목표예요.',
  '최대한 수도권 안에 있는 대학으로 지원하고 싶어요.',
  '부산 근처에 살아서 경성대학교는 꼭 지원하고 싶습니다.',
  '생활기록부(학생부 종합)로 갈 수 있는 대학을 희망해요.',
]

export default function ConsultDirectionForm({
  token,
  studentName,
  onSubmitted,
}: ConsultDirectionFormProps) {
  const [direction, setDirection] = useState('')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = () => {
    setError(null)
    if (direction.trim().length === 0) {
      setError('원하는 컨설팅 방향을 입력해주세요.')
      return
    }
    startTransition(async () => {
      const result = await submitConsultDirectionAction({ token, direction })
      if ('error' in result) {
        setError(result.error)
        return
      }
      onSubmitted()
    })
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-white px-6 py-12">
      <div className="flex w-full max-w-xl flex-col gap-6">
        <div className="space-y-1 text-center">
          <p className="text-xs font-medium uppercase tracking-wide text-[#8a9472]">
            컨설팅 방향 제출
          </p>
          <h2 className="text-xl font-semibold tracking-tight text-[#5a6450] sm:text-2xl">
            {studentName} 학생이 원하는 입시 방향을 알려주세요
          </h2>
          <p className="pt-1 text-sm text-slate-500">
            적어주신 방향을 바탕으로, 우디쌤이 가장 잘 맞는 대학과 전략을 추천해 드립니다.
          </p>
        </div>

        <div className="rounded-xl border border-[#e3e6db] bg-[#f7f8f3] p-4 sm:p-5">
          <p className="text-xs font-semibold text-[#5a6450]">이렇게 적어주시면 좋아요</p>
          <ul className="mt-2 space-y-1.5">
            {EXAMPLES.map((example) => (
              <li key={example} className="flex gap-2 text-sm text-slate-600">
                <span className="text-[#8a9472]">·</span>
                <span>{example}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-2">
          <Textarea
            value={direction}
            onChange={(e) => setDirection(e.target.value)}
            placeholder="원하는 입시 방향, 꼭 가고 싶은 학교나 지역, 활용하고 싶은 전형 등을 자유롭게 적어주세요."
            rows={6}
            className="bg-white text-sm"
          />
          {error ? <p className="text-xs text-red-600">{error}</p> : null}
        </div>

        <div className="flex justify-center">
          <Button
            type="button"
            size="lg"
            className="w-full max-w-[280px] gap-2"
            onClick={handleSubmit}
            disabled={isPending}
          >
            {isPending ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
            의견 제출하고 희망대학 고르기
          </Button>
        </div>
      </div>
    </main>
  )
}
