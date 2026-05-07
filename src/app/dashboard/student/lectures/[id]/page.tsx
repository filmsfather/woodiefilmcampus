import { notFound } from 'next/navigation'
import { createClient as createServerSupabase } from '@/lib/supabase/server'
import { requireAuthForDashboard } from '@/lib/auth'
import { fetchLectureAttachments, getLecture, getYoutubeVideoId } from '@/lib/lectures'
import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface PageProps {
    params: Promise<{ id: string }>
}

export default async function StudentLectureDetailPage({ params }: PageProps) {
    await requireAuthForDashboard('student')
    const { id } = await params

    const supabase = await createServerSupabase()
    const lecture = await getLecture(supabase, id).catch(() => null)

    if (!lecture || !lecture.is_published) {
        notFound()
    }

    const videoId = getYoutubeVideoId(lecture.youtube_url)

    const attachments = await fetchLectureAttachments(supabase, id)
    const attachmentsWithUrls = await Promise.all(
        attachments.map(async (attachment) => {
            let downloadUrl: string | null = null
            try {
                const { data: signed, error: signedError } = await supabase.storage
                    .from(attachment.bucket)
                    .createSignedUrl(attachment.path, 60 * 60)
                if (signedError) {
                    console.error('[lectures] failed to sign attachment url', signedError)
                } else {
                    downloadUrl = signed?.signedUrl ?? null
                }
            } catch (signError) {
                console.error('[lectures] unexpected error signing attachment url', signError)
            }
            return { ...attachment, downloadUrl }
        })
    )

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

            {attachmentsWithUrls.length > 0 && (
                <Card className="border-slate-200">
                    <CardHeader className="space-y-1">
                        <CardTitle className="text-base text-slate-900">첨부자료</CardTitle>
                        <p className="text-xs text-slate-500">강의에 함께 제공된 학습 자료입니다.</p>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        {attachmentsWithUrls.map((attachment, index) => (
                            <div
                                key={attachment.id}
                                className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                            >
                                <span>
                                    {index + 1}. {attachment.name}
                                </span>
                                {attachment.downloadUrl ? (
                                    <Button asChild variant="outline" size="sm">
                                        <a href={attachment.downloadUrl} target="_blank" rel="noreferrer">
                                            다운로드
                                        </a>
                                    </Button>
                                ) : (
                                    <span className="text-xs text-rose-400">URL 생성 실패</span>
                                )}
                            </div>
                        ))}
                    </CardContent>
                </Card>
            )}
        </section>
    )
}
