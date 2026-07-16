import type { Metadata } from 'next'
import Link from 'next/link'
import { PenLine } from 'lucide-react'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import DateUtil from '@/lib/date-util'
import { requireAuthForDashboard } from '@/lib/auth'
import { fetchStudentWritingList } from '@/lib/writings'
import type { WritingAttemptStatus } from '@/types/writing'

export const metadata: Metadata = {
  title: '모의 작문 | Woodie Film Campus',
  description: '출제된 모의 작문 시험을 확인하세요.',
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

const STATUS_LABELS: Record<WritingAttemptStatus, string> = {
  assigned: '시작 전',
  in_progress: '응시 중',
  submitted: '제출 완료',
  task_created: '오답노트 발부됨',
}

function statusBadgeVariant(status: WritingAttemptStatus): 'default' | 'secondary' | 'outline' {
  if (status === 'task_created' || status === 'submitted') return 'default'
  if (status === 'in_progress') return 'secondary'
  return 'outline'
}

export default async function StudentWritingListPage() {
  const { profile } = await requireAuthForDashboard('student')

  if (!profile) {
    return null
  }

  const exams = await fetchStudentWritingList(profile.id)

  return (
    <section className="space-y-6">
      <div className="space-y-3">
        <DashboardBackLink fallbackHref="/dashboard/student" label="대시보드로 돌아가기" />
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-slate-900">모의 작문</h1>
          <p className="text-sm text-slate-600">
            시험을 시작하면 문제가 공개되고 제한시간이 시작됩니다. 시간 안에 손으로 쓴 원고를 사진으로 찍어
            제출하세요.
          </p>
        </div>
      </div>

      {exams.length === 0 ? (
        <Card className="border-dashed border-slate-300 bg-slate-50">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center text-sm text-slate-500">
            <PenLine className="h-6 w-6 text-slate-400" />
            <p>아직 출제된 모의 작문이 없습니다.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {exams.map((exam) => (
            <Card key={exam.sessionId} className="border-slate-200">
              <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-slate-900">{exam.setTitle}</p>
                    <Badge variant={statusBadgeVariant(exam.attemptStatus)}>
                      {STATUS_LABELS[exam.attemptStatus]}
                    </Badge>
                    {exam.sessionStatus === 'closed' && <Badge variant="secondary">마감</Badge>}
                  </div>
                  {exam.setDescription && (
                    <p className="truncate text-xs text-slate-500">{exam.setDescription}</p>
                  )}
                  <p className="text-xs text-slate-500">
                    제한시간 {exam.timeLimitMinutes}분 · 출제일 {formatDate(exam.createdAt)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button asChild size="sm" variant={exam.attemptStatus === 'assigned' ? 'default' : 'outline'}>
                    <Link href={`/dashboard/student/writing/${exam.sessionId}`}>
                      {exam.attemptStatus === 'assigned'
                        ? '시험 보러 가기'
                        : exam.attemptStatus === 'in_progress'
                          ? '응시 이어서 하기'
                          : '제출물 확인'}
                    </Link>
                  </Button>
                  {exam.studentTaskId && (
                    <Button asChild size="sm">
                      <Link href={`/dashboard/student/tasks/${exam.studentTaskId}`}>오답노트 하러 가기</Link>
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
