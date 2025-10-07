import Link from 'next/link'

import { requireAuthForDashboard } from '@/lib/auth'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

type TeacherDashboardAction = {
  label: string
  href: string
  description?: string
  variant?: 'default' | 'outline' | 'secondary' | 'ghost' | 'link' | 'destructive'
}

type TeacherDashboardSection = {
  title: string
  description: string
  actions: TeacherDashboardAction[]
}

const TEACHER_SECTIONS: TeacherDashboardSection[] = [
  {
    title: '근무관리',
    description: '근무일지를 작성하고 승인 현황을 확인하세요.',
    actions: [
      {
        label: '근무일지 작성',
        href: '/dashboard/teacher/work-journal',
        description: '월별 근무 기록을 작성하고 원장 승인 상태를 확인합니다.',
      },
      {
        label: '학습일지',
        href: '/dashboard/teacher/learning-journal',
        description: '반별 학습일지를 작성하고 제출 상태를 관리하세요.',
        variant: 'outline',
      },
    ],
  },
  {
    title: '문제집 아카이브',
    description: '문제집을 생성·편집하고 저장된 워크북을 관리하세요.',
    actions: [
      {
        label: '문제집 만들기',
        href: '/dashboard/workbooks/new',
        description: '새 문제집을 작성하는 마법사로 이동합니다.',
      },
      {
        label: '출판된 문제집 확인',
        href: '/dashboard/workbooks',
        description: '출판된 문제집과 보관 중인 자료를 살펴보세요.',
        variant: 'outline',
      },
    ],
  },
  {
    title: '수업자료',
    description: '수업과 입시에 필요한 자료 아카이브를 한곳에서 확인하세요.',
    actions: [
      {
        label: '수업자료 아카이브',
        href: '/dashboard/teacher/class-materials',
        description: '강의에 사용하는 수업자료를 준비하고 관리하세요.',
      },
      {
        label: '입시자료 아카이브',
        href: '/dashboard/teacher/admission-materials',
        description: '입시 대비 자료와 일정을 관리하고 학생과 공유하세요.',
        variant: 'outline',
      },
    ],
  },
  {
    title: '과제 관리',
    description: '반과 학생에게 과제를 배정하고 평가 흐름을 관리하세요.',
    actions: [
      {
        label: '과제 출제하기',
        href: '/dashboard/assignments/new',
        description: '문제집을 선택해 새로운 과제를 배정합니다.',
      },
      {
        label: '과제 검사하기',
        href: '/dashboard/teacher/review',
        description: '제출된 과제를 확인하고 평가를 진행하세요.',
        variant: 'outline',
      },
    ],
  },
]

export default async function TeacherDashboardPage() {
  const { profile } = await requireAuthForDashboard('teacher')

  return (
    <section className="mx-auto flex max-w-4xl flex-col gap-6">
      <header className="space-y-2 text-center">
        <h1 className="text-3xl font-semibold text-slate-900">교사용 허브</h1>
        <p className="text-sm text-slate-600">
          {profile?.name ?? profile?.email ?? '선생님'} 님, 다음 작업을 선택해 주세요.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        {TEACHER_SECTIONS.map((section) => (
          <Card key={section.title} className="border-slate-200 shadow-sm transition hover:-translate-y-1 hover:shadow-md">
            <CardHeader className="space-y-2">
              <CardTitle className="text-lg text-slate-900">{section.title}</CardTitle>
              <CardDescription className="text-sm text-slate-500">{section.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-3">
                {section.actions.map((action, index) => (
                  <div key={action.href} className="flex flex-col gap-1">
                    <Button
                      asChild
                      className="w-full"
                      variant={action.variant ?? (index === 0 ? 'default' : 'outline')}
                    >
                      <Link href={action.href}>{action.label}</Link>
                    </Button>
                    {action.description ? (
                      <p className="text-xs text-slate-500 text-center md:text-left">{action.description}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  )
}
