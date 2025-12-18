import Link from 'next/link'
import { Bell, ClipboardList } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { requireAuthForDashboard } from '@/lib/auth'
import { fetchNoticeSummaries } from '@/lib/notice-board'
import { createClient as createServerSupabase } from '@/lib/supabase/server'

export default async function StudentNoticeListPage() {
    const { profile } = await requireAuthForDashboard('student')

    if (!profile) {
        return null
    }

    const supabase = await createServerSupabase()
    const notices = await fetchNoticeSummaries(supabase, profile.id)

    return (
        <section className="space-y-6">
            <div className="space-y-3">
                <DashboardBackLink fallbackHref="/dashboard/student" label="대시보드로 돌아가기" />
                <div className="space-y-1">
                    <h1 className="text-2xl font-semibold text-slate-900">공지사항</h1>
                    <p className="text-sm text-slate-600">
                        확인해야 할 공지사항과 지난 소식을 모두 모아볼 수 있습니다.
                    </p>
                </div>
            </div>

            <Card className="border-slate-200">
                <CardHeader>
                    <CardTitle className="text-xl text-slate-900">전체 공지 목록</CardTitle>
                    <CardDescription className="text-sm text-slate-600">
                        총 {notices.length}건의 공지사항이 있습니다.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {notices.length === 0 ? (
                        <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 rounded-md border border-dashed border-slate-200 py-12 text-center">
                            <div className="rounded-full bg-slate-100 p-3 text-slate-400">
                                <Bell className="h-6 w-6" />
                            </div>
                            <div className="space-y-1">
                                <p className="font-medium text-slate-900">등록된 공지사항이 없습니다.</p>
                                <p className="text-xs text-slate-500">새로운 소식이 도착하면 알려드릴게요.</p>
                            </div>
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-100">
                            {notices.map((notice) => {
                                const isUnread = !notice.viewerAcknowledgedAt
                                return (
                                    <div
                                        key={notice.id}
                                        className="group flex flex-col gap-2 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                                    >
                                        <div className="flex flex-1 flex-col gap-1">
                                            <div className="flex items-center gap-2">
                                                {isUnread && (
                                                    <span className="flex h-2 w-2 shrink-0 rounded-full bg-red-500" />
                                                )}
                                                <Link
                                                    href={`/dashboard/student/notices/${notice.id}`}
                                                    className="font-medium text-slate-900 hover:text-primary hover:underline"
                                                >
                                                    {notice.title}
                                                </Link>
                                                {notice.isApplicationRequired && (
                                                    <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                                                        <ClipboardList className="mr-1 h-3 w-3" /> 신청
                                                    </Badge>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2 text-xs text-slate-500">
                                                <span>{notice.author.name}</span>
                                                <span>·</span>
                                                <span>{new Date(notice.createdAt).toLocaleDateString()}</span>
                                                {notice.viewerAcknowledgedAt && (
                                                    <>
                                                        <span>·</span>
                                                        <span className="text-blue-600">
                                                            {new Date(notice.viewerAcknowledgedAt).toLocaleDateString()} 확인
                                                        </span>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                        <Button asChild variant="ghost" size="sm" className="shrink-0">
                                            <Link href={`/dashboard/student/notices/${notice.id}`}>
                                                자세히 보기
                                            </Link>
                                        </Button>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>
        </section>
    )
}
