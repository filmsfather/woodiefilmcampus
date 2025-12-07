import Link from 'next/link'
import { Bell, ClipboardList } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getAuthContext } from '@/lib/auth'
import { fetchUnreadNotices } from '@/lib/notice-board'
import { createClient as createServerSupabase } from '@/lib/supabase/server'

export async function NoticeSummaryCard() {
    const { profile } = await getAuthContext()

    if (!profile) {
        return null
    }

    const supabase = createServerSupabase()
    const notices = await fetchUnreadNotices(supabase, profile.id)
    const unreadCount = notices.length
    const recentNotices = notices.slice(0, 3)

    return (
        <Link href="/dashboard/teacher/notices" className="block transition hover:-translate-y-1">
            <Card className="h-full border-slate-200 shadow-sm hover:shadow-md bg-slate-50/50">
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Bell className="h-5 w-5 text-slate-500" />
                            <CardTitle className="text-lg text-slate-900">공지사항</CardTitle>
                        </div>
                        {unreadCount > 0 && (
                            <Badge variant="destructive" className="h-5 px-1.5 text-xs">
                                {unreadCount}
                            </Badge>
                        )}
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="space-y-2">
                        {recentNotices.length > 0 ? (
                            recentNotices.map((notice) => (
                                <div key={notice.id} className="flex items-center justify-between gap-2 text-sm">
                                    <div className="flex items-center gap-2 overflow-hidden">
                                        <span className="truncate font-medium text-slate-700">
                                            {notice.title}
                                        </span>
                                        {notice.isApplicationRequired && (
                                            <Badge variant="secondary" className="h-4 px-1 text-[10px] shrink-0">
                                                신청
                                            </Badge>
                                        )}
                                    </div>
                                    <span className="text-xs text-slate-400 shrink-0">
                                        {new Date(notice.createdAt).toLocaleDateString()}
                                    </span>
                                </div>
                            ))
                        ) : (
                            <p className="text-sm text-slate-400">읽지 않은 공지사항이 없습니다.</p>
                        )}
                        {unreadCount > 3 && (
                            <p className="text-xs text-slate-500 text-center pt-1">
                                외 {unreadCount - 3}건 더보기
                            </p>
                        )}
                    </div>
                </CardContent>
            </Card>
        </Link>
    )
}
