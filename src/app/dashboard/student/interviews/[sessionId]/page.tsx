import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import DateUtil from '@/lib/date-util'
import { requireAuthForDashboard } from '@/lib/auth'
import { fetchStudentInterviewDetail } from '@/lib/interviews'

export const metadata: Metadata = {
  title: '모의 면접 문제 | Woodie Film Campus',
}

function formatDateTime(value: string | null) {
  if (!value) {
    return '-'
  }
  return DateUtil.formatForDisplay(value, {
    locale: 'ko-KR',
    timeZone: 'Asia/Seoul',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default async function StudentInterviewDetailPage({
  params,
}: {
  params: Promise<{ sessionId: string }>
}) {
  const { profile } = await requireAuthForDashboard('student')

  if (!profile) {
    return null
  }

  const { sessionId } = await params
  const detail = await fetchStudentInterviewDetail(sessionId, profile.id)

  if (!detail) {
    notFound()
  }

  return (
    <section className="space-y-6">
      <div className="space-y-3">
        <DashboardBackLink fallbackHref="/dashboard/student/interviews" label="모의 면접 목록으로 돌아가기" />
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold text-slate-900">{detail.setTitle}</h1>
            <Badge variant={detail.attemptStatus === 'task_created' ? 'default' : 'outline'}>
              {detail.attemptStatus === 'task_created' ? '면접 완료' : '면접 예정'}
            </Badge>
          </div>
          {detail.setDescription && <p className="text-sm text-slate-600">{detail.setDescription}</p>}
        </div>
      </div>

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base text-slate-900">면접 문항</CardTitle>
          <p className="text-xs text-slate-500">문항을 미리 읽고 답변을 준비해보세요.</p>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal space-y-4 pl-5 text-sm text-slate-700">
            {detail.questions.map((question) => (
              <li key={question.id} className="space-y-2">
                <p className="whitespace-pre-line">{question.prompt}</p>
                {question.assets.length > 0 && (
                  <div className="flex flex-wrap gap-3">
                    {question.assets.map((asset, index) =>
                      asset.url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={asset.id}
                          src={asset.url}
                          alt={`문항 이미지 ${index + 1}`}
                          className="max-h-64 rounded-md border border-slate-200 object-contain"
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

      {detail.attemptStatus === 'task_created' && (
        <Card className="border-blue-200 bg-blue-50/50">
          <CardHeader>
            <CardTitle className="text-base text-blue-800">면접이 끝났습니다</CardTitle>
            <p className="text-xs text-blue-700">녹화 완료: {formatDateTime(detail.recordedAt)}</p>
          </CardHeader>
          <CardContent className="space-y-4">
            {detail.videoUrl && (
              <video controls playsInline src={detail.videoUrl} className="w-full rounded-md border border-blue-200" />
            )}
            {detail.studentTaskId && (
              <Button asChild>
                <Link href={`/dashboard/student/tasks/${detail.studentTaskId}`}>복기 과제 하러 가기</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </section>
  )
}
