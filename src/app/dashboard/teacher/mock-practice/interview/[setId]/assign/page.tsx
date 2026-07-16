import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { InterviewSessionCreateForm } from '@/components/dashboard/mock-practice/InterviewSessionCreateForm'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { requireAuthForDashboard } from '@/lib/auth'
import { fetchClassOptionsForInterview, fetchInterviewSetDetail } from '@/lib/interviews'

export const metadata: Metadata = {
  title: '면접 출제하기 | Woodie Film Campus',
}

export default async function InterviewAssignPage({
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
    fetchInterviewSetDetail(setId),
    fetchClassOptionsForInterview(profile.id, profile.role),
  ])

  if (!set) {
    notFound()
  }

  return (
    <section className="space-y-6">
      <div className="space-y-3">
        <DashboardBackLink fallbackHref="/dashboard/teacher/mock-practice/interview" label="모의 면접으로 돌아가기" />
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-slate-900">면접 출제하기</h1>
          <p className="text-sm text-slate-600">
            반 전체 또는 개별 학생을 선택해 출제하세요. 출제 즉시 학생 화면에 문제가 공개됩니다.
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
            면접 문항 {set.questions.length}개 · 복기 문항 {set.reviewQuestions.length}개
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
          <InterviewSessionCreateForm setId={set.id} classOptions={classOptions} />
        </CardContent>
      </Card>
    </section>
  )
}
