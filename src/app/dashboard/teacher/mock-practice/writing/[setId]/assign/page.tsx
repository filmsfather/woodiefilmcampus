import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { WritingSessionCreateForm } from '@/components/dashboard/mock-practice/WritingSessionCreateForm'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { requireAuthForDashboard } from '@/lib/auth'
import { fetchClassOptionsForInterview } from '@/lib/interviews'
import { fetchWritingSetDetail } from '@/lib/writings'

export const metadata: Metadata = {
  title: '작문 출제하기 | Woodie Film Campus',
}

export default async function WritingAssignPage({
  params,
}: {
  params: Promise<{ setId: string }>
}) {
  const { profile } = await requireAuthForDashboard(['teacher', 'manager'])

  if (!profile) {
    return null
  }

  const { setId } = await params
  const [set, classOptions] = await Promise.all([
    fetchWritingSetDetail(setId),
    fetchClassOptionsForInterview(profile.id, profile.role),
  ])

  if (!set) {
    notFound()
  }

  return (
    <section className="space-y-6">
      <div className="space-y-3">
        <DashboardBackLink fallbackHref="/dashboard/teacher/mock-practice/writing" label="모의 작문으로 돌아가기" />
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-slate-900">작문 출제하기</h1>
          <p className="text-sm text-slate-600">
            반 전체 또는 개별 학생을 선택해 출제하세요. 문제는 학생이 시험을 시작하는 순간에만 공개됩니다.
          </p>
        </div>
      </div>

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base text-slate-900">{set.title}</CardTitle>
          {set.description && <p className="text-sm text-slate-500">{set.description}</p>}
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs font-medium text-slate-500">
            제한시간 {set.timeLimitMinutes}분 · 작문 문항 {set.questions.length}개 · 공통 오답노트{' '}
            {set.reviewQuestions.length}개
          </p>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-700">
            {set.questions.map((question) => (
              <li key={question.id} className="whitespace-pre-line">
                {question.prompt}
                {question.assets.length > 0 && (
                  <span className="ml-1 text-xs text-slate-400">(이미지 {question.assets.length}장)</span>
                )}
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base text-slate-900">출제 대상 선택</CardTitle>
        </CardHeader>
        <CardContent>
          <WritingSessionCreateForm setId={set.id} classOptions={classOptions} />
        </CardContent>
      </Card>
    </section>
  )
}
