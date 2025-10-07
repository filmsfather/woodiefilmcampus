import Link from 'next/link'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ADMISSION_MATERIAL_CATEGORIES } from '@/lib/admission-materials'

export default function AdmissionMaterialsLandingPage() {
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

      <Card className="border-slate-200 bg-slate-50">
        <CardContent className="flex flex-col gap-3 p-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">입시 일정 달력</h2>
            <p className="text-sm text-slate-500">등록한 게시글의 일정을 한눈에 확인해 수업 준비를 돕습니다.</p>
          </div>
          <Button asChild variant="secondary">
            <Link href="/dashboard/teacher/admission-materials/calendar">달력 보기</Link>
          </Button>
        </CardContent>
      </Card>
    </section>
  )
}
