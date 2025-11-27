import Link from 'next/link'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { requireAuthForDashboard } from '@/lib/auth'
import DateUtil from '@/lib/date-util'
import {
  fetchLearningJournalPeriodStats,
  fetchTeacherLearningJournalOverview,
} from '@/lib/learning-journals'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { LearningJournalStudentSnapshot } from '@/types/learning-journal'
import { RegeneratePeriodButton } from '@/components/dashboard/teacher/learning-journal/RegeneratePeriodButton'

function toProgressLabel(submitted: number, total: number) {
  if (total === 0) {
    return '0%'
  }
  const percent = Math.round((submitted / total) * 100)
  return `${percent}%`
}

function buildPeriodHref(periodId: string) {
  const params = new URLSearchParams()
  params.set('period', periodId)
  return `/dashboard/teacher/learning-journal?${params.toString()}`
}

function resolveStatusLabel(status: string) {
  switch (status) {
    case 'submitted':
      return '제출 완료'
    case 'published':
      return '공개 완료'
    case 'draft':
      return '작성 중'
    case 'archived':
      return '보관'
    default:
      return status
  }
}

export default async function TeacherLearningJournalPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>
}) {
  const { profile } = await requireAuthForDashboard(['teacher', 'manager'])

  if (!profile) {
    return null
  }

  const includeAllClasses = profile.role === 'principal' || profile.role === 'manager'
  const fallbackHref =
    profile.role === 'principal'
      ? '/dashboard/principal'
      : profile.role === 'manager'
        ? '/dashboard/manager'
        : '/dashboard/teacher'
  const overview = await fetchTeacherLearningJournalOverview(profile.id, { includeAllClasses })
  const periods = overview.periods
  const periodIds = periods.map((period) => period.id)
  const stats = await fetchLearningJournalPeriodStats(periodIds)
  const selectedParam = typeof searchParams?.period === 'string' ? searchParams.period : null
  const selectedPeriod = selectedParam
    ? periods.find((period) => period.id === selectedParam)
    : periods[0] ?? null

  const studentSnapshotsByPeriod =
    overview.studentSnapshots ?? new Map<string, LearningJournalStudentSnapshot[]>()

  const selectedSnapshots = selectedPeriod
    ? studentSnapshotsByPeriod.get(selectedPeriod.id) ?? []
    : []
  const selectedStats = selectedPeriod ? stats.get(selectedPeriod.id) ?? null : null
  const debugMessages = selectedSnapshots
    .filter((snapshot) => !snapshot.name)
    .map((snapshot) => {
      const emailInfo = snapshot.email ? ` 이메일: ${snapshot.email}` : ''
      return `학생 ID: ${snapshot.studentId}${emailInfo}`
    })

  return (
    <section className="space-y-8">
      <div className="space-y-3">
        <DashboardBackLink fallbackHref={fallbackHref} label="학습일지 허브로 돌아가기" />
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold text-slate-900">학습일지</h1>
          <p className="text-sm text-slate-600">
            {includeAllClasses
              ? '원장 권한으로 모든 반의 학습일지를 확인하고 관리할 수 있습니다.'
              : `${profile.name ?? profile.email} 님, 담당 반의 학습일지를 작성하고 제출 현황을 확인하세요.`}
          </p>
        </header>
      </div>

      {periods.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
          아직 학습일지 주기가 생성되지 않았습니다. 실장에게 주기 생성을 요청해주세요.
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {periods.map((period) => {
              const stat = stats.get(period.id)
              const submitted = stat?.submittedCount ?? 0
              const total = stat?.totalEntries ?? period.studentCount
              const published = stat?.publishedCount ?? 0
              return (
                <Card
                  key={period.id}
                  className="border-slate-200 shadow-sm transition hover:-translate-y-1 hover:shadow-md"
                >
                  <CardHeader className="space-y-2">
                    <CardTitle className="text-lg text-slate-900">{period.className}</CardTitle>
                    <CardDescription className="text-sm text-slate-500">
                      {period.startDate} ~ {period.endDate}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3">
                    <div className="flex items-center justify-between text-sm text-slate-600">
                      <span>학생 수</span>
                      <span>{period.studentCount}명</span>
                    </div>
                    <div className="flex items-center justify-between text-sm text-slate-600">
                      <span>제출 완료</span>
                      <span>
                        {submitted} / {total} ({toProgressLabel(submitted, total)})
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm text-slate-600">
                      <span>공개 완료</span>
                      <span>
                        {published} / {total}
                      </span>
                    </div>
                    <Button asChild variant={selectedPeriod?.id === period.id ? 'default' : 'outline'}>
                      <Link href={buildPeriodHref(period.id)}>
                        {selectedPeriod?.id === period.id ? '현재 선택됨' : '학생 목록 열기'}
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          {selectedPeriod ? (
            <div className="space-y-4">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">
                    {selectedPeriod.className} · {selectedPeriod.startDate} ~ {selectedPeriod.endDate}
                  </h2>
                  <p className="text-sm text-slate-500">
                    학생별 학습일지를 작성하고 제출 상태를 업데이트하세요.
                  </p>
                </div>
                {selectedStats ? (
                  <div className="flex gap-2 text-sm text-slate-600">
                    <Badge variant="outline">총 {selectedStats.totalEntries}명</Badge>
                    <Badge variant="outline">제출 {selectedStats.submittedCount}</Badge>
                    <Badge variant="outline">공개 {selectedStats.publishedCount}</Badge>
                    <RegeneratePeriodButton periodId={selectedPeriod.id} />
                  </div>
                ) : null}
              </div>

              {selectedSnapshots.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
                  아직 학생이 배정되지 않았습니다.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>학생</TableHead>
                        <TableHead className="hidden md:table-cell">상태</TableHead>
                        <TableHead className="hidden md:table-cell">완료율</TableHead>
                        <TableHead className="hidden lg:table-cell">제출일</TableHead>
                        <TableHead className="hidden lg:table-cell">공개일</TableHead>
                        <TableHead className="text-right">작업</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedSnapshots.map((snapshot) => {
                        const completionRate = snapshot.completionRate ?? 0
                        const entryHref = snapshot.entryId
                          ? `/dashboard/teacher/learning-journal/entries/${snapshot.entryId}`
                          : `/dashboard/teacher/learning-journal/entries/new?student=${snapshot.studentId}&period=${selectedPeriod.id}`
                        return (
                          <TableRow key={snapshot.studentId}>
                            <TableCell className="font-medium text-slate-900">
                              {snapshot.name ?? snapshot.email ?? '학생 정보 없음'}
                            </TableCell>
                            <TableCell className="hidden md:table-cell text-sm text-slate-600">
                              {resolveStatusLabel(snapshot.status)}
                            </TableCell>
                            <TableCell className="hidden md:table-cell text-sm text-slate-600">
                              {Math.round(completionRate)}%
                            </TableCell>
                            <TableCell className="hidden lg:table-cell text-xs text-slate-500">
                              {snapshot.submittedAt
                                ? DateUtil.formatForDisplay(snapshot.submittedAt, {
                                  locale: 'ko-KR',
                                  timeZone: 'Asia/Seoul',
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                                : '-'}
                            </TableCell>
                            <TableCell className="hidden lg:table-cell text-xs text-slate-500">
                              {snapshot.publishedAt
                                ? DateUtil.formatForDisplay(snapshot.publishedAt, {
                                  locale: 'ko-KR',
                                  timeZone: 'Asia/Seoul',
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                                : '-'}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button asChild size="sm">
                                <Link href={entryHref}>
                                  {snapshot.entryId ? '학습일지 열기' : '학습일지 생성'}
                                </Link>
                              </Button>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}
      {debugMessages.length > 0 ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-700">
          <p className="font-semibold">이름이 비어 있는 학생이 있습니다.</p>
          <ul className="mt-2 list-disc space-y-1 pl-4">
            {debugMessages.map((message) => (
              <li key={message} className="font-mono text-xs">
                {message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}
