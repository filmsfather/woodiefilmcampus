import Link from 'next/link'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { LearningJournalEntryContent } from '@/components/dashboard/learning-journal/LearningJournalEntryContent'
import { requireAuthForDashboard } from '@/lib/auth'
import DateUtil from '@/lib/date-util'
import { createClient as createServerSupabase } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { updateEntryStatusByPrincipalAction } from '@/app/dashboard/principal/learning-journal/actions'
import type { LearningJournalAcademicEvent, LearningJournalGreeting } from '@/types/learning-journal'
import {
  deriveMonthTokensForRange,
  fetchLearningJournalAcademicEvents,
  fetchLearningJournalEntriesForReview,
  fetchLearningJournalEntryDetail,
  fetchLearningJournalGreeting,
  fetchLearningJournalComments,
} from '@/lib/learning-journals'
import { RegenerateWeeklyButton } from '@/components/dashboard/teacher/learning-journal/RegenerateWeeklyButton'

const STATUS_LABEL: Record<'submitted' | 'draft' | 'published' | 'archived', string> = {
  submitted: '승인 대기',
  draft: '작성 중',
  published: '공개 완료',
  archived: '보관',
}

const STATUS_OPTIONS: Array<{ value: 'submitted' | 'draft' | 'published' | 'all'; label: string }> = [
  { value: 'submitted', label: '승인 대기' },
  { value: 'published', label: '공개 완료' },
  { value: 'draft', label: '작성 중' },
  { value: 'all', label: '전체' },
]

export default async function PrincipalLearningJournalReviewPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>
}) {
  await requireAuthForDashboard('principal')

  const statusParamRaw = typeof searchParams?.status === 'string' ? searchParams?.status : null
  const statusParam = STATUS_OPTIONS.some((option) => option.value === statusParamRaw)
    ? (statusParamRaw as 'submitted' | 'draft' | 'published' | 'all')
    : 'submitted'

  const supabase = createServerSupabase()

  const [{ data: classRows }, { data: periodRows }] = await Promise.all([
    supabase.from('classes').select('id, name').order('name', { ascending: true }),
    supabase
      .from('learning_journal_periods')
      .select('id, label, class_id, start_date, end_date')
      .order('start_date', { ascending: false }),
  ])

  const classes = (classRows ?? []).map((row) => ({ id: row.id, name: row.name ?? '반 미지정' }))

  const classParam = typeof searchParams?.class === 'string' ? searchParams.class : classes[0]?.id ?? null

  const periodsForClass = (periodRows ?? []).filter((period) => period.class_id === classParam)
  const periodParam = typeof searchParams?.period === 'string' ? searchParams.period : periodsForClass[0]?.id ?? null
  const entryIdParam = typeof searchParams?.entry === 'string' ? searchParams.entry : null

  const entries = await fetchLearningJournalEntriesForReview({ status: statusParam, classId: classParam, periodId: periodParam })

  const targetEntry = entryIdParam ? await fetchLearningJournalEntryDetail(entryIdParam) : null
  const comments = entryIdParam ? await fetchLearningJournalComments(entryIdParam) : []
  const targetSummary = targetEntry ? entries.find((item) => item.id === targetEntry.id) : null

  let greeting: LearningJournalGreeting | null = null
  let academicEvents: LearningJournalAcademicEvent[] = []

  if (targetEntry && targetSummary) {
    const monthTokens = deriveMonthTokensForRange(
      targetSummary.periodStartDate,
      targetSummary.periodEndDate
    )

    if (monthTokens.length > 0) {
      const [fetchedGreeting, fetchedEvents] = await Promise.all([
        fetchLearningJournalGreeting(monthTokens[0]),
        fetchLearningJournalAcademicEvents(monthTokens),
      ])

      greeting = fetchedGreeting
      academicEvents = fetchedEvents
    }
  }

  const publishAction = async (formData: FormData) => {
    'use server'
    await updateEntryStatusByPrincipalAction(formData)
  }

  const revertAction = async (formData: FormData) => {
    'use server'
    await updateEntryStatusByPrincipalAction(formData)
  }

  return (
    <section className="space-y-6">
      <div className="space-y-3">
        <DashboardBackLink fallbackHref="/dashboard/principal" label="원장 대시보드로 돌아가기" />
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold text-slate-900">학습일지 승인</h1>
          <p className="text-sm text-slate-600">제출된 학습일지를 검토하고 공개 여부를 결정하세요.</p>
        </header>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_OPTIONS.map((option) => {
          const params = new URLSearchParams()
          params.set('status', option.value)
          if (classParam) params.set('class', classParam)
          if (periodParam) params.set('period', periodParam)
          if (entryIdParam) params.set('entry', entryIdParam)

          return (
          <Button
            key={option.value}
            asChild
            size="sm"
            variant={option.value === statusParam ? 'default' : 'outline'}
          >
            <Link href={`/dashboard/principal/learning-journal/review?${params.toString()}`}>
              {option.label}
            </Link>
          </Button>
        )})}
      </div>

      {classes.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {classes.map((classItem) => {
            const params = new URLSearchParams()
            params.set('status', statusParam)
            params.set('class', classItem.id)
            if (periodParam) params.set('period', periodParam)
            if (entryIdParam) params.set('entry', entryIdParam)
            return (
              <Button
                key={classItem.id}
                asChild
                size="sm"
                variant={classItem.id === classParam ? 'default' : 'outline'}
              >
                <Link href={`/dashboard/principal/learning-journal/review?${params.toString()}`}>
                  {classItem.name}
                </Link>
              </Button>
            )
          })}
        </div>
      ) : null}

      {periodsForClass.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          {periodsForClass.map((period) => {
            const params = new URLSearchParams()
            params.set('status', statusParam)
            if (classParam) params.set('class', classParam)
            params.set('period', period.id)
            if (entryIdParam) params.set('entry', entryIdParam)
            return (
              <Button
                key={period.id}
                asChild
                size="sm"
                variant={period.id === periodParam ? 'default' : 'outline'}
              >
                <Link href={`/dashboard/principal/learning-journal/review?${params.toString()}`}>
                  {period.label ?? `${period.start_date} ~ ${period.end_date}`}
                </Link>
              </Button>
            )
          })}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[2fr_3fr]">
        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="text-lg text-slate-900">제출 목록</CardTitle>
            <CardDescription>학생 학습일지를 선택해 상세 내용을 확인하세요.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-h-[600px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>학생</TableHead>
                    <TableHead>반</TableHead>
                    <TableHead>기간</TableHead>
                    <TableHead>상태</TableHead>
                    <TableHead className="text-right">업데이트</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-6 text-center text-sm text-slate-500">
                        표시할 학습일지가 없습니다.
                      </TableCell>
                    </TableRow>
                  ) : (
                    entries.map((entry) => {
                      const href = new URLSearchParams()
                      href.set('status', statusParam)
                      if (classParam) href.set('class', classParam)
                      if (periodParam) href.set('period', periodParam)
                      href.set('entry', entry.id)

                      return (
                        <TableRow key={entry.id} className={entry.id === entryIdParam ? 'bg-sky-50' : ''}>
                          <TableCell>
                            <Link
                              href={`/dashboard/principal/learning-journal/review?${href.toString()}`}
                              className="font-medium text-slate-900 hover:underline"
                            >
                              {entry.studentName ?? entry.studentEmail ?? '학생 정보 없음'}
                            </Link>
                          </TableCell>
                          <TableCell>{entry.className ?? '-'}</TableCell>
                          <TableCell>{entry.periodLabel ?? `${entry.periodStartDate} ~ ${entry.periodEndDate}`}</TableCell>
                          <TableCell>{STATUS_LABEL[entry.status] ?? entry.status}</TableCell>
                          <TableCell className="text-right text-xs text-slate-500">
                            {new Date(entry.updatedAt).toLocaleString('ko-KR', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </TableCell>
                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
        <div className="space-y-4 text-sm text-slate-600">
          {!targetEntry || !targetSummary ? (
            <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
              왼쪽 목록에서 학습일지를 선택하세요.
            </div>
          ) : (
            <LearningJournalEntryContent
              header={{
                title: targetSummary.studentName ?? targetSummary.studentEmail ?? '학생 정보 없음',
                subtitle: `${targetSummary.className ?? '-'} · ${
                  targetSummary.periodLabel ?? `${targetSummary.periodStartDate} ~ ${targetSummary.periodEndDate}`
                }`,
                meta: [
                  {
                    label: '제출 상태',
                    value: STATUS_LABEL[targetEntry.status] ?? targetEntry.status,
                  },
                  {
                    label: '공개일',
                    value: targetEntry.publishedAt
                      ? DateUtil.formatForDisplay(targetEntry.publishedAt, {
                          locale: 'ko-KR',
                          timeZone: 'Asia/Seoul',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : '미기록',
                  },
                  {
                    label: '최근 업데이트',
                    value: DateUtil.formatForDisplay(targetEntry.updatedAt, {
                      locale: 'ko-KR',
                      timeZone: 'Asia/Seoul',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    }),
                  },
                ],
              }}
              greeting={greeting}
              academicEvents={academicEvents}
              summary={targetEntry.summary}
              weekly={targetEntry.weekly}
              comments={comments}
              actionPanel={
                <>
                  <form action={publishAction}>
                    <input type="hidden" name="entryId" value={targetEntry.id} />
                    <input type="hidden" name="status" value="published" />
                    <Button type="submit" disabled={targetEntry.status === 'published'}>
                      공개 승인
                    </Button>
                  </form>
                  <form action={revertAction}>
                    <input type="hidden" name="entryId" value={targetEntry.id} />
                    <input type="hidden" name="status" value="draft" />
                    <Button type="submit" variant="outline" disabled={targetEntry.status === 'draft'}>
                      작성 중으로 되돌리기
                    </Button>
                  </form>
                  <RegenerateWeeklyButton entryId={targetEntry.id} />
                </>
              }
            />
          )}
        </div>
      </div>
    </section>
  )
}
