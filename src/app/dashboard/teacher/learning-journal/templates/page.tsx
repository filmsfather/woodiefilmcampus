import Link from 'next/link'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { requireAuthForDashboard } from '@/lib/auth'
import {
  fetchClassLearningJournalTemplate,
  fetchTeacherLearningJournalOverview,
} from '@/lib/learning-journals'
import { createClient as createServerSupabase } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { ClassTemplateEditorClient } from '@/components/dashboard/teacher/learning-journal/ClassTemplateEditorClient'
import { LEARNING_JOURNAL_SUBJECTS, type LearningJournalSubject } from '@/types/learning-journal'

export default async function LearningJournalTemplatePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { profile } = await requireAuthForDashboard(['teacher', 'manager'])
  const resolvedSearchParams = await searchParams

  const includeAllClasses = profile.role === 'principal' || profile.role === 'manager'
  const overview = await fetchTeacherLearningJournalOverview(profile.id, { includeAllClasses })

  const fallbackHref =
    profile.role === 'principal'
      ? '/dashboard/principal/learning-journal'
      : profile.role === 'manager'
        ? '/dashboard/manager/learning-journal'
        : '/dashboard/teacher/learning-journal'

  if (!overview.classes || overview.classes.length === 0) {
    return (
      <section className="space-y-4">
        <DashboardBackLink fallbackHref={fallbackHref} label="학습일지 허브로 돌아가기" />
        <h1 className="text-2xl font-semibold text-slate-900">월간 학습 계획</h1>
        <p className="text-sm text-slate-600">
          {includeAllClasses
            ? '등록된 반이 없어 템플릿을 구성할 수 없습니다.'
            : '담당 반이 있어야 템플릿을 구성할 수 있습니다.'}
        </p>
      </section>
    )
  }

  const classIdParam = typeof resolvedSearchParams?.class === 'string' ? resolvedSearchParams.class : overview.classes[0]?.classId

  const periodsForClass = overview.periods.filter((period) => period.classId === classIdParam)
  const periodIdParam = typeof resolvedSearchParams?.period === 'string' ? resolvedSearchParams.period : periodsForClass[0]?.id

  if (!classIdParam || !periodIdParam) {
    return (
      <section className="space-y-4">
        <DashboardBackLink fallbackHref={fallbackHref} label="학습일지 허브로 돌아가기" />
        <h1 className="text-2xl font-semibold text-slate-900">월간 학습 계획</h1>
        <p className="text-sm text-slate-600">활성화된 학습일지 주기가 없습니다. 실장에게 주기 생성을 요청하세요.</p>
      </section>
    )
  }

  const template = await fetchClassLearningJournalTemplate(classIdParam, periodIdParam)

  const supabase = createServerSupabase()
  const { data: materialRows, error: materialError } = await supabase
    .from('class_material_posts')
    .select('id, subject, title, description, week_label')
    .in('subject', LEARNING_JOURNAL_SUBJECTS)
    .order('created_at', { ascending: false })
    .limit(120)

  if (materialError) {
    console.error('[learning-journal] template material fetch error', materialError)
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

  return (
    <section className="space-y-6">
      <div className="space-y-3">
        <DashboardBackLink fallbackHref={fallbackHref} label="학습일지 허브로 돌아가기" />
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold text-slate-900">월간 학습 계획</h1>
          <p className="text-sm text-slate-600">
            반별 주차 템플릿을 구성하면 학생 학습일지에 자동으로 반영됩니다. 수정 후 학생 일지에서 “템플릿 다시 적용”을 통해 내용이 갱신됩니다.
          </p>
        </header>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        {overview.classes.map((classItem) => (
          <Button
            key={classItem.classId}
            asChild
            variant={classItem.classId === classIdParam ? 'default' : 'outline'}
            size="sm"
          >
            <Link href={`/dashboard/teacher/learning-journal/templates?class=${classItem.classId}`}>
              {classItem.className}
            </Link>
          </Button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        {periodsForClass.map((period) => (
          <Button
            key={period.id}
            asChild
            variant={period.id === periodIdParam ? 'default' : 'outline'}
            size="sm"
          >
            <Link
              href={`/dashboard/teacher/learning-journal/templates?class=${classIdParam}&period=${period.id}`}
            >
              {period.label ?? `${period.startDate} ~ ${period.endDate}`}
            </Link>
          </Button>
        ))}
      </div>

      <ClassTemplateEditorClient
        classId={classIdParam}
        periodId={periodIdParam}
        template={template}
        materials={materials}
      />
    </section>
  )
}
