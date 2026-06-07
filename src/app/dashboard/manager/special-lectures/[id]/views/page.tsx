import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { requireAuthForDashboard, resolveDashboardPath } from '@/lib/auth'
import { ensureManagerProfile } from '@/lib/authz'
import {
  fetchSpecialLectureViewLog,
  getSpecialLecture,
} from '@/lib/special-lectures'
import { createClient as createServerSupabase } from '@/lib/supabase/server'

interface PageProps {
  params: Promise<{ id: string }>
}

const dateFormatter = new Intl.DateTimeFormat('ko', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

const ROLE_LABELS: Record<string, string> = {
  principal: '원장',
  manager: '실장',
  teacher: '교사',
  student: '학생',
}

export default async function SpecialLectureViewsPage({ params }: PageProps) {
  const { profile } = await requireAuthForDashboard(['manager', 'principal'])
  const managerProfile = await ensureManagerProfile()
  if (!managerProfile) {
    redirect(resolveDashboardPath(profile?.role ?? 'manager'))
  }

  const { id } = await params
  const supabase = await createServerSupabase()

  const lecture = await getSpecialLecture(supabase, id).catch(() => null)
  if (!lecture) {
    notFound()
  }

  const views = await fetchSpecialLectureViewLog(supabase, id, 200)

  const uniqueViewerCount = new Set(views.map((entry) => entry.viewerId)).size

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-3">
          <DashboardBackLink
            fallbackHref={`/dashboard/manager/special-lectures/${id}/edit`}
            label="특강 수정으로 돌아가기"
          />
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold text-slate-900">시청 로그</h1>
            <p className="text-sm text-slate-600">{lecture.title}</p>
          </div>
        </div>
        <Button asChild variant="outline">
          <Link href={`/dashboard/manager/special-lectures/${id}/edit`}>특강 수정으로 이동</Link>
        </Button>
      </div>

      <Card className="border-slate-200">
        <CardHeader className="space-y-1">
          <CardTitle className="text-base text-slate-900">기록 요약</CardTitle>
          <CardDescription className="text-xs text-slate-500">
            최근 200건까지 표시됩니다. 같은 학생이 여러 번 재생하면 각 재생이 별도 행으로 기록됩니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2 text-sm text-slate-600">
            <Badge variant="outline" className="border-slate-300 text-slate-600">
              누적 기록 {views.length}건
            </Badge>
            <Badge variant="outline" className="border-slate-300 text-slate-600">
              고유 시청자 {uniqueViewerCount}명
            </Badge>
          </div>
        </CardContent>
      </Card>

      {views.length === 0 ? (
        <Card className="border-slate-200 bg-slate-50">
          <CardHeader>
            <CardTitle className="text-base text-slate-800">아직 시청 기록이 없습니다.</CardTitle>
            <CardDescription className="text-sm text-slate-600">
              학생이 영상을 재생하면 이곳에 자동으로 기록됩니다.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card className="border-slate-200">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>시청자</TableHead>
                  <TableHead>역할</TableHead>
                  <TableHead>시청 시각</TableHead>
                  <TableHead>IP</TableHead>
                  <TableHead className="hidden md:table-cell">User Agent</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {views.map((entry) => {
                  const displayName = entry.viewerName ?? entry.viewerEmail ?? '알 수 없음'
                  const roleLabel = entry.viewerRole
                    ? ROLE_LABELS[entry.viewerRole] ?? entry.viewerRole
                    : '-'
                  return (
                    <TableRow key={entry.id}>
                      <TableCell className="font-medium text-slate-900">
                        <div className="flex flex-col">
                          <span>{displayName}</span>
                          {entry.viewerEmail ? (
                            <span className="text-xs text-slate-500">{entry.viewerEmail}</span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>{roleLabel}</TableCell>
                      <TableCell className="text-sm text-slate-700">
                        {dateFormatter.format(new Date(entry.viewedAt))}
                      </TableCell>
                      <TableCell className="text-sm text-slate-600">{entry.ip ?? '-'}</TableCell>
                      <TableCell className="hidden max-w-[280px] truncate text-xs text-slate-500 md:table-cell">
                        {entry.userAgent ?? '-'}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </section>
  )
}
