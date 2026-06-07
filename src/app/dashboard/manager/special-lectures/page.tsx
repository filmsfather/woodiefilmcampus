import Link from 'next/link'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { SpecialLectureShareDialog } from '@/components/dashboard/special-lectures/SpecialLectureShareDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { requireAuthForDashboard } from '@/lib/auth'
import { ensureManagerProfile } from '@/lib/authz'
import { resolveDashboardPath } from '@/lib/auth'
import { redirect } from 'next/navigation'
import {
  fetchSpecialLectureActiveGrantSummary,
  fetchSpecialLectureAudienceOptions,
  fetchSpecialLectures,
} from '@/lib/special-lectures'
import { createClient as createServerSupabase } from '@/lib/supabase/server'

function formatKoreanDate(iso: string) {
  if (!iso) return ''
  return new Intl.DateTimeFormat('ko', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))
}

export default async function ManagerSpecialLecturesPage() {
  const { profile } = await requireAuthForDashboard(['manager', 'principal'])
  const managerProfile = await ensureManagerProfile()
  if (!managerProfile) {
    redirect(resolveDashboardPath(profile?.role ?? 'manager'))
  }

  const supabase = await createServerSupabase()
  const [lectures, { classes, students }] = await Promise.all([
    fetchSpecialLectures(supabase),
    fetchSpecialLectureAudienceOptions(supabase),
  ])
  const grantSummary = await fetchSpecialLectureActiveGrantSummary(
    supabase,
    lectures.map((lecture) => lecture.id)
  )

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-3">
          <DashboardBackLink fallbackHref="/dashboard/manager" label="실장 허브로 돌아가기" />
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold text-slate-900">특강 관리</h1>
            <p className="text-sm text-slate-600">
              영상을 업로드한 뒤 각 특강의 <span className="font-medium">영상 공개</span>{' '}
              버튼으로 시청 가능한 학생과 공개 기간을 지정합니다. 공개 기록이 만료되면 자동으로
              비공개로 전환됩니다.
            </p>
          </div>
        </div>
        <Button asChild>
          <Link href="/dashboard/manager/special-lectures/new">새 특강 등록</Link>
        </Button>
      </div>

      {lectures.length === 0 ? (
        <Card className="border-slate-200 bg-slate-50">
          <CardHeader>
            <CardTitle className="text-lg text-slate-800">등록된 특강이 없습니다.</CardTitle>
            <CardDescription className="text-sm text-slate-600">
              새 특강을 등록하면 이곳에서 공개 상태와 시청 통계를 한 번에 확인할 수 있습니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link href="/dashboard/manager/special-lectures/new">첫 특강 등록하기</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {lectures.map((lecture) => {
            const summary = grantSummary.get(lecture.id) ?? {
              activeGrantCount: 0,
              latestExpiresAt: null,
            }
            const hasVideo = Boolean(lecture.video_asset)

            return (
              <Card key={lecture.id} className="flex flex-col border-slate-200 shadow-sm">
                <CardHeader className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="line-clamp-2 text-lg text-slate-900">
                      <Link
                        href={`/dashboard/manager/special-lectures/${lecture.id}/edit`}
                        className="hover:underline"
                      >
                        {lecture.title}
                      </Link>
                    </CardTitle>
                    <Badge variant={summary.activeGrantCount > 0 ? 'default' : 'secondary'}>
                      {summary.activeGrantCount > 0
                        ? `공개 중 ${summary.activeGrantCount}건`
                        : '공개 없음'}
                    </Badge>
                  </div>
                  <CardDescription className="text-xs text-slate-500">
                    등록일 {formatKoreanDate(lecture.created_at)}
                    {lecture.updated_at && lecture.updated_at !== lecture.created_at
                      ? ` · 수정일 ${formatKoreanDate(lecture.updated_at)}`
                      : ''}
                  </CardDescription>
                </CardHeader>
                <CardContent className="mt-auto space-y-3">
                  {lecture.description ? (
                    <p className="line-clamp-2 text-sm text-slate-600">{lecture.description}</p>
                  ) : null}
                  <div className="flex flex-wrap gap-2 text-xs">
                    {summary.latestExpiresAt ? (
                      <Badge variant="outline" className="border-slate-300 text-slate-600">
                        가장 늦은 만료 {formatKoreanDate(summary.latestExpiresAt)}
                      </Badge>
                    ) : null}
                    {hasVideo ? (
                      <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700">
                        영상 업로드됨
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-rose-300 bg-rose-50 text-rose-700">
                        영상 없음
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 pt-2">
                    <SpecialLectureShareDialog
                      lectureId={lecture.id}
                      lectureTitle={lecture.title}
                      classes={classes}
                      students={students}
                      triggerDisabled={!hasVideo}
                    />
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/dashboard/manager/special-lectures/${lecture.id}/edit`}>
                        수정
                      </Link>
                    </Button>
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/dashboard/manager/special-lectures/${lecture.id}/views`}>
                        시청 로그
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </section>
  )
}
