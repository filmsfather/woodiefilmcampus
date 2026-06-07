import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { SpecialLectureForm } from '@/components/dashboard/special-lectures/SpecialLectureForm'
import { SpecialLectureGrantList } from '@/components/dashboard/special-lectures/SpecialLectureGrantList'
import { SpecialLectureShareDialog } from '@/components/dashboard/special-lectures/SpecialLectureShareDialog'
import {
  deleteSpecialLectureAction,
  updateSpecialLectureAction,
} from '@/app/dashboard/manager/special-lectures/actions'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { requireAuthForDashboard, resolveDashboardPath } from '@/lib/auth'
import { ensureManagerProfile } from '@/lib/authz'
import {
  fetchSpecialLectureAudienceOptions,
  fetchSpecialLectureGrants,
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

  const [{ classes, students }, grants] = await Promise.all([
    fetchSpecialLectureAudienceOptions(supabase),
    fetchSpecialLectureGrants(supabase, id),
  ])

  const classNameById: Record<string, string> = {}
  for (const klass of classes) {
    classNameById[klass.id] = klass.name
  }
  const studentNameById: Record<string, string> = {}
  for (const student of students) {
    studentNameById[student.id] = student.name ?? student.email ?? '이름 없음'
  }

  const updateAction = updateSpecialLectureAction.bind(null, id)
  const hasVideo = Boolean(lecture.video_asset)

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
            <p className="text-sm text-slate-600">
              영상과 제목·설명을 수정할 수 있습니다. 시청 대상은 영상 공개 버튼으로 누적 관리합니다.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <SpecialLectureShareDialog
            lectureId={lecture.id}
            lectureTitle={lecture.title}
            classes={classes}
            students={students}
            triggerDisabled={!hasVideo}
          />
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
        action={updateAction}
        currentUserId={managerProfile.id}
        submitLabel="변경 사항 저장"
      />

      <Card className="border-slate-200">
        <CardHeader className="space-y-1">
          <CardTitle className="text-base text-slate-900">공개 내역</CardTitle>
          <p className="text-xs text-slate-500">
            영상 공개 버튼으로 만든 공개 기록입니다. 활성 항목은 만료 시각을 조정하거나 즉시 종료할
            수 있습니다.
          </p>
        </CardHeader>
        <CardContent>
          <SpecialLectureGrantList
            grants={grants}
            classNameById={classNameById}
            studentNameById={studentNameById}
          />
        </CardContent>
      </Card>
    </section>
  )
}
