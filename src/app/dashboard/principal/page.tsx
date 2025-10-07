import Link from 'next/link'

import { requireAuthForDashboard } from '@/lib/auth'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export default async function PrincipalDashboardPage() {
  const { profile } = await requireAuthForDashboard('principal')

  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-slate-900">원장 대시보드</h1>
        <p className="text-slate-600">
          {profile?.name ?? profile?.email} 님, 승인 및 운영 현황을 확인해주세요.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg text-slate-900">근무일지 승인</CardTitle>
            <CardDescription>선생님이 제출한 근무 기록을 검토하고 승인하거나 반려하세요.</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-end">
            <Button asChild>
              <Link href="/dashboard/principal/work-logs">근무일지 관리</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
        캠퍼스 핵심 지표, 역할 관리 카드 등 원장 전용 콘텐츠가 이 영역에 추가될 예정입니다.
      </div>
    </section>
  )
}
