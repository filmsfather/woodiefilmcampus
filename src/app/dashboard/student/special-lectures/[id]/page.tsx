import { notFound } from 'next/navigation'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { SpecialLecturePlayer } from '@/components/dashboard/special-lectures/SpecialLecturePlayer'
import { requireAuthForDashboard } from '@/lib/auth'
import {
  getSignedSpecialLectureVideoUrl,
  getSpecialLecture,
} from '@/lib/special-lectures'
import { createClient as createServerSupabase } from '@/lib/supabase/server'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function StudentSpecialLectureDetailPage({ params }: PageProps) {
  await requireAuthForDashboard('student')

  const { id } = await params
  const supabase = await createServerSupabase()

  const lecture = await getSpecialLecture(supabase, id).catch(() => null)
  // RLS가 차단하면 lecture는 null이며, 허용된 학생만 게시된 특강을 볼 수 있습니다.
  if (!lecture || !lecture.is_published) {
    notFound()
  }

  const videoPath = lecture.video_asset?.path ?? null
  const videoUrl = videoPath ? await getSignedSpecialLectureVideoUrl(supabase, videoPath) : null

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
          <div className="flex aspect-video w-full items-center justify-center text-white">
            <p>영상이 아직 등록되지 않았습니다.</p>
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
