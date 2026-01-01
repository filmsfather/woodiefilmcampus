import Link from 'next/link'
import { redirect } from 'next/navigation'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { requireAuthForDashboard } from '@/lib/auth'
import DateUtil from '@/lib/date-util'
import {
  fetchClassLearningJournalTemplate,
  fetchLearningJournalPeriodStats,
  fetchTeacherLearningJournalOverview,
} from '@/lib/learning-journals'
import { createClient as createServerSupabase } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { LearningJournalStudentSnapshot, LearningJournalSubject } from '@/types/learning-journal'
import { LEARNING_JOURNAL_SUBJECTS } from '@/types/learning-journal'
import { RegeneratePeriodButton } from '@/components/dashboard/teacher/learning-journal/RegeneratePeriodButton'
import { PeriodSelector } from '@/components/dashboard/teacher/learning-journal/PeriodSelector'
import { ClassTemplateEditorClient } from '@/components/dashboard/teacher/learning-journal/ClassTemplateEditorClient'

function toProgressLabel(submitted: number, total: number) {
  if (total === 0) {
    return '0%'
  }
  const percent = Math.round((submitted / total) * 100)
  return `${percent}%`
}

function resolveStatusLabel(status: string) {
  switch (status) {
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

export default async function TeacherLearningJournalPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { profile } = await requireAuthForDashboard(['teacher', 'manager'])

  if (!profile) {
    return null
  }

  const searchParams = await props.searchParams

  const includeAllClasses = profile.role === 'principal' || profile.role === 'manager'
  const fallbackHref =
    profile.role === 'principal'
      ? '/dashboard/principal'
      : profile.role === 'manager'
        ? '/dashboard/manager'
        : '/dashboard/teacher'

  const overview = await fetchTeacherLearningJournalOverview(profile.id, { includeAllClasses })
  const periods = overview.periods.filter((period) => period.status !== 'completed')
  const periodIds = periods.map((period) => period.id)

  // Parallel fetch for stats
  const statsPromise = fetchLearningJournalPeriodStats(periodIds)

  const selectedParam = typeof searchParams?.period === 'string' ? searchParams.period : null
  const classIdParam = typeof searchParams?.classId === 'string' ? searchParams.classId : null
  const weekParam = typeof searchParams?.week === 'string' ? Number.parseInt(searchParams.week, 10) : null
  const subjectParam = typeof searchParams?.subject === 'string' ? searchParams.subject : null

  let selectedPeriod = null

  if (selectedParam) {
    selectedPeriod = periods.find((period) => period.id === selectedParam) ?? null
  } else if (classIdParam) {
    selectedPeriod = periods.find((period) => period.classId === classIdParam) ?? null
  }

  if (!selectedPeriod) {
    selectedPeriod = periods[0] ?? null
  }

  // 유효한 주차 및 과목 파라미터 검증
  const validWeek = weekParam && weekParam >= 1 && weekParam <= 4 ? weekParam : null
  const validSubject = subjectParam && LEARNING_JOURNAL_SUBJECTS.includes(subjectParam as LearningJournalSubject)
    ? (subjectParam as LearningJournalSubject)
    : null

  const stats = await statsPromise
  const studentSnapshotsByPeriod =
    overview.studentSnapshots ?? new Map<string, LearningJournalStudentSnapshot[]>()

  const selectedSnapshots = selectedPeriod
    ? studentSnapshotsByPeriod.get(selectedPeriod.id) ?? []
    : []
  const selectedStats = selectedPeriod ? stats.get(selectedPeriod.id) ?? null : null

  // period 파라미터 없이 접근했을 때 첫 번째 학생 엔트리로 리다이렉트
  // (classId만 있거나 파라미터가 없는 경우)
  if (!selectedParam && selectedSnapshots.length > 0) {
    const sortedSnapshots = [...selectedSnapshots].sort((a, b) => 
      (a.name ?? '').localeCompare(b.name ?? '', 'ko')
    )
    const firstEntry = sortedSnapshots[0]
    if (firstEntry?.entryId) {
      redirect(`/dashboard/teacher/learning-journal/entries/${firstEntry.entryId}`)
    }
  }
  const debugMessages = selectedSnapshots
    .filter((snapshot) => !snapshot.name)
    .map((snapshot) => {
      const emailInfo = snapshot.email ? ` 이메일: ${snapshot.email}` : ''
      return `학생 ID: ${snapshot.studentId}${emailInfo}`
    })

  // Template Data Fetching
  let template = null
  let materials: Record<LearningJournalSubject, Array<{
    id: string
    title: string
    description: string | null
    subject: LearningJournalSubject
    display: string
    weekLabel: string | null
  }>> = LEARNING_JOURNAL_SUBJECTS.reduce((acc, subject) => {
    acc[subject] = []
    return acc
  }, {} as any)

  if (selectedPeriod) {
    template = await fetchClassLearningJournalTemplate(selectedPeriod.classId, selectedPeriod.id)

    const supabase = await createServerSupabase()
    const { data: materialRows, error: materialError } = await supabase
      .from('class_material_posts')
      .select('id, subject, title, description, week_label')
      .in('subject', LEARNING_JOURNAL_SUBJECTS)
      .order('created_at', { ascending: false })
      .limit(120)

    if (materialError) {
      console.error('[learning-journal] template material fetch error', materialError)
    }

    for (const row of materialRows ?? []) {
      const subject = row.subject as LearningJournalSubject
      if (!LEARNING_JOURNAL_SUBJECTS.includes(subject)) {
        continue
      }

      const display = row.description && row.description.trim().length > 0
        ? `${row.title} - ${row.description}`
        : row.title
      const weekLabel = row.week_label ? String(row.week_label) : null

      materials[subject].push({
        id: row.id,
        title: row.title,
        description: row.description ?? null,
        subject,
        display,
        weekLabel,
      })
    }
  }

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
          <div className="flex flex-col gap-4">
            <label className="text-sm font-medium text-slate-700">주기 선택</label>
            <PeriodSelector periods={periods} selectedPeriodId={selectedPeriod?.id ?? ''} />
          </div>

          {selectedPeriod ? (
            <div className="space-y-12">
              {/* Section 1: Student Status */}
              <div className="space-y-4">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h2 className="text-xl font-semibold text-slate-900">
                      학습 현황
                    </h2>
                    <p className="text-sm text-slate-500">
                      학생별 학습일지를 작성하고 공개 상태를 확인하세요.
                    </p>
                  </div>
                  {selectedStats ? (
                    <div className="flex gap-2 text-sm text-slate-600">
                      <Badge variant="outline">총 {selectedStats.totalEntries}명</Badge>
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
              </div>

              {/* Section 2: Monthly Plan */}
              <div className="space-y-4">
                <div className="border-t border-slate-200 pt-8">
                  <h2 className="text-xl font-semibold text-slate-900">
                    월간 계획 (템플릿)
                  </h2>
                  <p className="text-sm text-slate-500 mt-1">
                    반별 주차 템플릿을 구성하여 학생 일지에 반영하세요.
                  </p>
                </div>

                {template ? (
                  <ClassTemplateEditorClient
                    classId={selectedPeriod.classId}
                    periodId={selectedPeriod.id}
                    template={template}
                    materials={materials}
                  />
                ) : (
                  <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
                    템플릿 정보를 불러오지 못했습니다.
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </section>
  )
}
