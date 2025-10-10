import Link from 'next/link'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { AdmissionScheduleCalendar } from '@/components/dashboard/admission-materials/AdmissionScheduleCalendar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ADMISSION_MATERIAL_CATEGORIES } from '@/lib/admission-materials'
import { listAdmissionScheduleEvents } from '@/app/dashboard/teacher/admission-materials/actions'

export default async function AdmissionMaterialsLandingPage() {
  const calendarResult = await listAdmissionScheduleEvents({})

  if (!calendarResult.success) {
    throw new Error(calendarResult.error)
  }

  return (
    <section className="space-y-6">
      <div className="space-y-3">
        <DashboardBackLink fallbackHref="/dashboard/teacher" label="교사용 허브로 돌아가기" />
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-slate-900">입시 자료 아카이브</h1>
          <p className="text-sm text-slate-600">카테고리를 선택해 입시 준비 자료를 업로드하고 일정을 관리하세요.</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Object.entries(ADMISSION_MATERIAL_CATEGORIES).map(([category, meta]) => (
          <Card key={category} className="border-slate-200 shadow-sm transition hover:-translate-y-1 hover:shadow-md">
            <CardHeader className="space-y-2">
              <CardTitle className="text-lg text-slate-900">{meta.label}</CardTitle>
              <CardDescription className="text-sm text-slate-500">{meta.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full">
                <Link href={`/dashboard/teacher/admission-materials/${category}`}>카테고리 열기</Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-slate-200">
        <CardHeader className="space-y-1 border-b border-slate-100 pb-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">입시 일정 달력</h2>
              <p className="text-sm text-slate-500">등록된 모든 입시 자료 일정을 한 번에 확인하세요.</p>
            </div>
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/teacher/admission-materials/calendar">전체 화면 보기</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="p-4">
            <AdmissionScheduleCalendar initialEvents={calendarResult.events} />
          </div>
        </CardContent>
      </Card>
    </section>
  )
}
