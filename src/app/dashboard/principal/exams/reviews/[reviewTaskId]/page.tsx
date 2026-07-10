import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { ReviewTaskEvaluation } from '@/components/dashboard/exams/ReviewTaskEvaluation'
import { Badge } from '@/components/ui/badge'
import { requireAuthForDashboard } from '@/lib/auth'
import { fetchReviewTaskDetailForPrincipal } from '@/lib/exams'

export const metadata: Metadata = {
  title: '오답노트 확인 | 시험 출제',
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  assigned: { label: '작성 대기', className: 'bg-slate-100 text-slate-700' },
  submitted: { label: '확인 필요', className: 'bg-amber-100 text-amber-700' },
  partial: { label: '부분 통과', className: 'bg-blue-100 text-blue-700' },
  pass: { label: '통과', className: 'bg-emerald-100 text-emerald-700' },
}

export default async function ReviewTaskDetailPage(props: {
  params: Promise<{ reviewTaskId: string }>
}) {
  await requireAuthForDashboard('principal')

  const { reviewTaskId } = await props.params
  const detail = await fetchReviewTaskDetailForPrincipal(reviewTaskId)

  if (!detail) {
    notFound()
  }

  const badge = STATUS_BADGE[detail.task.status] ?? STATUS_BADGE.assigned

  return (
    <section className="space-y-6">
      <DashboardBackLink
        fallbackHref={`/dashboard/principal/exams/sessions/${detail.sessionId}`}
        label="응시 현황으로 돌아가기"
      />

      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold text-slate-900">
            {detail.studentName} 오답노트
          </h1>
          <Badge className={badge.className}>{badge.label}</Badge>
        </div>
        <p className="text-sm text-slate-600">{detail.examTitle}</p>
        <p className="text-xs text-slate-500">
          문항별로 PASS / NON-PASS를 지정하거나, 전체 통과 버튼으로 일괄 통과시킬 수 있습니다. NON-PASS 문항은
          학생이 다시 작성해 재제출합니다.
        </p>
      </header>

      <ReviewTaskEvaluation task={detail.task} />
    </section>
  )
}
