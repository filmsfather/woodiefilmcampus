import type { ReportGaugePoint } from '@/lib/university-policy/report-view'

interface ScoreGaugeProps {
  metricLabel: string
  lowerIsBetter: boolean
  studentValue: number | null
  points: ReportGaugePoint[]
}

/**
 * "내 점수 vs 작년 컷"을 가로 막대로 보여준다.
 * 항상 왼쪽이 유리(good), 오른쪽이 불리(bad)하도록 정렬한다.
 */
export default function ScoreGauge({
  metricLabel,
  lowerIsBetter,
  studentValue,
  points,
}: ScoreGaugeProps) {
  if (points.length === 0) return null

  const values = points.map((p) => p.value)
  if (studentValue != null) values.push(studentValue)
  let min = Math.min(...values)
  let max = Math.max(...values)
  if (min === max) {
    min -= 1
    max += 1
  }
  const pad = (max - min) * 0.12
  min -= pad
  max += pad
  const span = max - min

  // 왼쪽=유리가 되도록 위치(0~100%)를 계산.
  const toLeftPercent = (value: number) => {
    const raw = (value - min) / span
    const good = lowerIsBetter ? raw : 1 - raw
    return Math.min(100, Math.max(0, good * 100))
  }

  const studentLeft = studentValue != null ? toLeftPercent(studentValue) : null

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[11px] text-slate-500">
        <span>{metricLabel}</span>
        <span className="flex items-center gap-2">
          <span className="text-emerald-600">← 유리</span>
          <span className="text-rose-500">불리 →</span>
        </span>
      </div>
      <div className="relative h-2 rounded-full bg-gradient-to-r from-emerald-200 via-amber-200 to-rose-200">
        {points.map((p, idx) => {
          const left = toLeftPercent(p.value)
          return (
            <div
              key={`${p.label}-${idx}`}
              className="absolute top-1/2 h-3 w-0.5 -translate-y-1/2 bg-slate-400"
              style={{ left: `${left}%` }}
              title={`${p.label}: ${p.value}`}
            />
          )
        })}
        {studentLeft != null ? (
          <div
            className="absolute top-1/2 z-10 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-slate-900 shadow"
            style={{ left: `${studentLeft}%` }}
            title={`내 점수: ${studentValue}`}
          />
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
        {studentValue != null ? (
          <span className="font-medium text-slate-700">
            내 점수 {studentValue.toFixed(2)}
          </span>
        ) : null}
        {points.map((p, idx) => (
          <span key={`legend-${p.label}-${idx}`}>
            {p.label} {p.value}
          </span>
        ))}
      </div>
    </div>
  )
}
