import type { Metadata } from 'next'
import Link from 'next/link'
import { Video } from 'lucide-react'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import DateUtil from '@/lib/date-util'
import { requireAuthForDashboard } from '@/lib/auth'
import { fetchStudentInterviewList } from '@/lib/interviews'

export const metadata: Metadata = {
  title: '모의 면접 | Woodie Film Campus',
  description: '출제된 모의 면접 문제를 확인하세요.',
}

function formatDate(value: string) {
  if (!value) {
    return '-'
  }
  return DateUtil.formatForDisplay(value, {
    locale: 'ko-KR',
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export default async function StudentInterviewListPage() {
  const { profile } = await requireAuthForDashboard('student')

  if (!profile) {
    return null
  }

  const interviews = await fetchStudentInterviewList(profile.id)

  return (
    <section className="space-y-6">
      <div className="space-y-3">
        <DashboardBackLink fallbackHref="/dashboard/student" label="대시보드로 돌아가기" />
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-slate-900">모의 면접</h1>
          <p className="text-sm text-slate-600">
            출제된 면접 문제를 미리 확인하고 준비하세요. 면접이 끝나면 복기 과제가 과제 목록에 생성됩니다.
          </p>
        </div>
      </div>

      {interviews.length === 0 ? (
        <Card className="border-dashed border-slate-300 bg-slate-50">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center text-sm text-slate-500">
            <Video className="h-6 w-6 text-slate-400" />
            <p>아직 출제된 모의 면접이 없습니다.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {interviews.map((interview) => (
            <Card key={interview.sessionId} className="border-slate-200">
              <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-slate-900">{interview.setTitle}</p>
                    <Badge variant={interview.attemptStatus === 'task_created' ? 'default' : 'outline'}>
                      {interview.attemptStatus === 'task_created' ? '면접 완료' : '면접 예정'}
                    </Badge>
                    {interview.sessionStatus === 'closed' && <Badge variant="secondary">마감</Badge>}
                  </div>
                  {interview.setDescription && (
                    <p className="truncate text-xs text-slate-500">{interview.setDescription}</p>
                  )}
                  <p className="text-xs text-slate-500">출제일 {formatDate(interview.createdAt)}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/dashboard/student/interviews/${interview.sessionId}`}>문제 보기</Link>
                  </Button>
                  {interview.studentTaskId && (
                    <Button asChild size="sm">
                      <Link href={`/dashboard/student/tasks/${interview.studentTaskId}`}>복기 과제 하러 가기</Link>
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  )
}
