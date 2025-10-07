import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { AdmissionScheduleCalendar } from '@/components/dashboard/admission-materials/AdmissionScheduleCalendar'
import { listAdmissionScheduleEvents } from '@/app/dashboard/teacher/admission-materials/actions'

export default async function AdmissionMaterialCalendarPage() {
  const result = await listAdmissionScheduleEvents({})

  if (!result.success) {
    throw new Error(result.error)
  }

  return (
    <section className="space-y-6">
      <DashboardBackLink fallbackHref="/dashboard/teacher/admission-materials" label="입시 자료 아카이브로 돌아가기" />
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold text-slate-900">입시 일정 달력</h1>
        <p className="text-sm text-slate-600">등록된 모든 입시 자료 일정을 한 번에 확인하고 이동하세요.</p>
      </div>

      <AdmissionScheduleCalendar initialEvents={result.events} />
    </section>
  )
}
