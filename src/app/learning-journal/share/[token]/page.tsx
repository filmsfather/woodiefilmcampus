import { notFound } from 'next/navigation'

import { LearningJournalEntryContent } from '@/components/dashboard/learning-journal/LearningJournalEntryContent'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import DateUtil from '@/lib/date-util'
import { fetchLearningJournalEntryByShareToken } from '@/lib/learning-journals'

export const dynamic = 'force-dynamic'

const STATUS_LABEL: Record<'submitted' | 'draft' | 'published' | 'archived', string> = {
  submitted: '승인 대기',
  draft: '작성 중',
  published: '공개 완료',
  archived: '보관',
}

interface SharedLearningJournalPageProps {
  params: {
    token: string
  }
}

export default async function SharedLearningJournalPage({ params }: SharedLearningJournalPageProps) {
  const snapshot = await fetchLearningJournalEntryByShareToken(params.token)

  if (!snapshot) {
    notFound()
  }

  const { entry, period, student, greeting, academicEvents, comments } = snapshot

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

  const headerSubtitle = `${period.className ?? '반 미지정'} · ${
    period.label ?? `${period.startDate} ~ ${period.endDate}`
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
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold text-slate-900">학부모 학습일지</h1>
        <p className="text-sm text-slate-600">
          담임 선생님이 공유한 학습일지입니다. 링크를 안전하게 보관해 주세요.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">가정 안내</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-slate-600">
          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="font-medium text-slate-500">학생</dt>
              <dd className="text-slate-900">{student.name ?? student.email ?? '학생 정보 없음'}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">반 / 기간</dt>
              <dd className="text-slate-900">{headerSubtitle}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">공개일</dt>
              <dd className="text-slate-900">{publishedLabel}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-500">최근 업데이트</dt>
              <dd className="text-slate-900">{updatedLabel}</dd>
            </div>
          </dl>
          <p>
            학습일지는 가정과 학교가 함께 학생의 성장을 돕기 위한 자료입니다. 자녀와 함께 학습 내용을 확인하고,
            궁금한 점은 담임 선생님께 문의해 주세요.
          </p>
        </CardContent>
      </Card>

      <LearningJournalEntryContent
        header={{
          title: student.name ? `${student.name} 학생의 학습일지` : '학습일지',
          subtitle: headerSubtitle,
          meta: headerMeta,
        }}
        greeting={greeting}
        academicEvents={academicEvents}
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
