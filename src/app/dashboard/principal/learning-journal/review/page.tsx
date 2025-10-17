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
  fetchLearningJournalShareToken,
} from '@/lib/learning-journals'
import { RegenerateWeeklyButton } from '@/components/dashboard/teacher/learning-journal/RegenerateWeeklyButton'

const STATUS_LABEL: Record<'submitted' | 'draft' | 'published' | 'archived', string> = {
  submitted: '승인 대기',
  draft: '작성 중',
  published: '공개 완료',
  archived: '보관',
}

export default async function PrincipalLearningJournalReviewPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>
}) {
  await requireAuthForDashboard('principal')

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
  const periodParamRaw = typeof searchParams?.period === 'string' ? searchParams.period : null
  let periodParam: 'all' | string = 'all'
  if (periodParamRaw) {
    if (periodParamRaw === 'all') {
      periodParam = 'all'
    } else if (periodsForClass.some((period) => period.id === periodParamRaw)) {
      periodParam = periodParamRaw
    }
  }

  const entryIdParam = typeof searchParams?.entry === 'string' ? searchParams.entry : null

  const pendingEntries = await fetchLearningJournalEntriesForReview({ status: 'submitted' })

  const filteredEntries = classParam
    ? await fetchLearningJournalEntriesForReview({
        status: 'all',
        classId: classParam,
        periodId: periodParam === 'all' ? null : periodParam,
      })
    : []

  const filteredEntryIds = new Set(filteredEntries.map((entry) => entry.id))
  const combinedEntries = [
    ...filteredEntries,
    ...pendingEntries.filter((entry) => !filteredEntryIds.has(entry.id)),
  ]

  const targetSummary = entryIdParam
    ? combinedEntries.find((entry) => entry.id === entryIdParam) ?? null
    : null

  let targetEntry: Awaited<ReturnType<typeof fetchLearningJournalEntryDetail>> | null = null
  let comments: Awaited<ReturnType<typeof fetchLearningJournalComments>> = []

  if (entryIdParam && targetSummary) {
    targetEntry = await fetchLearningJournalEntryDetail(entryIdParam)
    comments = await fetchLearningJournalComments(entryIdParam)
  }

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

  let shareUrl: string | null = null
  if (targetEntry && targetEntry.status === 'published') {
    const token = await fetchLearningJournalShareToken(targetEntry.id)

    if (token) {
      const baseUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ?? ''
      shareUrl = `${baseUrl ? `${baseUrl}` : ''}/learning-journal/share/${token}`
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

  const renderStatusBadge = (status: 'submitted' | 'draft' | 'published' | 'archived') =>
    STATUS_LABEL[status] ?? status

  return (
    <section className="space-y-8">
      <div className="space-y-3">
        <DashboardBackLink fallbackHref="/dashboard/principal" label="원장 대시보드로 돌아가기" />
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold text-slate-900">학습일지 승인</h1>
          <p className="text-sm text-slate-600">
            상단에서 승인 대기 학습일지를 훑어보고, 아래에서 반·주기를 선택해 전체 상태를 검토하세요.
          </p>
        </header>
      </div>

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-lg text-slate-900">승인 대기 학습일지</CardTitle>
          <CardDescription>모든 반의 승인 대기 항목입니다. 클릭하면 아래 상세에서 바로 확인할 수 있습니다.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-h-[360px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>학생</TableHead>
                  <TableHead>반</TableHead>
                  <TableHead>주기</TableHead>
                  <TableHead className="text-right">제출일</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingEntries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-6 text-center text-sm text-slate-500">
                      승인 대기 중인 학습일지가 없습니다.
                    </TableCell>
                  </TableRow>
                ) : (
                  pendingEntries.map((entry) => {
                    const href = new URLSearchParams()
                    if (entry.classId) {
                      href.set('class', entry.classId)
                    }
                    href.set('period', entry.periodId)
                    href.set('entry', entry.id)

                    return (
                      <TableRow key={`pending-${entry.id}`} className={entryIdParam === entry.id ? 'bg-sky-50' : ''}>
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
                        <TableCell className="text-right text-xs text-slate-500">
                          {entry.submittedAt
                            ? DateUtil.formatForDisplay(entry.submittedAt, {
                                locale: 'ko-KR',
                                timeZone: 'Asia/Seoul',
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : '미기록'}
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

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-lg text-slate-900">반 · 주기 선택</CardTitle>
          <CardDescription>반을 고른 뒤 주기를 선택하면 해당 범위의 학습일지를 모두 확인할 수 있습니다.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {classes.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {classes.map((classItem) => {
                const params = new URLSearchParams()
                params.set('class', classItem.id)
                params.set('period', 'all')
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
          ) : (
            <p className="text-sm text-slate-500">반 정보가 없습니다. 반 등록 후 다시 확인하세요.</p>
          )}

          {classParam ? (
            periodsForClass.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                {(() => {
                  const params = new URLSearchParams()
                  params.set('class', classParam)
                  params.set('period', 'all')
                  return (
                    <Button
                      key="period-all"
                      asChild
                      size="sm"
                      variant={periodParam === 'all' ? 'default' : 'outline'}
                    >
                      <Link href={`/dashboard/principal/learning-journal/review?${params.toString()}`}>
                        전체 기간
                      </Link>
                    </Button>
                  )
                })()}
                {periodsForClass.map((period) => {
                  const params = new URLSearchParams()
                  params.set('class', classParam)
                  params.set('period', period.id)
                  return (
                    <Button
                      key={period.id}
                      asChild
                      size="sm"
                      variant={periodParam === period.id ? 'default' : 'outline'}
                    >
                      <Link href={`/dashboard/principal/learning-journal/review?${params.toString()}`}>
                        {period.label ?? `${period.start_date} ~ ${period.end_date}`}
                      </Link>
                    </Button>
                  )
                })}
              </div>
            ) : (
              <p className="text-xs text-slate-500">선택한 반에는 등록된 학습일지 주기가 없습니다.</p>
            )
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-lg text-slate-900">학습일지 목록</CardTitle>
          <CardDescription>선택한 반·주기 조건의 모든 학습일지입니다. 상태와 업데이트 일시를 확인하세요.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-h-[600px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>학생</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead>기간</TableHead>
                  <TableHead className="text-right">최근 업데이트</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEntries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-6 text-center text-sm text-slate-500">
                      표시할 학습일지가 없습니다. 반과 주기를 다시 선택해 보세요.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredEntries.map((entry) => {
                    const href = new URLSearchParams()
                    if (classParam) {
                      href.set('class', classParam)
                    }
                    if (periodParam !== 'all') {
                      href.set('period', periodParam)
                    }
                    href.set('entry', entry.id)

                    return (
                      <TableRow key={`filtered-${entry.id}`} className={entryIdParam === entry.id ? 'bg-sky-50' : ''}>
                        <TableCell>
                          <Link
                            href={`/dashboard/principal/learning-journal/review?${href.toString()}`}
                            className="font-medium text-slate-900 hover:underline"
                          >
                            {entry.studentName ?? entry.studentEmail ?? '학생 정보 없음'}
                          </Link>
                        </TableCell>
                        <TableCell>{renderStatusBadge(entry.status)}</TableCell>
                        <TableCell>{entry.periodLabel ?? `${entry.periodStartDate} ~ ${entry.periodEndDate}`}</TableCell>
                        <TableCell className="text-right text-xs text-slate-500">
                          {DateUtil.formatForDisplay(entry.updatedAt, {
                            locale: 'ko-KR',
                            timeZone: 'Asia/Seoul',
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

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-lg text-slate-900">상세 보기</CardTitle>
          <CardDescription>목록에서 학습일지를 선택하면 아래에서 전체 내용을 확인할 수 있습니다.</CardDescription>
        </CardHeader>
        <CardContent>
          {!targetEntry || !targetSummary ? (
            <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
              위 목록에서 학습일지를 선택하세요.
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
                    value: renderStatusBadge(targetEntry.status),
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
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
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
                  </div>

                  {shareUrl ? (
                    <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                      <p className="font-medium text-slate-500">학부모 공유 링크</p>
                      <p className="break-all rounded-md bg-white px-3 py-2 text-slate-900 shadow-sm">
                        {shareUrl}
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button asChild size="sm" variant="outline">
                          <a href={shareUrl} target="_blank" rel="noopener noreferrer">
                            새 창에서 열기
                          </a>
                        </Button>
                      </div>
                      <p className="text-[10px] text-slate-500">
                        링크를 받은 학부모는 별도 로그인 없이 학습일지를 확인할 수 있습니다. 안전하게 전달해주세요.
                      </p>
                    </div>
                  ) : targetEntry.status === 'published' ? (
                    <div className="rounded-md border border-dashed border-amber-300 bg-amber-50 p-3 text-xs text-amber-700">
                      공유 링크를 불러오지 못했습니다. 페이지를 새로고침하거나 다시 시도해주세요.
                    </div>
                  ) : null}
                </div>
              }
            />
          )}
        </CardContent>
      </Card>
    </section>
  )
}
