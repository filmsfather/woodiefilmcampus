'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Play } from 'lucide-react'

import { runAnalysisAction } from '@/app/dashboard/principal/university-reports/[studentId]/analysis/actions'
import { Button } from '@/components/ui/button'

interface AnalysisRunButtonProps {
  studentId: string
  size?: 'sm' | 'default'
  variant?: 'default' | 'outline'
}

export default function AnalysisRunButton({
  studentId,
  size = 'default',
  variant = 'default',
}: AnalysisRunButtonProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; message: string } | null>(null)

  const handleClick = () => {
    setFeedback(null)
    startTransition(async () => {
      const result = await runAnalysisAction({ studentId })
      if ('error' in result) {
        setFeedback({ kind: 'err', message: result.error })
        return
      }
      setFeedback({
        kind: 'ok',
        message: `분석 완료: ${result.evaluatedCount}건 갱신 / ${result.skipped}건 캐시 재사용`,
      })
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button onClick={handleClick} disabled={isPending} size={size} variant={variant} className="gap-2">
        {isPending ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
        분석 실행
      </Button>
      {feedback ? (
        <p
          className={`text-xs ${
            feedback.kind === 'ok' ? 'text-emerald-700' : 'text-red-600'
          }`}
        >
          {feedback.message}
        </p>
      ) : null}
    </div>
  )
}
