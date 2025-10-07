import Link from 'next/link'

import { requireAuthForDashboard } from '@/lib/auth'
import DateUtil from '@/lib/date-util'
import {
  deriveMonthTokensForRange,
  fetchLatestPublishedLearningJournalEntry,
  fetchLearningJournalAcademicEvents,
  fetchLearningJournalGreeting,
} from '@/lib/learning-journals'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

function formatPeriod(periodLabel: { startDate: string; endDate: string }) {
  return `${periodLabel.startDate} ~ ${periodLabel.endDate}`
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
  const primaryMonth = monthTokens[0]
  const greeting = primaryMonth ? await fetchLearningJournalGreeting(primaryMonth) : null
  const academicEvents = monthTokens.length > 0 ? await fetchLearningJournalAcademicEvents(monthTokens) : []

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-slate-900">{period.className} 학습일지</h1>
        <p className="text-sm text-slate-600">기간: {formatPeriod({ startDate: period.startDate, endDate: period.endDate })}</p>
        <p className="text-xs text-slate-500">
          공개일: {entry.publishedAt ? DateUtil.formatForDisplay(entry.publishedAt, { locale: 'ko-KR', timeZone: 'Asia/Seoul', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '미기록'}
        </p>
      </div>

      {greeting ? (
        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="text-lg text-slate-900">원장 인사말</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm text-slate-600">{greeting.message}</p>
          </CardContent>
        </Card>
      ) : null}

      {academicEvents.length > 0 ? (
        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="text-lg text-slate-900">주요 학사 일정</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3 text-sm text-slate-600">
              {academicEvents.map((event) => (
                <li key={event.id} className="rounded-md bg-slate-50 px-3 py-2">
                  <p className="font-medium text-slate-900">
                    {event.startDate}
                    {event.endDate ? ` ~ ${event.endDate}` : ''} · {event.title}
                  </p>
                  {event.memo ? <p className="text-xs text-slate-500">{event.memo}</p> : null}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-lg text-slate-900">월간 학습 요약</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-slate-600">
          {entry.summary ? (
            <pre className="max-h-64 overflow-auto rounded-md bg-slate-50 p-3 text-xs text-slate-600">
              {JSON.stringify(entry.summary, null, 2)}
            </pre>
          ) : (
            <p>아직 요약 정보가 준비되지 않았습니다. 담당 선생님이 곧 내용을 채워줄 예정입니다.</p>
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-lg text-slate-900">주차별 학습 현황</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-slate-600">
          {entry.weekly ? (
            <pre className="max-h-72 overflow-auto rounded-md bg-slate-50 p-3 text-xs text-slate-600">
              {JSON.stringify(entry.weekly, null, 2)}
            </pre>
          ) : (
            <p>주차별 콘텐츠가 아직 등록되지 않았습니다. 곧 내용이 추가될 예정입니다.</p>
          )}
        </CardContent>
      </Card>

      <Button asChild variant="outline">
        <Link href="/dashboard/student">학생 대시보드로 돌아가기</Link>
      </Button>
    </section>
  )
}
