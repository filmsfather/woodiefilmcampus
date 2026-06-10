import type { Metadata } from 'next'
import Link from 'next/link'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { requireAuthForDashboard } from '@/lib/auth'
import {
  fetchConfirmedWishlistSummaries,
  type ConfirmedWishlistSummary,
} from '@/lib/university-wishlist/data'

export const metadata: Metadata = {
  title: '확정 희망대학 현황 | 지원가능대학 레포트',
  description: '학생별로 확정된 희망대학을 한눈에 확인합니다. (반편성·합격추적)',
}

function formatDate(iso: string | null) {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

export default async function ConfirmedWishlistsPage() {
  await requireAuthForDashboard('principal')

  const summaries = await fetchConfirmedWishlistSummaries()

  return (
    <section className="space-y-6">
      <DashboardBackLink
        fallbackHref="/dashboard/principal/university-reports"
        label="레포트 관리로 돌아가기"
      />

      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-slate-900">확정 희망대학 현황</h1>
        <p className="text-sm text-slate-600">
          학생이 동의해 확정한 희망대학 목록입니다. 반편성과 합격 추적 관리에 활용하세요.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        <SummaryStat label="확정 학생" value={summaries.length} />
        <SummaryStat
          label="평균 일반대 선택"
          value={
            summaries.length === 0
              ? 0
              : Math.round(
                  (summaries.reduce((sum, s) => sum + s.generalItems.length, 0) / summaries.length) * 10
                ) / 10
          }
        />
      </div>

      {summaries.length === 0 ? (
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="p-8 text-center text-sm text-slate-500">
            아직 희망대학을 확정한 학생이 없습니다.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {summaries.map((summary) => (
            <SummaryRow key={summary.studentId} summary={summary} />
          ))}
        </div>
      )}
    </section>
  )
}

function SummaryStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-slate-900">{value}</p>
    </div>
  )
}

function SummaryRow({ summary }: { summary: ConfirmedWishlistSummary }) {
  return (
    <Card className="border-slate-200 shadow-sm">
      <CardContent className="space-y-3 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/dashboard/principal/university-reports/${summary.studentId}/report`}
              className="text-base font-semibold text-slate-900 hover:underline"
            >
              {summary.studentName}
            </Link>
            {summary.className ? (
              <Badge variant="outline" className="text-slate-600">
                {summary.className}
              </Badge>
            ) : null}
          </div>
          <span className="text-xs text-slate-500">{formatDate(summary.confirmedAt)} 확정</span>
        </div>

        <div className="space-y-2">
          <GroupLine
            label="일반대"
            count={summary.generalItems.length}
            names={summary.generalItems.map((i) => i.shortName ?? i.universityName)}
            tone="sky"
          />
          <GroupLine
            label="전문대·예대"
            count={summary.specializedItems.length}
            names={summary.specializedItems.map((i) => i.shortName ?? i.universityName)}
            tone="amber"
          />
        </div>
      </CardContent>
    </Card>
  )
}

function GroupLine({
  label,
  count,
  names,
  tone,
}: {
  label: string
  count: number
  names: string[]
  tone: 'sky' | 'amber'
}) {
  const toneClass = tone === 'sky' ? 'bg-sky-100 text-sky-700' : 'bg-amber-100 text-amber-800'
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-slate-500">
        {label} ({count})
      </span>
      {names.length === 0 ? (
        <span className="text-xs text-slate-400">-</span>
      ) : (
        names.map((name, idx) => (
          <Badge key={`${name}-${idx}`} className={toneClass}>
            {name}
          </Badge>
        ))
      )}
    </div>
  )
}
