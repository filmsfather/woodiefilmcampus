import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { LectureForm } from '@/components/dashboard/teacher/lectures/LectureForm'
import { createLectureAction } from '@/app/dashboard/teacher/lectures/actions'
import { requireAuthForDashboard } from '@/lib/auth'

export default async function NewLecturePage() {
    await requireAuthForDashboard(['teacher', 'manager', 'principal'])

    return (
        <section className="space-y-6">
            <div className="space-y-3">
                <DashboardBackLink fallbackHref="/dashboard/teacher/lectures" label="강의 목록으로 돌아가기" />
                <div className="space-y-1">
                    <h1 className="text-2xl font-semibold text-slate-900">새 강의 등록</h1>
                    <p className="text-sm text-slate-600">
                        학생들에게 제공할 새로운 강의를 등록합니다.
                    </p>
                </div>
            </div>

            <LectureForm action={createLectureAction} />
        </section>
    )
}
