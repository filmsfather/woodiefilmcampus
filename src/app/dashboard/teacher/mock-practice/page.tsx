import type { Metadata } from 'next'
import Link from 'next/link'
import { Video } from 'lucide-react'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { requireAuthForDashboard } from '@/lib/auth'

export const metadata: Metadata = {
  title: '모의실기 | Woodie Film Campus',
  description: '모의 면접 등 실기 연습을 관리하세요.',
}

export default async function MockPracticePage() {
  await requireAuthForDashboard(['teacher', 'manager'])

  return (
    <section className="space-y-6">
      <div className="space-y-3">
        <DashboardBackLink fallbackHref="/dashboard/teacher" label="교사용 허브로 돌아가기" />
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-slate-900">모의실기</h1>
          <p className="text-sm text-slate-600">
            실기 시험을 대비한 연습을 준비하고, 학생별 진행 상황을 관리하세요.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-slate-200 shadow-sm transition hover:-translate-y-1 hover:shadow-md">
          <CardHeader className="space-y-2">
            <CardTitle className="flex items-center gap-2 text-lg text-slate-900">
              <Video className="h-5 w-5" />
              모의 면접
            </CardTitle>
            <CardDescription className="text-sm text-slate-500">
              면접 문제를 만들어 출제하고, 웹캠으로 면접을 녹화하면 학생에게 복기 과제가 자동 생성됩니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button asChild className="w-full">
              <Link href="/dashboard/teacher/mock-practice/interview">모의 면접 관리</Link>
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link href="/dashboard/teacher/mock-practice/interview/new">시험문제 만들기</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </section>
  )
}
