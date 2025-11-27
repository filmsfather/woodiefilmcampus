import Link from 'next/link'
import { Bell, ClipboardList } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { getAuthContext } from '@/lib/auth'
import { fetchUnreadNotices } from '@/lib/notice-board'
import { createClient as createServerSupabase } from '@/lib/supabase/server'

export async function UnreadNoticeBanner() {
    const { profile } = await getAuthContext()

    if (!profile) {
        return null
    }

    const supabase = createServerSupabase()
    const notices = await fetchUnreadNotices(supabase, profile.id)

    if (notices.length === 0) {
        return null
    }

    const basePath = profile.role === 'student' ? '/dashboard/student/notices' : '/dashboard/teacher/notices'

    return (
        <Card className="mb-6 border-l-4 border-l-primary bg-primary/5">
            <CardContent className="flex items-start gap-4 p-4">
                <div className="rounded-full bg-white p-2 text-primary shadow-sm">
                    <Bell className="h-5 w-5" />
                </div>
                <div className="flex-1 space-y-1">
                    <p className="font-medium text-slate-900">
                        확인하지 않은 공지사항이 {notices.length}건 있습니다.
                    </p>
                    <div className="flex flex-col gap-1">
                        {notices.map((notice) => (
                            <Link
                                key={notice.id}
                                href={`${basePath}/${notice.id}`}
                                className="group flex items-center gap-2 text-sm text-slate-600 hover:text-primary"
                            >
                                <span className="truncate font-medium group-hover:underline">{notice.title}</span>
                                <span className="text-xs text-slate-400">
                                    {new Date(notice.createdAt).toLocaleDateString()}
                                </span>
                                {notice.isApplicationRequired && (
                                    <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                                        <ClipboardList className="mr-1 h-3 w-3" /> 신청
                                    </Badge>
                                )}
                            </Link>
                        ))}
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}
