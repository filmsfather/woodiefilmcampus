import Link from 'next/link'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CLASS_MATERIAL_SUBJECTS } from '@/lib/class-materials'

export default function ClassMaterialsLandingPage() {
  return (
    <section className="space-y-6">
      <div className="space-y-3">
        <DashboardBackLink fallbackHref="/dashboard/teacher" label="교사용 허브로 돌아가기" />
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-slate-900">수업자료 아카이브</h1>
          <p className="text-sm text-slate-600">
            과목별 아카이브를 선택해 수업자료를 업로드하고 다운로드하세요.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {Object.entries(CLASS_MATERIAL_SUBJECTS).map(([subject, meta]) => (
          <Card key={subject} className="border-slate-200 shadow-sm transition hover:-translate-y-1 hover:shadow-md">
            <CardHeader className="space-y-2">
              <CardTitle className="text-lg text-slate-900">{meta.label}</CardTitle>
              <CardDescription className="text-sm text-slate-500">{meta.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full">
                {/* Subject Archive Link */}
                <Link href={`/dashboard/teacher/class-materials/${subject}`}>아카이브 열기</Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  )
}
