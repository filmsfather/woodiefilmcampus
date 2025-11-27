import { notFound } from 'next/navigation'

import { NoticeDetailView } from '@/components/dashboard/notice/NoticeDetailView'
import { fetchNoticeDetail } from '@/lib/notice-board'
import { requireAuthForDashboard } from '@/lib/auth'
import { createClient as createServerSupabase } from '@/lib/supabase/server'

export default async function StudentNoticeDetailPage({ params }: { params: { noticeId: string } }) {
    const { profile } = await requireAuthForDashboard('student')

    if (!profile) {
        return null
    }

    const supabase = createServerSupabase()
    const notice = await fetchNoticeDetail(supabase, params.noticeId, profile.id)

    if (!notice) {
        notFound()
    }

    return (
        <NoticeDetailView
            notice={notice}
            viewerId={profile.id}
            viewerRole={profile.role}
            backLink="/dashboard/student"
            backLabel="대시보드로 돌아가기"
        />
    )
}
