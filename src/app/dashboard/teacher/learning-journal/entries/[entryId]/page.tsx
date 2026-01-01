import { notFound } from 'next/navigation'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { requireAuthForDashboard } from '@/lib/auth'
import DateUtil from '@/lib/date-util'
import { createClient as createServerSupabase } from '@/lib/supabase/server'
import {
  deriveMonthTokensForRange,
  fetchLearningJournalAcademicEvents,
  fetchLearningJournalComments,
  fetchLearningJournalEntriesForPeriod,
  fetchLearningJournalEntryDetail,
  fetchLearningJournalGreeting,
  refreshLearningJournalWeeklyData,
  LEARNING_JOURNAL_SUBJECT_OPTIONS,
} from '@/lib/learning-journals'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CommentEditor } from '@/components/dashboard/teacher/learning-journal/CommentEditor'
import { EntryStatusPanel } from '@/components/dashboard/teacher/learning-journal/EntryStatusPanel'
import { RegenerateWeeklyButton } from '@/components/dashboard/teacher/learning-journal/RegenerateWeeklyButton'
import { LearningJournalEntryEditor } from '@/components/dashboard/teacher/learning-journal/LearningJournalEntryEditor'
import { LEARNING_JOURNAL_SUBJECTS, type LearningJournalSubject } from '@/types/learning-journal'

interface PageParams {
  entryId: string
}

const STATUS_LABEL: Record<'draft' | 'published' | 'archived', string> = {
  draft: '작성 중',
  published: '공개 완료',
  archived: '보관',
}

