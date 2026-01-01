import { ClassPeriodSelector } from '@/components/dashboard/principal/ClassPeriodSelector'
import { LearningJournalEntryEditor } from '@/components/dashboard/teacher/learning-journal/LearningJournalEntryEditor'
import { requireAuthForDashboard } from '@/lib/auth'
import DateUtil from '@/lib/date-util'
import { createClient as createServerSupabase } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { updateEntryStatusByPrincipalAction, bulkPublishEntriesAction } from '@/app/dashboard/principal/learning-journal/actions'
import type {
  LearningJournalAcademicEvent,
  LearningJournalAnnualSchedule,
  LearningJournalGreeting,
  LearningJournalSubject,
} from '@/types/learning-journal'
import { LEARNING_JOURNAL_SUBJECTS } from '@/types/learning-journal'
import {
  deriveMonthTokensForRange,
  fetchLearningJournalAcademicEvents,
  fetchLearningJournalAnnualSchedules,
  fetchLearningJournalEntriesForReview,
  fetchLearningJournalEntryDetail,
  fetchLearningJournalGreeting,
  fetchLearningJournalComments,
  fetchLearningJournalShareToken,
  refreshLearningJournalWeeklyData,
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
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const { profile } = await requireAuthForDashboard(['principal', 'manager'])
  const canApprove = profile?.role === 'principal'

  const resolvedSearchParams = await searchParams
  const supabase = await createServerSupabase()

  const [{ data: classRows }, { data: periodRows }] = await Promise.all([
    supabase.from('classes').select('id, name').order('name', { ascending: true }),
    supabase
      .from('learning_journal_periods')
      .select('id, label, class_id, start_date, end_date')
      .order('start_date', { ascending: false }),
  ])

  const classes = (classRows ?? []).map((row) => ({ id: row.id, name: row.name ?? '반 미지정' }))

  const classParam = typeof resolvedSearchParams?.class === 'string' ? resolvedSearchParams.class : classes[0]?.id ?? null

  const periodsForClass = (periodRows ?? []).filter((period) => period.class_id === classParam)
  const periodParamRaw = typeof resolvedSearchParams?.period === 'string' ? resolvedSearchParams.period : null
  let periodParam: 'all' | string = 'all'
  if (periodParamRaw) {
    if (periodParamRaw === 'all') {
      periodParam = 'all'
    } else if (periodsForClass.some((period) => period.id === periodParamRaw)) {
      periodParam = periodParamRaw
    }
  }

  const entryIdParam = typeof resolvedSearchParams?.entry === 'string' ? resolvedSearchParams.entry : null

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
    // 페이지 로드 시 주차별 데이터를 최신 상태로 갱신
    await refreshLearningJournalWeeklyData(entryIdParam)
    targetEntry = await fetchLearningJournalEntryDetail(entryIdParam)
    comments = await fetchLearningJournalComments(entryIdParam)
  }

  let greeting: LearningJournalGreeting | null = null
  let academicEvents: LearningJournalAcademicEvent[] = []
  let annualSchedules: LearningJournalAnnualSchedule[] = []
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
  }, {} as Record<LearningJournalSubject, Array<{
    id: string
    title: string
    description: string | null
    subject: LearningJournalSubject
    display: string
    weekLabel: string | null
  }>>)
  let availablePeriods: Array<{ id: string; label: string; startDate: string; endDate: string }> = []
  let periodClassId: string | null = null

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

    annualSchedules = await fetchLearningJournalAnnualSchedules()

    // 수업 자료 가져오기
    const { data: materialRows } = await supabase
      .from('class_material_posts')
      .select('id, subject, title, description, week_label')
      .in('subject', LEARNING_JOURNAL_SUBJECTS)
      .order('created_at', { ascending: false })
      .limit(120)

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

    // period의 class_id 가져오기
    const { data: periodRow } = await supabase
      .from('learning_journal_periods')
      .select('class_id')
      .eq('id', targetEntry.periodId)
      .maybeSingle()

    periodClassId = periodRow?.class_id ?? null

    // 과제 배치 변경을 위한 available periods 가져오기
    if (periodClassId) {
      const { data: availablePeriodsData } = await supabase
        .from('learning_journal_periods')
        .select('id, label, start_date, end_date')
        .eq('class_id', periodClassId)
        .order('start_date', { ascending: false })
        .limit(6)

      availablePeriods = (availablePeriodsData ?? []).map((p) => ({
        id: p.id,
        label: p.label ?? `${p.start_date} ~ ${p.end_date}`,
        startDate: p.start_date,
        endDate: p.end_date,
      }))
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

  const smsEnvStatus = [
    { label: 'SOLAPI_API_KEY', ok: Boolean(process.env.SOLAPI_API_KEY) },
    { label: 'SOLAPI_API_SECRET', ok: Boolean(process.env.SOLAPI_API_SECRET) },
    { label: 'SOLAPI_SENDER_NUMBER', ok: Boolean(process.env.SOLAPI_SENDER_NUMBER) },
    { label: 'NEXT_PUBLIC_SITE_URL', ok: Boolean(process.env.NEXT_PUBLIC_SITE_URL) },
  ] as const

  const isSmsReady = smsEnvStatus.every((item) => item.ok)

  return (
    <section className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold text-slate-900">학습일지 승인</h1>
        <p className="text-sm text-slate-600">
          상단에서 승인 대기 학습일지를 훑어보고, 아래에서 반·주기를 선택해 전체 상태를 검토하세요.
        </p>
      </header>

      <Card className={isSmsReady ? 'border-emerald-200' : 'border-amber-300'}>
        <CardHeader>
          <CardTitle className="text-lg text-slate-900">학부모 문자 발송 환경</CardTitle>
          <CardDescription>공유 링크 문자 발송에 필요한 환경 변수의 설정 상태입니다.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex flex-wrap gap-2">
            {smsEnvStatus.map((item) => (
              <span
                key={item.label}
                className={`rounded-full px-3 py-1 text-xs font-medium ${item.ok ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}
              >
                {item.label}: {item.ok ? 'OK' : '설정 필요'}
              </span>
            ))}
          </div>
          <p className="text-xs text-slate-500">
            {isSmsReady
              ? '모든 값이 정상적으로 감지되었습니다. 승인 시 학부모에게 문자가 발송됩니다.'
              : '하나 이상의 값이 비어 있습니다. 환경 변수를 다시 설정한 뒤 재배포해야 문자 발송이 동작합니다.'}
          </p>
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-lg text-slate-900">반 · 주기 선택</CardTitle>
          <CardDescription>반을 고른 뒤 주기를 선택하면 해당 범위의 학습일지를 모두 확인할 수 있습니다.</CardDescription>
        </CardHeader>
        <CardContent>
          {classes.length > 0 ? (
            <ClassPeriodSelector
              classes={classes}
              periods={periodsForClass}
              students={filteredEntries}
              selectedClassId={classParam}
              selectedPeriodId={periodParam}
              selectedEntryId={entryIdParam}
              basePath="/dashboard/principal/learning-journal/review"
              onBulkPublish={canApprove ? bulkPublishEntriesAction : undefined}
            />
          ) : (
            <p className="text-sm text-slate-500">반 정보가 없습니다. 반 등록 후 다시 확인하세요.</p>
          )}
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
            <div className="space-y-6">
              <LearningJournalEntryEditor
                classId={periodClassId ?? ''}
                periodId={targetEntry.periodId}
                entryId={targetEntry.id}
                className={targetSummary.className ?? '반 미지정'}
                header={{
                  title: targetSummary.studentName ?? targetSummary.studentEmail ?? '학생 정보 없음',
                  subtitle: `${targetSummary.className ?? '-'} · ${targetSummary.periodLabel ?? `${targetSummary.periodStartDate} ~ ${targetSummary.periodEndDate}`
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
                annualSchedules={annualSchedules}
                summary={targetEntry.summary}
                weekly={targetEntry.weekly}
                comments={comments}
                materials={materials}
                availablePeriods={availablePeriods}
              />

              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <form action={publishAction}>
                    <input type="hidden" name="entryId" value={targetEntry.id} />
                    <input type="hidden" name="status" value="published" />
                    <Button
                      type="submit"
                      disabled={!canApprove || targetEntry.status === 'published'}
                    >
                      공개 승인
                    </Button>
                  </form>
                  <form action={revertAction}>
                    <input type="hidden" name="entryId" value={targetEntry.id} />
                    <input type="hidden" name="status" value="draft" />
                    <Button
                      type="submit"
                      variant="outline"
                      disabled={!canApprove || targetEntry.status === 'draft'}
                    >
                      작성 중으로 되돌리기
                    </Button>
                  </form>
                  <RegenerateWeeklyButton entryId={targetEntry.id} />
                </div>

                {!canApprove ? (
                  <p className="text-xs text-slate-500">
                    학습일지 상태 변경은 원장만 할 수 있습니다. 열람용으로 확인해 주세요.
                  </p>
                ) : null}

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
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  )
}
