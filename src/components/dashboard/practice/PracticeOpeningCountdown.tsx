'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlarmClock } from 'lucide-react'

import { formatKstDateTime, formatSlotDateLabel, getWeekStartDate } from '@/lib/practice/shared'
import type { PracticeBookingOpening } from '@/types/practice'

interface PracticeOpeningCountdownProps {
  opening: PracticeBookingOpening | null
  /** 서버 기준 현재 시각. 첫 렌더에서 SSR 결과와 맞추기 위해 주입한다. */
  nowIso: string
}

function pad(value: number): string {
  return value.toString().padStart(2, '0')
}

function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const days = Math.floor(totalSeconds / 86_400)
  const clock = [
    pad(Math.floor((totalSeconds % 86_400) / 3_600)),
    pad(Math.floor((totalSeconds % 3_600) / 60)),
    pad(totalSeconds % 60),
  ].join(':')

  return days > 0 ? `${days}일 ${clock}` : clock
}

export function PracticeOpeningCountdown({ opening, nowIso }: PracticeOpeningCountdownProps) {
  const router = useRouter()
  const opensAtMs = opening ? Date.parse(opening.opensAt) : Number.NaN
  const [remainingMs, setRemainingMs] = useState(() =>
    Number.isNaN(opensAtMs) ? 0 : opensAtMs - Date.parse(nowIso)
  )

  useEffect(() => {
    if (Number.isNaN(opensAtMs)) {
      return
    }

    const tick = () => setRemainingMs(opensAtMs - Date.now())
    tick()
    const timer = window.setInterval(tick, 1_000)
    return () => window.clearInterval(timer)
  }, [opensAtMs])

  // 오픈 시각이 지나면 새 슬롯을 받아오기 위해 한 번 새로고침한다.
  const isOpened = remainingMs <= 0
  useEffect(() => {
    if (Number.isNaN(opensAtMs) || !isOpened) {
      return
    }
    router.refresh()
  }, [isOpened, opensAtMs, router])

  if (!opening || Number.isNaN(opensAtMs)) {
    return null
  }

  const weekLabel = formatSlotDateLabel(getWeekStartDate(opening.slotDate))

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 rounded-lg border border-emerald-200 bg-emerald-50/70 px-4 py-3">
      <div className="space-y-1">
        <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
          <AlarmClock className="h-3.5 w-3.5" />
          {isOpened ? '예약이 열렸습니다' : '다음 예약 오픈까지'}
        </p>
        <p className="text-sm text-slate-700">
          <span className="font-medium text-slate-900">{opening.phase}차 예약</span> · {weekLabel} 주 슬롯 ·{' '}
          {formatKstDateTime(opening.opensAt)} 오픈
        </p>
      </div>
      <p className="font-mono text-2xl font-semibold tabular-nums text-emerald-700">
        {isOpened ? '00:00:00' : formatRemaining(remainingMs)}
      </p>
    </div>
  )
}
