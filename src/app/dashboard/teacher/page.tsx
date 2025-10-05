import Link from 'next/link'

import { requireAuthForDashboard } from '@/lib/auth'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

const NAV_ITEMS = [
  {
    title: '문제집 아카이브',
    description: '문제집을 생성·편집하고 저장된 워크북을 관리하세요.',
    href: '/dashboard/workbooks',
  },
  {
    title: '과제 검사',
    description: '과제 제출 현황을 확인하고 평가·인쇄 요청을 처리하세요.',
    href: '/dashboard/teacher/review',
  },
]

export default async function TeacherDashboardPage() {
  const { profile } = await requireAuthForDashboard('teacher')

  return (
    <section className="mx-auto flex max-w-4xl flex-col gap-6">
      <header className="space-y-2 text-center">
        <h1 className="text-3xl font-semibold text-slate-900">교사용 허브</h1>
        <p className="text-sm text-slate-600">
          {profile?.name ?? profile?.email ?? '선생님'} 님, 작업 영역을 선택해 주세요.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        {NAV_ITEMS.map((item) => (
          <Card key={item.href} className="border-slate-200 shadow-sm transition hover:-translate-y-1 hover:shadow-md">
            <CardHeader>
              <CardTitle className="text-lg text-slate-900">{item.title}</CardTitle>
              <CardDescription className="text-sm text-slate-500">{item.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full">
                <Link href={item.href}>바로가기</Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  )
}
