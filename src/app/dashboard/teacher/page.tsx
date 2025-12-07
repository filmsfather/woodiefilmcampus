import Link from 'next/link'

import { requireAuthForDashboard } from '@/lib/auth'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { UnreadNoticeBanner } from '@/components/dashboard/notice/UnreadNoticeBanner'
import { AssignedClassesList } from '@/components/dashboard/teacher/AssignedClassesList'
import { AnnualScheduleSummaryCard } from '@/components/dashboard/teacher/AnnualScheduleSummaryCard'
import { NoticeSummaryCard } from '@/components/dashboard/teacher/NoticeSummaryCard'
import { TimetableSummaryCard } from '@/components/dashboard/teacher/TimetableSummaryCard'
import { WorkJournalSummaryCard } from '@/components/dashboard/teacher/WorkJournalSummaryCard'

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
        label: '결석확인',
        href: '/dashboard/teacher/absences',
        description: '결석계를 작성하고 주간 결석 현황을 확인하세요.',
      },
    ],
  },
  {
    title: '과제관리',
    description: '반과 학생에게 과제를 배정하고 평가 흐름을 관리하세요.',
    actions: [
      {
        label: '학생 아틀리에',
        href: '/dashboard/teacher/atelier',
        description: '학생 제출물을 추천하거나 목록에서 정리하세요.',
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
        label: '온라인 강의 관리',
        href: '/dashboard/teacher/lectures',
        description: '학생들에게 제공할 온라인 강의(유튜브)를 관리합니다.',
        variant: 'outline',
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
    title: '문제집 관리',
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
]

export default async function TeacherDashboardPage() {
  const { profile } = await requireAuthForDashboard(['teacher', 'manager'])
  const isManager = profile?.role === 'manager'
  const hubTitle = isManager ? '교사·실장 허브' : '교사용 허브'
  const greetingName = profile?.name ?? profile?.email ?? (isManager ? '실장님' : '선생님')

  return (
    <section className="mx-auto flex max-w-4xl flex-col gap-6">
      <header className="space-y-2 text-center">
        <h1 className="text-3xl font-semibold text-slate-900">{hubTitle}</h1>
        <p className="text-sm text-slate-600">
          {greetingName} 님, 다음 작업을 선택해 주세요.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <AnnualScheduleSummaryCard />
        <NoticeSummaryCard />
        <TimetableSummaryCard />
        <WorkJournalSummaryCard />
      </div>

      <AssignedClassesList />

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
    </section >
  )
}
