import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { SpecialLectureForm } from '@/components/dashboard/special-lectures/SpecialLectureForm'
import {
  deleteSpecialLectureAction,
  updateSpecialLectureAction,
} from '@/app/dashboard/manager/special-lectures/actions'
import { Button } from '@/components/ui/button'
import { requireAuthForDashboard, resolveDashboardPath } from '@/lib/auth'
import { ensureManagerProfile } from '@/lib/authz'
import {
  fetchSpecialLectureAudience,
  fetchSpecialLectureAudienceOptions,
  getSpecialLecture,
} from '@/lib/special-lectures'
import { createClient as createServerSupabase } from '@/lib/supabase/server'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function EditSpecialLecturePage({ params }: PageProps) {
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

  const [{ classes, students }, audience] = await Promise.all([
    fetchSpecialLectureAudienceOptions(supabase),
    fetchSpecialLectureAudience(supabase, id),
  ])

  const updateAction = updateSpecialLectureAction.bind(null, id)

  async function handleDelete() {
    'use server'
    const result = await deleteSpecialLectureAction(id)
    if (result.error) {
      throw new Error(result.error)
    }
    redirect('/dashboard/manager/special-lectures')
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-3">
          <DashboardBackLink
            fallbackHref="/dashboard/manager/special-lectures"
            label="특강 목록으로 돌아가기"
          />
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold text-slate-900">특강 수정</h1>
            <p className="text-sm text-slate-600">영상, 시청 권한, 게시 상태를 변경할 수 있습니다.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href={`/dashboard/manager/special-lectures/${id}/views`}>시청 로그</Link>
          </Button>
          <form action={handleDelete}>
            <Button type="submit" variant="destructive">
              특강 삭제
            </Button>
          </form>
        </div>
      </div>

      <SpecialLectureForm
        lecture={lecture}
        defaultAudienceMode={lecture.audience_mode}
        defaultClassIds={audience.classIds}
        defaultStudentIds={audience.studentIds}
        classes={classes}
        students={students}
        action={updateAction}
        currentUserId={managerProfile.id}
        submitLabel="변경 사항 저장"
      />
    </section>
  )
}
