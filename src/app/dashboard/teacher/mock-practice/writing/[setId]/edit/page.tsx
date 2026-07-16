import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { WritingSetForm } from '@/components/dashboard/mock-practice/WritingSetForm'
import { requireAuthForDashboard } from '@/lib/auth'
import { fetchWritingSetDetail } from '@/lib/writings'

export const metadata: Metadata = {
  title: '작문 문제 수정 | Woodie Film Campus',
}

export default async function WritingSetEditPage({
  params,
}: {
  params: Promise<{ setId: string }>
}) {
  const { profile } = await requireAuthForDashboard(['teacher', 'manager'])

  if (!profile) {
    return null
  }

  const { setId } = await params
  const set = await fetchWritingSetDetail(setId)

  if (!set) {
    notFound()
  }

  return (
    <section className="space-y-6">
      <div className="space-y-3">
        <DashboardBackLink fallbackHref="/dashboard/teacher/mock-practice/writing" label="모의 작문으로 돌아가기" />
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-slate-900">작문 문제 수정</h1>
          <p className="text-sm text-slate-600">
            아직 출제되지 않은 세트만 수정할 수 있습니다.
          </p>
        </div>
      </div>

      {set.sessions.length > 0 ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
          이미 출제된 세트는 수정할 수 없습니다. 새 세트를 만들어주세요.
        </p>
      ) : (
        <WritingSetForm uploaderId={profile.id} initialSet={set} />
      )}
    </section>
  )
}
