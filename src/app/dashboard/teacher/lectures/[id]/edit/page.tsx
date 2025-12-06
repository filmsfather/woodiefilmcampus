import { notFound } from 'next/navigation'
import { createClient as createServerSupabase } from '@/lib/supabase/server'
import { requireAuthForDashboard } from '@/lib/auth'
import { getLecture } from '@/lib/lectures'
import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { LectureForm } from '@/components/dashboard/teacher/lectures/LectureForm'
import { updateLectureAction, deleteLectureAction } from '@/app/dashboard/teacher/lectures/actions'
import { Button } from '@/components/ui/button'

interface PageProps {
    params: Promise<{ id: string }>
}

export default async function EditLecturePage({ params }: PageProps) {
    await requireAuthForDashboard(['teacher', 'manager', 'principal'])
    const { id } = (await params)

    const supabase = createServerSupabase()
    const lecture = await getLecture(supabase, id).catch(() => null)

    if (!lecture) {
        notFound()
    }

    const deleteAction = deleteLectureAction.bind(null, id)
    const updateAction = updateLectureAction.bind(null, id)

    return (
        <section className="space-y-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="space-y-3">
                    <DashboardBackLink fallbackHref="/dashboard/teacher/lectures" label="강의 목록으로 돌아가기" />
                    <div className="space-y-1">
                        <h1 className="text-2xl font-semibold text-slate-900">강의 수정</h1>
                        <p className="text-sm text-slate-600">
                            등록된 강의 정보를 수정합니다.
                        </p>
                    </div>
                </div>
                <form action={deleteAction}>
                    <Button type="submit" variant="destructive">
                        강의 삭제
                    </Button>
                </form>
            </div>

            <LectureForm lecture={lecture} action={updateAction} />
        </section>
    )
}
