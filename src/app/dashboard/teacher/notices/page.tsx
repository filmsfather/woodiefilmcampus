import Link from 'next/link'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { fetchNoticeSummaries } from '@/lib/notice-board'
import { requireAuthForDashboard } from '@/lib/auth'
import { createClient as createServerSupabase } from '@/lib/supabase/server'

function formatKoreanDate(dateIso: string) {
  if (!dateIso) {
    return ''
  }
  const date = new Date(dateIso)
  return new Intl.DateTimeFormat('ko', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

export default async function TeacherNoticeBoardPage() {
  const { profile } = await requireAuthForDashboard(['teacher', 'manager'])

  if (!profile) {
    return null
  }

  const supabase = createServerSupabase()
  const notices = await fetchNoticeSummaries(supabase, profile.id)
  const canCreate = ['teacher', 'manager', 'principal'].includes(profile.role)

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-3">
          <DashboardBackLink fallbackHref="/dashboard/teacher" label="교사용 허브로 돌아가기" />
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold text-slate-900">교직 공지 게시판</h1>
            <p className="text-sm text-slate-600">
              원장·실장·선생님 간의 공지와 소통을 모아 확인하세요. 공유 대상에게는 확인 버튼이 제공됩니다.
            </p>
          </div>
        </div>
        {canCreate ? (
          <Button asChild>
            <Link href="/dashboard/teacher/notices/new">새 공지 작성</Link>
          </Button>
        ) : null}
      </div>

      {notices.length === 0 ? (
        <Card className="border-slate-200 bg-slate-50">
          <CardHeader>
            <CardTitle className="text-lg text-slate-800">등록된 공지가 없습니다.</CardTitle>
            <CardDescription className="text-sm text-slate-600">
              공지를 작성하면 지정한 실장님과 선생님에게 알림이 전달되고, 확인 여부를 추적할 수 있습니다.
            </CardDescription>
          </CardHeader>
          {canCreate ? (
            <CardContent>
              <Button asChild variant="outline">
                <Link href="/dashboard/teacher/notices/new">첫 공지 올리기</Link>
              </Button>
            </CardContent>
          ) : null}
        </Card>
      ) : (
        <div className="space-y-4">
          {notices.map((notice) => {
            const createdLabel = formatKoreanDate(notice.createdAt)
            const ackSummary = `${notice.acknowledgedCount}/${notice.totalRecipients}`
            const viewerBadgeLabel = notice.viewerIsAuthor
              ? '작성한 공지'
              : notice.viewerAcknowledgedAt
                ? '확인 완료'
                : '확인 대기'
            const viewerBadgeVariant = notice.viewerIsAuthor
              ? 'secondary'
              : notice.viewerAcknowledgedAt
                ? 'default'
                : 'outline'

            return (
              <Card
                key={notice.id}
                className="border-slate-200 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <CardHeader className="space-y-2">
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <CardTitle className="text-lg text-slate-900">
                      <Link href={`/dashboard/teacher/notices/${notice.id}`} className="hover:underline">
                        {notice.title}
                      </Link>
                    </CardTitle>
                    <Badge variant={viewerBadgeVariant}>{viewerBadgeLabel}</Badge>
                  </div>
                  <CardDescription className="flex flex-col gap-1 text-sm text-slate-600 md:flex-row md:items-center md:gap-3">
                    <span>
                      작성자: {notice.author.name} ({notice.author.role === 'principal' ? '원장' : notice.author.role === 'manager' ? '실장' : '선생님'})
                    </span>
                    <span className="hidden text-slate-300 md:inline">·</span>
                    <span>등록일: {createdLabel}</span>
                    <span className="hidden text-slate-300 md:inline">·</span>
                    <span>확인 현황: {ackSummary}</span>
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <p className="text-sm text-slate-600">
                    공유 대상 {notice.totalRecipients}명 중 {notice.acknowledgedCount}명이 확인했습니다.
                  </p>
                  <Button asChild variant="outline">
                    <Link href={`/dashboard/teacher/notices/${notice.id}`}>상세 보기</Link>
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </section>
  )
}
