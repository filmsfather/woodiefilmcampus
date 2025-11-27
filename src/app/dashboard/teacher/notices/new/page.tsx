import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { NoticeComposer } from '@/components/dashboard/teacher/notices/NoticeComposer'
import { createNotice } from '@/app/dashboard/teacher/notices/actions'
import { fetchNoticeRecipientDirectory, fetchClassesWithStudents } from '@/lib/notice-board'
import { requireAuthForDashboard } from '@/lib/auth'
import { createClient as createServerSupabase } from '@/lib/supabase/server'

export default async function CreateNoticePage() {
  const { profile } = await requireAuthForDashboard(['teacher', 'manager'])

  if (!profile) {
    return null
  }

  const supabase = createServerSupabase()
  const recipients = await fetchNoticeRecipientDirectory(supabase, { excludeIds: [profile.id] })
  const classes = await fetchClassesWithStudents(supabase)

  return (
    <section className="space-y-6">
      <div className="space-y-3">
        <DashboardBackLink fallbackHref="/dashboard/teacher/notices" label="공지 게시판으로 돌아가기" />
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-slate-900">새 공지 작성</h1>
          <p className="text-sm text-slate-600">
            전달할 내용을 작성하고 공유 대상을 선택하세요. 공유 대상에게는 확인 버튼이 제공됩니다.
          </p>
        </div>
      </div>

      <NoticeComposer
        recipients={recipients}
        classes={classes}
        onSubmit={createNotice}
        currentUserId={profile.id}
      />
    </section>
  )
}
