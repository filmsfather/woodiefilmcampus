import { notFound } from 'next/navigation'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { SpecialLecturePlayer } from '@/components/dashboard/special-lectures/SpecialLecturePlayer'
import { StudentSpecialLectureRequestButton } from '@/components/dashboard/special-lectures/StudentSpecialLectureRequestButton'
import { requireAuthForDashboard } from '@/lib/auth'
import {
  fetchMySpecialLectureRequests,
  getSignedSpecialLectureVideoUrl,
  getSpecialLecture,
} from '@/lib/special-lectures'
import { createClient as createServerSupabase } from '@/lib/supabase/server'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function StudentSpecialLectureDetailPage({ params }: PageProps) {
  const { profile } = await requireAuthForDashboard('student')

  const { id } = await params
  const supabase = await createServerSupabase()

  const lecture = await getSpecialLecture(supabase, id).catch(() => null)
  // 신청 접수 중이거나 내 신청 이력이 있는 특강은 제목·설명까지만 조회됩니다.
  // 시청 권한이 없으면 RLS가 video_asset을 내려주지 않습니다.
  if (!lecture) {
    notFound()
  }

  const videoPath = lecture.video_asset?.path ?? null
  const videoUrl = videoPath ? await getSignedSpecialLectureVideoUrl(supabase, videoPath) : null

  const myRequest = videoUrl
    ? undefined
    : (await fetchMySpecialLectureRequests(supabase, profile?.id ?? '')).get(lecture.id)

  return (
    <section className="space-y-6">
      <div className="space-y-3">
        <DashboardBackLink
          fallbackHref="/dashboard/student/special-lectures"
          label="특강 목록으로 돌아가기"
        />
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-slate-900">{lecture.title}</h1>
          <p className="text-sm text-slate-600">
            {new Intl.DateTimeFormat('ko', { dateStyle: 'long' }).format(new Date(lecture.created_at))}
          </p>
        </div>
      </div>

      {videoUrl ? (
        <SpecialLecturePlayer
          lectureId={lecture.id}
          videoUrl={videoUrl}
          posterAlt={lecture.title}
        />
      ) : (
        <div className="overflow-hidden rounded-xl bg-black shadow-lg">
          <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 px-6 text-center text-white">
            {myRequest?.status === 'requested' ? (
              <>
                <p>승인 대기 중입니다.</p>
                <p className="text-sm text-white/70">
                  특강비 확인 후 실장님이 영상을 열어주면 바로 시청할 수 있습니다.
                </p>
              </>
            ) : myRequest?.status === 'rejected' ? (
              <>
                <p>신청이 반려되었습니다.</p>
                {myRequest.rejectReason ? (
                  <p className="text-sm text-white/70">{myRequest.rejectReason}</p>
                ) : null}
              </>
            ) : myRequest?.status === 'approved' ? (
              <>
                <p>공개 기간이 종료되었습니다.</p>
                <p className="text-sm text-white/70">다시 시청하려면 실장님께 문의해주세요.</p>
              </>
            ) : lecture.applications_open ? (
              <>
                <p>신청 후 시청할 수 있습니다.</p>
                <StudentSpecialLectureRequestButton
                  lectureId={lecture.id}
                  mode="request"
                  size="default"
                />
              </>
            ) : (
              <p>아직 시청할 수 없는 특강입니다.</p>
            )}
          </div>
        </div>
      )}

      {lecture.description ? (
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-2 text-lg font-semibold text-slate-900">특강 설명</h2>
          <p className="whitespace-pre-line text-slate-700">{lecture.description}</p>
        </div>
      ) : null}

      <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800">
        영상은 우디필름캠퍼스 학생만 시청할 수 있도록 제한되어 있으며, 허용 없이 외부 공유 시 재생되지 않습니다.
        무단 캡처·녹화·재배포는 금지되어 있습니다.
      </div>
    </section>
  )
}
