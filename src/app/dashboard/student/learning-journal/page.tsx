import Link from 'next/link'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { LearningJournalEntryContent } from '@/components/dashboard/learning-journal/LearningJournalEntryContent'
import { requireAuthForDashboard } from '@/lib/auth'
import DateUtil from '@/lib/date-util'
import {
  deriveMonthTokensForRange,
  fetchLatestPublishedLearningJournalEntry,
  fetchLearningJournalAcademicEvents,
  fetchLearningJournalComments,
  fetchLearningJournalGreeting,
} from '@/lib/learning-journals'
import { Button } from '@/components/ui/button'

const STATUS_LABEL: Record<'draft' | 'published' | 'archived', string> = {
  draft: '작성 중',
  published: '공개 완료',
  archived: '보관',
}

export default async function StudentLearningJournalPage() {
  const { profile } = await requireAuthForDashboard('student')

  if (!profile) {
    return null
  }

  const snapshot = await fetchLatestPublishedLearningJournalEntry(profile.id)

  if (!snapshot) {
    return (
      <section className="space-y-6">
        <DashboardBackLink fallbackHref="/dashboard/student" label="학생 대시보드로 돌아가기" />
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-slate-900">학습일지</h1>
          <p className="text-sm text-slate-600">아직 공개된 학습일지가 없습니다. 담임 선생님이 학습일지를 제출하면 이곳에서 확인할 수 있습니다.</p>
        </div>
        <Button asChild variant="outline">
          <Link href="/dashboard/student">학생 대시보드로 돌아가기</Link>
        </Button>
      </section>
    )
  }

  const { entry, period } = snapshot
  const monthTokens = deriveMonthTokensForRange(period.startDate, period.endDate)

  const greetingPromise: Promise<Awaited<ReturnType<typeof fetchLearningJournalGreeting>>> =
    monthTokens.length > 0 ? fetchLearningJournalGreeting(monthTokens[0]) : Promise.resolve(null)
  const eventsPromise: Promise<Awaited<ReturnType<typeof fetchLearningJournalAcademicEvents>>> =
    monthTokens.length > 0
      ? fetchLearningJournalAcademicEvents(monthTokens)
      : Promise.resolve([] as Awaited<ReturnType<typeof fetchLearningJournalAcademicEvents>>)
  const [greeting, academicEvents, comments] = await Promise.all([
    greetingPromise,
    eventsPromise,
    fetchLearningJournalComments(entry.id),
  ])

  return (
    <section className="space-y-6">
      <DashboardBackLink fallbackHref="/dashboard/student" label="학생 대시보드로 돌아가기" />
      <LearningJournalEntryContent
        header={{
          title: profile.name ?? profile.email ?? '학생 정보 없음',
          subtitle: `${period.className ?? '반 미지정'} · ${
            period.label ?? `${period.startDate} ~ ${period.endDate}`
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
        actionPanel={
          <Button asChild variant="outline">
            <Link href="/dashboard/student">학생 대시보드로 돌아가기</Link>
          </Button>
        }
      />
    </section>
  )
}
