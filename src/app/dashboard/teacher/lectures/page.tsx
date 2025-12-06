import Link from 'next/link'
import { createClient as createServerSupabase } from '@/lib/supabase/server'
import { requireAuthForDashboard } from '@/lib/auth'
import { fetchLectures } from '@/lib/lectures'
import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

function formatKoreanDate(dateIso: string) {
    if (!dateIso) return ''
    const date = new Date(dateIso)
    return new Intl.DateTimeFormat('ko', {
        dateStyle: 'medium',
        timeStyle: 'short',
    }).format(date)
}

export default async function TeacherLecturesPage() {
    const { profile } = await requireAuthForDashboard(['teacher', 'manager', 'principal'])

    if (!profile) return null

    const supabase = createServerSupabase()
    const lectures = await fetchLectures(supabase)

    return (
        <section className="space-y-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="space-y-3">
                    <DashboardBackLink fallbackHref="/dashboard/teacher" label="교사용 허브로 돌아가기" />
                    <div className="space-y-1">
                        <h1 className="text-2xl font-semibold text-slate-900">온라인 강의 관리</h1>
                        <p className="text-sm text-slate-600">
                            학생들에게 제공할 온라인 강의(유튜브 링크)를 관리합니다.
                        </p>
                    </div>
                </div>
                <Button asChild>
                    <Link href="/dashboard/teacher/lectures/new">새 강의 등록</Link>
                </Button>
            </div>

            {lectures.length === 0 ? (
                <Card className="border-slate-200 bg-slate-50">
                    <CardHeader>
                        <CardTitle className="text-lg text-slate-800">등록된 강의가 없습니다.</CardTitle>
                        <CardDescription className="text-sm text-slate-600">
                            유튜브 링크를 통해 학생들에게 강의를 제공해보세요.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Button asChild variant="outline">
                            <Link href="/dashboard/teacher/lectures/new">첫 강의 등록하기</Link>
                        </Button>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {lectures.map((lecture) => (
                        <Card key={lecture.id} className="flex flex-col border-slate-200 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                            <CardHeader className="space-y-2">
                                <div className="flex items-start justify-between gap-2">
                                    <CardTitle className="line-clamp-2 text-lg text-slate-900">
                                        <Link href={`/dashboard/teacher/lectures/${lecture.id}/edit`} className="hover:underline">
                                            {lecture.title}
                                        </Link>
                                    </CardTitle>
                                    <Badge variant={lecture.is_published ? 'default' : 'secondary'}>
                                        {lecture.is_published ? '공개' : '비공개'}
                                    </Badge>
                                </div>
                                <CardDescription className="text-sm text-slate-600">
                                    등록일: {formatKoreanDate(lecture.created_at)}
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="mt-auto pt-0">
                                <p className="mb-4 line-clamp-2 text-sm text-slate-600">
                                    {lecture.description || '설명 없음'}
                                </p>
                                <div className="flex gap-2">
                                    <Button asChild variant="outline" size="sm" className="flex-1">
                                        <Link href={`/dashboard/teacher/lectures/${lecture.id}/edit`}>수정</Link>
                                    </Button>
                                    <Button asChild variant="secondary" size="sm" className="flex-1">
                                        <Link href={lecture.youtube_url} target="_blank" rel="noopener noreferrer">
                                            영상 확인
                                        </Link>
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </section>
    )
}
