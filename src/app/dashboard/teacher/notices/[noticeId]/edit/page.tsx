import { notFound } from 'next/navigation'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { NoticeComposer } from '@/components/dashboard/teacher/notices/NoticeComposer'
import { fetchNoticeDetail, fetchNoticeRecipientDirectory, fetchClassesWithStudents } from '@/lib/notice-board'
import { requireAuthForDashboard } from '@/lib/auth'
import { createClient as createServerSupabase } from '@/lib/supabase/server'
import { updateNotice, deleteNotice } from '@/app/dashboard/teacher/notices/actions'

export default async function EditNoticePage({ params }: { params: Promise<{ noticeId: string }> }) {
  const { profile } = await requireAuthForDashboard(['teacher', 'manager'])

  if (!profile) {
    return null
  }

  const { noticeId } = await params
  const supabase = await createServerSupabase()
  const notice = await fetchNoticeDetail(supabase, noticeId, profile.id)

  if (!notice) {
    notFound()
  }

  const canManage = profile.role === 'principal' || notice.author.id === profile.id

  if (!canManage) {
    notFound()
  }

  const recipients = await fetchNoticeRecipientDirectory(supabase, {
    excludeIds: [notice.author.id],
  })
  const classes = await fetchClassesWithStudents(supabase)

  return (
    <section className="space-y-6">
      <div className="space-y-3">
        <DashboardBackLink
          fallbackHref={`/dashboard/teacher/notices/${notice.id}`}
          label="공지 상세로 돌아가기"
        />
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-slate-900">공지 수정</h1>
          <p className="text-sm text-slate-600">
            본문과 공유 대상을 수정하거나 첨부 이미지를 삭제·추가할 수 있습니다. 삭제 시에는 공지가 완전히 제거됩니다.
          </p>
        </div>
      </div>

      <NoticeComposer
        recipients={recipients}
        classes={classes}
        onSubmit={updateNotice}
        onDelete={deleteNotice}
        submitLabel="공지 수정"
        currentUserId={profile.id}
        defaults={{
          noticeId: notice.id,
          title: notice.title,
          body: notice.bodyHtml,
          recipientIds: notice.recipients.map((recipient) => recipient.id),
          attachments: notice.attachments.map((attachment) => ({
            id: attachment.id,
            name: attachment.originalName ?? '첨부 이미지',
          })),
          isApplicationRequired: notice.isApplicationRequired,
          applicationConfig: notice.applicationConfig,
        }}
      />
    </section>
  )
}
