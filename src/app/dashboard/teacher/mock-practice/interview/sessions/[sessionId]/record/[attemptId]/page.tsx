import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { InterviewRecorder } from '@/components/dashboard/mock-practice/InterviewRecorder'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { requireAuthForDashboard } from '@/lib/auth'
import { fetchInterviewSessionDetail } from '@/lib/interviews'

export const metadata: Metadata = {
  title: '모의 면접 녹화 | Woodie Film Campus',
}

export default async function InterviewRecordPage({
  params,
}: {
  params: Promise<{ sessionId: string; attemptId: string }>
}) {
  const { profile } = await requireAuthForDashboard(['teacher', 'manager'])

  if (!profile) {
    return null
  }

  const { sessionId, attemptId } = await params
  const detail = await fetchInterviewSessionDetail(sessionId)

  if (!detail) {
    notFound()
  }

  const row = detail.rows.find((entry) => entry.attemptId === attemptId)

  if (!row) {
    notFound()
  }

  if (row.status === 'task_created') {
    redirect(`/dashboard/teacher/mock-practice/interview/sessions/${sessionId}`)
  }

  return (
    <section className="space-y-6">
      <div className="space-y-3">
        <DashboardBackLink
          fallbackHref={`/dashboard/teacher/mock-practice/interview/sessions/${sessionId}`}
          label="회차 현황으로 돌아가기"
        />
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-slate-900">{detail.set.title}</h1>
          <p className="text-sm text-slate-600">
            {row.studentName} 학생{row.className ? ` (${row.className})` : ''}의 모의 면접을 녹화합니다.
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
        <InterviewRecorder
          attemptId={row.attemptId}
          sessionId={sessionId}
          studentName={row.studentName}
          uploaderId={profile.id}
        />

        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="text-base text-slate-900">면접 문항</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="list-decimal space-y-3 pl-5 text-sm text-slate-700">
              {detail.set.questions.map((question) => (
                <li key={question.id} className="space-y-2">
                  <p className="whitespace-pre-line">{question.prompt}</p>
                  {question.assets.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {question.assets.map((asset, index) =>
                        asset.url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            key={asset.id}
                            src={asset.url}
                            alt={`문항 이미지 ${index + 1}`}
                            className="h-24 rounded-md border border-slate-200 object-contain"
                          />
                        ) : null
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>
    </section>
  )
}
