import { redirect } from 'next/navigation'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { SpecialLectureForm } from '@/components/dashboard/special-lectures/SpecialLectureForm'
import { createSpecialLectureAction } from '@/app/dashboard/manager/special-lectures/actions'
import { requireAuthForDashboard, resolveDashboardPath } from '@/lib/auth'
import { ensureManagerProfile } from '@/lib/authz'
import { fetchSpecialLectureAudienceOptions } from '@/lib/special-lectures'
import { createClient as createServerSupabase } from '@/lib/supabase/server'

export default async function NewSpecialLecturePage() {
  const { profile } = await requireAuthForDashboard(['manager', 'principal'])
  const managerProfile = await ensureManagerProfile()
  if (!managerProfile) {
    redirect(resolveDashboardPath(profile?.role ?? 'manager'))
  }

  const supabase = await createServerSupabase()
  const { classes, students } = await fetchSpecialLectureAudienceOptions(supabase)

  return (
    <section className="space-y-6">
      <div className="space-y-3">
        <DashboardBackLink
          fallbackHref="/dashboard/manager/special-lectures"
          label="특강 목록으로 돌아가기"
        />
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-slate-900">새 특강 등록</h1>
          <p className="text-sm text-slate-600">
            영상 파일을 업로드하고 시청 가능한 학생을 지정하세요.
          </p>
        </div>
      </div>

      <SpecialLectureForm
        action={createSpecialLectureAction}
        currentUserId={managerProfile.id}
        classes={classes}
        students={students}
      />
    </section>
  )
}
