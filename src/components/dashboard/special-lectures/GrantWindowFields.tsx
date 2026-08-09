'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  SPECIAL_LECTURE_GRANT_PRESETS,
  formatSpecialLectureGrantDuration,
  parseLocalDatetimeInputValue,
  toLocalDatetimeInputValue,
} from '@/lib/special-lectures'

interface GrantWindowFieldsProps {
  idPrefix: string
  startsAt: string
  expiresAt: string
  onStartsAtChange: (value: string) => void
  onExpiresAtChange: (value: string) => void
  disabled?: boolean
}

export function GrantWindowFields({
  idPrefix,
  startsAt,
  expiresAt,
  onStartsAtChange,
  onExpiresAtChange,
  disabled = false,
}: GrantWindowFieldsProps) {
  const startsDate = parseLocalDatetimeInputValue(startsAt)
  const expiresDate = parseLocalDatetimeInputValue(expiresAt)
  const durationLabel = formatSpecialLectureGrantDuration(startsDate, expiresDate)
  const isScheduled = Boolean(startsDate && startsDate.getTime() > Date.now())

  // 시작 시각이 이미 지났다면 지금을 기준으로 잡아야 종료 시각이 과거로 계산되지 않는다.
  const applyPreset = (hours: number) => {
    const base = startsDate ?? new Date()
    const anchor = base.getTime() > Date.now() ? base : new Date()
    onExpiresAtChange(toLocalDatetimeInputValue(new Date(anchor.getTime() + hours * 60 * 60 * 1000)))
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-starts`}>공개 시작</Label>
          <Input
            id={`${idPrefix}-starts`}
            type="datetime-local"
            value={startsAt}
            onChange={(event) => onStartsAtChange(event.target.value)}
            disabled={disabled}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-expires`}>공개 종료</Label>
          <Input
            id={`${idPrefix}-expires`}
            type="datetime-local"
            value={expiresAt}
            onChange={(event) => onExpiresAtChange(event.target.value)}
            disabled={disabled}
          />
        </div>
      </div>

      <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3">
        <p className="text-xs text-slate-500">시작 시각 기준으로 종료 시각을 빠르게 채웁니다.</p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onStartsAtChange(toLocalDatetimeInputValue(new Date()))}
            disabled={disabled}
          >
            지금 시작
          </Button>
          {SPECIAL_LECTURE_GRANT_PRESETS.map((preset) => (
            <Button
              key={preset.hours}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => applyPreset(preset.hours)}
              disabled={disabled}
            >
              +{preset.label}
            </Button>
          ))}
        </div>
        {durationLabel ? (
          <p className="text-xs text-slate-600">
            공개 기간: <span className="font-medium text-slate-800">{durationLabel}</span>
            {isScheduled ? ' · 예약 공개' : ''}
          </p>
        ) : null}
      </div>
    </div>
  )
}
