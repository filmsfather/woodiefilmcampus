import Link from 'next/link'
import { createClient as createServerSupabase } from '@/lib/supabase/server'
import { requireAuthForDashboard } from '@/lib/auth'
import { fetchLectures, getYoutubeVideoId } from '@/lib/lectures'
import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

function formatKoreanDate(dateIso: string) {
    if (!dateIso) return ''
    const date = new Date(dateIso)
    return new Intl.DateTimeFormat('ko', {
        dateStyle: 'medium',
        timeStyle: 'short',
    }).format(date)
}

export default async function StudentLecturesPage() {
    const { profile } = await requireAuthForDashboard('student')

    if (!profile) return null

    const supabase = await createServerSupabase()
    const allLectures = await fetchLectures(supabase)
    const lectures = allLectures.filter(l => l.is_published)

    return (
        <section className="space-y-6">
            <div className="space-y-3">
                <DashboardBackLink fallbackHref="/dashboard/student" label="대시보드로 돌아가기" />
                <div className="space-y-1">
                    <h1 className="text-2xl font-semibold text-slate-900">우디쌤 인터넷강의</h1>
                    <p className="text-sm text-slate-600">
                        선생님이 올려주신 강의를 시청하며 학습하세요.
                    </p>
                </div>
            </div>

            {lectures.length === 0 ? (
                <Card className="border-slate-200 bg-slate-50">
                    <CardHeader>
                        <CardTitle className="text-lg text-slate-800">등록된 강의가 없습니다.</CardTitle>
                        <CardDescription className="text-sm text-slate-600">
                            새로운 강의가 올라오면 이곳에서 확인할 수 있습니다.
                        </CardDescription>
                    </CardHeader>
                </Card>
            ) : (
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {lectures.map((lecture) => {
                        const videoId = getYoutubeVideoId(lecture.youtube_url)
                        const thumbnailUrl = videoId
                            ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
                            : null

                        return (
                            <Link key={lecture.id} href={`/dashboard/student/lectures/${lecture.id}`} className="group block h-full">
                                <Card className="flex h-full flex-col overflow-hidden border-slate-200 shadow-sm transition group-hover:-translate-y-1 group-hover:shadow-md">
                                    <div className="relative aspect-video w-full bg-slate-100">
                                        {thumbnailUrl ? (
                                            <img
                                                src={thumbnailUrl}
                                                alt=""
                                                className="h-full w-full object-cover"
                                            />
                                        ) : (
                                            <div className="flex h-full items-center justify-center text-slate-400">
                                                <span className="text-sm">썸네일 없음</span>
                                            </div>
                                        )}
                                        <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition group-hover:bg-black/10">
                                            <div className="rounded-full bg-white/90 p-3 opacity-0 shadow-lg transition group-hover:opacity-100">
                                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6 text-slate-900">
                                                    <path fillRule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z" clipRule="evenodd" />
                                                </svg>
                                            </div>
                                        </div>
                                    </div>
                                    <CardHeader className="space-y-2 p-4">
                                        <CardTitle className="line-clamp-2 text-lg text-slate-900 group-hover:text-blue-600 group-hover:underline">
                                            {lecture.title}
                                        </CardTitle>
                                        <CardDescription className="text-xs text-slate-500">
                                            {formatKoreanDate(lecture.created_at)}
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent className="mt-auto p-4 pt-0">
                                        <p className="line-clamp-2 text-sm text-slate-600">
                                            {lecture.description || '설명 없음'}
                                        </p>
                                    </CardContent>
                                </Card>
                            </Link>
                        )
                    })}
                </div>
            )}
        </section>
    )
}