export default async function TeacherLearningJournalEntryPage(props: { params: Promise<PageParams> }) {
  const { profile } = await requireAuthForDashboard(['teacher', 'manager'])
  const params = await props.params

  // 페이지 로드 시 항상 주차별 데이터를 최신 상태로 갱신
  await refreshLearningJournalWeeklyData(params.entryId)

  const entry = await fetchLearningJournalEntryDetail(params.entryId)

  if (!entry) {
    notFound()
  }

  const supabase = await createServerSupabase()

  const { data: periodRow, error: periodError } = await supabase
    .from('learning_journal_periods')
    .select(
      `id,
       class_id,
       start_date,
       end_date,
       label,
       status,
       classes:classes!learning_journal_periods_class_id_fkey(id, name)
      `
    )
    .eq('id', entry.periodId)
    .maybeSingle()

  if (periodError) {
    console.error('[learning-journal] entry period fetch error', periodError)
  }

  if (!periodRow) {
    notFound()
  }

  const classInfo = Array.isArray(periodRow.classes) ? periodRow.classes[0] : periodRow.classes

  const { data: studentRow, error: studentError } = await supabase
    .from('profiles')
    .select('id, name, email')
    .eq('id', entry.studentId)
    .maybeSingle()

  if (studentError) {
    console.error('[learning-journal] entry student fetch error', studentError)
  }

  const studentName = studentRow?.name ?? studentRow?.email ?? '학생 정보 없음'

  const comments = await fetchLearningJournalComments(entry.id)
  const commentLookup = new Map(
    comments.map((comment) => {
      const key = comment.roleScope === 'homeroom' ? 'homeroom' : `subject:${comment.subject}`
      return [key, comment.body ?? ''] as const
    })
  )

  const monthTokens = deriveMonthTokensForRange(periodRow.start_date, periodRow.end_date)
  const primaryMonth = monthTokens[0]
  const greeting = primaryMonth ? await fetchLearningJournalGreeting(primaryMonth) : null
  const academicEvents = monthTokens.length > 0 ? await fetchLearningJournalAcademicEvents(monthTokens) : []

  // 과목별 수업 자료 가져오기
  const { data: materialRows, error: materialError } = await supabase
    .from('class_material_posts')
    .select('id, subject, title, description, week_label')
    .in('subject', LEARNING_JOURNAL_SUBJECTS)
    .order('created_at', { ascending: false })
    .limit(120)

  if (materialError) {
    console.error('[learning-journal] material fetch error', materialError)
  }

  const materials: Record<LearningJournalSubject, Array<{
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

  const fallbackHref = profile?.role === 'principal'
    ? '/dashboard/principal/learning-journal/review'
    : profile?.role === 'manager'
      ? '/dashboard/manager/learning-journal'
      : `/dashboard/teacher/learning-journal?period=${periodRow.id}`

  const periodEntriesRaw = await fetchLearningJournalEntriesForPeriod(entry.periodId)
  const periodEntries = periodEntriesRaw.sort((a, b) => 
    a.studentName.localeCompare(b.studentName, 'ko')
  )

  // 같은 기간에 다른 반의 period 가져오기 (반 전환용)
  const { data: samePeriodClasses } = await supabase
    .from('learning_journal_periods')
    .select(`
      id,
      class_id,
      classes:classes!learning_journal_periods_class_id_fkey(id, name),
      entries:learning_journal_entries(
        id,
        student:profiles!learning_journal_entries_student_id_fkey(id, name)
      )
    `)
    .eq('start_date', periodRow.start_date)
    .eq('end_date', periodRow.end_date)
    .order('class_id')

  const availableClasses = (samePeriodClasses ?? [])
    .map((p) => {
      const cls = Array.isArray(p.classes) ? p.classes[0] : p.classes
      const entries = (p.entries ?? []) as Array<{ id: string; student: { id: string; name: string | null } | { id: string; name: string | null }[] | null }>
      
      // 첫 번째 학생 엔트리 찾기 (이름순 정렬)
      const sortedEntries = entries
        .map((e) => {
          const student = Array.isArray(e.student) ? e.student[0] : e.student
          return {
            entryId: e.id,
            studentName: student?.name ?? '',
          }
        })
        .filter((e) => e.studentName)
        .sort((a, b) => a.studentName.localeCompare(b.studentName, 'ko'))
      
      const firstEntry = sortedEntries[0]

      return {
        periodId: p.id,
        classId: p.class_id,
        className: cls?.name ?? '반 미지정',
        firstEntryId: firstEntry?.entryId ?? null,
      }
    })
    .filter((c) => c.className !== '반 미지정' && c.firstEntryId)
    .sort((a, b) => a.className.localeCompare(b.className, 'ko'))

  // 과제 배치 변경을 위한 available periods 가져오기 (최근 6개월)
  const { data: availablePeriodsData } = await supabase
    .from('learning_journal_periods')
    .select('id, label, start_date, end_date')
    .eq('class_id', periodRow.class_id)
    .order('start_date', { ascending: false })
    .limit(6)

  const availablePeriods = (availablePeriodsData ?? []).map((p) => ({
    id: p.id,
    label: p.label ?? `${p.start_date} ~ ${p.end_date}`,
    startDate: p.start_date,
    endDate: p.end_date,
  }))

  return (
    <section className="space-y-6">
      <DashboardBackLink
        fallbackHref={fallbackHref}
        label="학습일지 개요로 돌아가기"
      />
      <h1 className="text-3xl font-semibold text-slate-900">학습일지 작성</h1>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <LearningJournalEntryEditor
            classId={periodRow.class_id}
            periodId={periodRow.id}
            entryId={entry.id}
            className={classInfo?.name ?? '반 미지정'}
            header={{
              title: studentName,
              subtitle: `${classInfo?.name ?? '반 미지정'} · ${periodRow.label ?? `${periodRow.start_date} ~ ${periodRow.end_date}`
                }`,
              meta: [
                {
                  label: '제출 상태',
                  value: STATUS_LABEL[entry.status] ?? entry.status,
                },
                {
                  label: '공개일',
                  value: entry.publishedAt
                    ? DateUtil.formatForDisplay(entry.publishedAt, {
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
                  value: DateUtil.formatForDisplay(entry.updatedAt, {
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
            summary={entry.summary}
            weekly={entry.weekly}
            comments={comments}
            materials={materials}
            availablePeriods={availablePeriods}
            entries={periodEntries}
            availableClasses={availableClasses}
            currentClassId={periodRow.class_id}
            commentSlot={
              <section className="space-y-4">
                <CommentEditor
                  entryId={entry.id}
                  roleScope="homeroom"
                  label="담임 코멘트"
                  description="학생의 전반적인 학습 태도와 전달 사항을 작성하세요."
                  defaultValue={commentLookup.get('homeroom') ?? ''}
                />

                <div className="grid gap-4 md:grid-cols-2">
                  {LEARNING_JOURNAL_SUBJECT_OPTIONS.map((option) => {
                    const key = `subject:${option.value}`
                    return (
                      <CommentEditor
                        key={option.value}
                        entryId={entry.id}
                        roleScope="subject"
                        subject={option.value}
                        label={`${option.label} 코멘트`}
                        description="수업 참여도, 과제 피드백 등을 기록하세요."
                        defaultValue={commentLookup.get(key) ?? ''}
                      />
                    )
                  })}
                </div>
              </section>
            }
          />

          <RegenerateWeeklyButton entryId={entry.id} />
        </div>

        <div className="space-y-6">
          <EntryStatusPanel status={entry.status} />

          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle className="text-lg text-slate-900">기본 정보</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-600">
              <div className="flex justify-between">
                <span className="text-slate-500">작성 상태</span>
                <span className="font-medium text-slate-900">{STATUS_LABEL[entry.status] ?? entry.status}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">완료율</span>
                <span className="font-medium text-slate-900">
                  {entry.completionRate !== null ? `${Math.round(entry.completionRate)}%` : '정보 없음'}
                </span>
              </div>
              <div className="space-y-1">
                <p className="text-slate-500">최근 업데이트</p>
                <p className="font-medium text-slate-900">
                  {DateUtil.formatForDisplay(entry.updatedAt, {
                    locale: 'ko-KR',
                    timeZone: 'Asia/Seoul',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  )
}
