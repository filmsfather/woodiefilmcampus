import { CalendarClock, Users } from 'lucide-react'

/**
 * 지원 대학 최종 확정 마감(매주 화요일) D-day와 반배정(목요일) 안내 배너.
 * 서버 컴포넌트에서 렌더링하며(부모 페이지가 force-dynamic), Asia/Seoul 기준 요일로 D-day를 계산한다.
 */

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const TUESDAY_INDEX = 2

function daysUntilTuesday(): number {
  const seoulWeekday = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    weekday: 'short',
  }).format(new Date())
  const todayIndex = WEEKDAY_SHORT.indexOf(seoulWeekday)
  if (todayIndex === -1) return 0
  return (TUESDAY_INDEX - todayIndex + 7) % 7
}

export default function ConfirmationDeadlineBanner() {
  const dday = daysUntilTuesday()
  const ddayLabel = dday === 0 ? 'D-DAY' : `D-${dday}`

  return (
    <div className="overflow-hidden rounded-2xl border border-rose-200 bg-gradient-to-r from-rose-50 via-amber-50 to-white shadow-sm">
      <div className="flex flex-col items-stretch gap-3 p-4 sm:flex-row sm:items-center">
        <div className="flex shrink-0 flex-col items-center justify-center rounded-xl bg-rose-600 px-5 py-3 text-white shadow-sm">
          <span className="text-[11px] font-medium uppercase tracking-wide text-rose-100">
            확정 마감
          </span>
          <span className="text-3xl font-extrabold leading-tight">{ddayLabel}</span>
          <span className="text-xs font-medium text-rose-100">화요일까지</span>
        </div>

        <div className="min-w-0 space-y-1.5">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-rose-900">
            <CalendarClock className="size-4 shrink-0" />
            화요일까지 지원 대학을 최종 확정해 주세요.
          </p>
          <p className="flex items-start gap-1.5 rounded-lg bg-white/70 px-3 py-2 text-sm font-medium text-slate-800">
            <Users className="mt-0.5 size-4 shrink-0 text-sky-600" />
            <span>
              <span className="font-semibold text-sky-700">목요일</span>에 확정한 대학을 기반으로{' '}
              <span className="font-semibold text-sky-700">반배정</span>됩니다.
            </span>
          </p>
        </div>
      </div>
    </div>
  )
}
