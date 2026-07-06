import type { Metadata } from 'next'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { Card, CardContent } from '@/components/ui/card'
import { requireAuthForDashboard } from '@/lib/auth'
import { fetchConfirmedFinalSummaries } from '@/lib/university-confirmation/data'
import ConfirmedWishlistView from '@/app/dashboard/principal/university-reports/wishlists/ConfirmedWishlistView'

export const metadata: Metadata = {
  title: '확정 희망대학 현황 | 지원가능대학 레포트',
  description: '학생별로 확정된 희망대학을 한눈에 확인합니다. (반편성·합격추적)',
}

export default async function ConfirmedWishlistsPage() {
  await requireAuthForDashboard('principal')

  const summaries = await fetchConfirmedFinalSummaries()

  const totalApplications = summaries.reduce(
    (sum, s) =>
      sum + s.generalItems.length + s.specializedItems.length + (s.kartsApply ? 1 : 0),
    0
  )

  return (
    <section className="space-y-6">
      <DashboardBackLink
        fallbackHref="/dashboard/principal/university-reports/workflow"
        label="단계별 관리로 돌아가기"
      />

      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-slate-900">확정 대학 리스트</h1>
        <p className="text-sm text-slate-600">
          학생이 동의해 확정한 희망대학 목록입니다. 대학별·학생별 보기와 검색·정렬로 같은 대학을
          지원하는 학생을 모아 반편성에 활용하세요.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        <SummaryStat label="확정 학생" value={summaries.length} />
        <SummaryStat label="총 지원 건수" value={totalApplications} />
      </div>

      {summaries.length === 0 ? (
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="p-8 text-center text-sm text-slate-500">
            아직 희망대학을 확정한 학생이 없습니다.
          </CardContent>
        </Card>
      ) : (
        <ConfirmedWishlistView summaries={summaries} />
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
