import Link from 'next/link'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

type ManagerQuickLinkAction = {
  label: string
  href: string
  variant?: 'default' | 'outline' | 'secondary'
}

type ManagerQuickLinkSection = {
  title: string
  description: string
  actions: ManagerQuickLinkAction[]
}

const QUICK_LINK_SECTIONS: ManagerQuickLinkSection[] = [
  {
    title: '등록관리',
    description: '등록부터 상담, 구성원 관리를 빠르게 실행하세요.',
    actions: [
      { label: '등록원서 보기', href: '/dashboard/manager/enrollment' },
      { label: '상담관리 열기', href: '/dashboard/manager/counseling/slots', variant: 'outline' },
      { label: '구성원 관리', href: '/dashboard/manager/members', variant: 'outline' },
    ],
  },
  {
    title: '반 관리',
    description: '반 편성과 학습일지를 한 화면에서 정리하세요.',
    actions: [
      { label: '반관리 열기', href: '/dashboard/manager/classes' },
      { label: '결석확인', href: '/dashboard/manager/absences', variant: 'outline' },
    ],
  },
  {
    title: '업무관리',
    description: '운영 업무를 효율적으로 처리하세요.',
    actions: [
      { label: '인쇄요청 관리', href: '/dashboard/manager/print-requests' },
      { label: '공지사항', href: '/dashboard/teacher/notices', variant: 'outline' },
      { label: '교사 대시보드 열기', href: '/dashboard/teacher', variant: 'secondary' },
    ],
  },
  {
    title: '학습일지 관리',
    description: '주기를 만들고 주요 일정까지 한 곳에서 관리하세요.',
    actions: [
      { label: '학습일지 생성', href: '/dashboard/manager/learning-journal' },
      { label: '학습일지 열람', href: '/dashboard/principal/learning-journal/review', variant: 'outline' },
    ],
  },
]

export function ManagerQuickLinks() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {QUICK_LINK_SECTIONS.map((section) => (
        <Card key={section.title}>
          <CardHeader className="gap-2">
            <CardTitle className="text-lg">{section.title}</CardTitle>
            <CardDescription>{section.description}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {section.actions.map((action, index) => (
              <Button
                key={action.href}
                asChild
                variant={action.variant ?? (index === 0 ? 'default' : 'outline')}
              >
                <Link href={action.href}>{action.label}</Link>
              </Button>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
