import { requireAuthForDashboard } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import Link from 'next/link'

const STUDENT_ACTIONS = [
  {
    label: '이번달 학습 계획',
    href: '/dashboard/student/monthly-plan',
  },
  {
    label: '이번주 문제집 풀기',
    href: '/dashboard/student/tasks',
  },
  {
    label: '지난달 학습 일지',
    href: '/dashboard/student/learning-journal',
  },
  {
    label: '감상일지 보기',
    href: '/dashboard/student/film-notes',
  },
]

export default async function StudentDashboardPage() {
  const { profile } = await requireAuthForDashboard('student')

  if (!profile) {
    return null
  }

  return (
    <section className="mx-auto flex max-w-xl flex-col gap-6">
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="space-y-2">
          <CardTitle className="text-2xl font-semibold text-slate-900">학습관리</CardTitle>
          <p className="text-sm text-slate-600">필요한 학습 메뉴를 선택해 다음 단계로 이동하세요.</p>
        </CardHeader>
        <CardContent className="grid gap-3">
          {STUDENT_ACTIONS.map(({ label, href }) => (
            <Button key={href} asChild size="lg" variant="outline" className="justify-center">
              <Link href={href}>{label}</Link>
            </Button>
          ))}
        </CardContent>
      </Card>
    </section>
  )
}
