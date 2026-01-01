import { notFound } from 'next/navigation'

import { LearningJournalEntryContent } from '@/components/dashboard/learning-journal/LearningJournalEntryContent'
import DateUtil from '@/lib/date-util'
import { fetchLearningJournalEntryByShareToken } from '@/lib/learning-journals'

export const dynamic = 'force-dynamic'

const STATUS_LABEL: Record<'draft' | 'published' | 'archived', string> = {
  draft: '작성 중',
  published: '공개 완료',
  archived: '보관',
}

export default async function SharedLearningJournalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const snapshot = await fetchLearningJournalEntryByShareToken(token)

  if (!snapshot) {
    notFound()
  }

  const { entry, period, student, greeting, academicEvents, comments, annualSchedules } = snapshot

  const publishedLabel = entry.publishedAt
    ? DateUtil.formatForDisplay(entry.publishedAt, {
      locale: 'ko-KR',
      timeZone: 'Asia/Seoul',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
    : '미기록'

  const updatedLabel = DateUtil.formatForDisplay(entry.updatedAt, {
    locale: 'ko-KR',
    timeZone: 'Asia/Seoul',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  const headerSubtitle = `${period.className ?? '반 미지정'} · ${period.label ?? `${period.startDate} ~ ${period.endDate}`
    }`

  const headerMeta = [
    {
      label: '공개 상태',
      value: STATUS_LABEL[entry.status] ?? entry.status,
    },
    {
      label: '공개일',
      value: publishedLabel,
    },
    {
      label: '최근 업데이트',
      value: updatedLabel,
    },
  ]

  return (
    <section className="space-y-8">
      <LearningJournalEntryContent
        header={{
          title: student.name ? `${student.name} 학생의 학습일지` : '학습일지',
          subtitle: headerSubtitle,
          meta: headerMeta,
        }}
        greeting={greeting}
        academicEvents={academicEvents}
        annualSchedules={annualSchedules}
        summary={entry.summary}
        weekly={entry.weekly}
        comments={comments}
        emptySummaryMessage="아직 요약 정보가 준비되지 않았습니다."
        emptyWeeklyMessage="주차별 콘텐츠가 아직 등록되지 않았습니다."
        emptyGreetingMessage="등록된 인사말이 없습니다."
        emptyEventsMessage="등록된 학사 일정이 없습니다."
      />
    </section>
  )
}
