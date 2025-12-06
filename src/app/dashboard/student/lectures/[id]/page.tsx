import { notFound } from 'next/navigation'
import { createClient as createServerSupabase } from '@/lib/supabase/server'
import { requireAuthForDashboard } from '@/lib/auth'
import { getLecture, getYoutubeVideoId } from '@/lib/lectures'
import DashboardBackLink from '@/components/dashboard/DashboardBackLink'

interface PageProps {
    params: Promise<{ id: string }>
}

export default async function StudentLectureDetailPage({ params }: PageProps) {
    await requireAuthForDashboard('student')
    const { id } = await params

    const supabase = createServerSupabase()
    const lecture = await getLecture(supabase, id).catch(() => null)

    if (!lecture || !lecture.is_published) {
        notFound()
    }

    const videoId = getYoutubeVideoId(lecture.youtube_url)

    return (
        <section className="space-y-6">
            <div className="space-y-3">
                <DashboardBackLink fallbackHref="/dashboard/student/lectures" label="강의 목록으로 돌아가기" />
                <div className="space-y-1">
                    <h1 className="text-2xl font-semibold text-slate-900">{lecture.title}</h1>
                    <p className="text-sm text-slate-600">
                        {new Intl.DateTimeFormat('ko', { dateStyle: 'long' }).format(new Date(lecture.created_at))}
                    </p>
                </div>
            </div>

            <div className="overflow-hidden rounded-xl bg-black shadow-lg">
                <div className="relative aspect-video w-full">
                    {videoId ? (
                        <iframe
                            src={`https://www.youtube.com/embed/${videoId}`}
                            title={lecture.title}
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                            allowFullScreen
                            className="absolute inset-0 h-full w-full border-0"
                        />
                    ) : (
                        <div className="flex h-full items-center justify-center text-white">
                            <p>동영상을 불러올 수 없습니다.</p>
                        </div>
                    )}
                </div>
            </div>

            {lecture.description && (
                <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
                    <h2 className="mb-2 text-lg font-semibold text-slate-900">강의 설명</h2>
                    <p className="whitespace-pre-line text-slate-700">{lecture.description}</p>
                </div>
            )}
        </section>
    )
}
