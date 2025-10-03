import Link from 'next/link'
import {
  ArrowRight,
  Check,
  Crown,
  GraduationCap,
  ShieldCheck,
  Users as UsersIcon,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { resolveDashboardPath } from '@/lib/auth'
import type { UserRole } from '@/lib/supabase'
import type { LucideIcon } from 'lucide-react'

interface RoleOption {
  role: UserRole
  title: string
  description: string
  icon: LucideIcon
  highlights: string[]
}

const ROLE_OPTIONS: RoleOption[] = [
  {
    role: 'principal',
    title: '원장 대시보드',
    description: '캠퍼스 전체 현황과 권한을 총괄합니다.',
    icon: Crown,
    highlights: ['전사 지표 점검', '역할/권한 관리', '주요 리포트 진입'],
  },
  {
    role: 'manager',
    title: '실장 대시보드',
    description: '가입 승인과 반 편성을 관리합니다.',
    icon: ShieldCheck,
    highlights: ['가입 요청 처리', '반/강좌 구성', '권한 위임'],
  },
  {
    role: 'teacher',
    title: '선생님 대시보드',
    description: '수업 진행과 학생 관리에 집중합니다.',
    icon: GraduationCap,
    highlights: ['강의 일정 확인', '학생 학습 현황', '과제 피드백'],
  },
  {
    role: 'student',
    title: '학생 대시보드',
    description: '학습 일정과 과제를 확인합니다.',
    icon: UsersIcon,
    highlights: ['수업 일정 확인', '과제 제출 현황', '공지사항 열람'],
  },
]

interface PrincipalRoleSwitcherProps {
  currentRole: UserRole
}

export function PrincipalRoleSwitcher({ currentRole }: PrincipalRoleSwitcherProps) {
  return (
    <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
      {ROLE_OPTIONS.map((option) => {
        const Icon = option.icon
        const isCurrentRole = option.role === currentRole
        const href = resolveDashboardPath(option.role)

        return (
          <Link key={option.role} href={href} className="group h-full">
            <Card
              className={cn(
                'flex h-full flex-col justify-between transition-all duration-200',
                'hover:-translate-y-1 hover:shadow-lg',
                isCurrentRole && 'border-slate-900 shadow-md'
              )}
            >
              <CardHeader className="flex flex-row items-start justify-between">
                <div className="flex items-center gap-3">
                  <span className="rounded-full bg-slate-100 p-2 text-slate-600">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div>
                    <CardTitle className="text-lg">{option.title}</CardTitle>
                    <CardDescription>{option.description}</CardDescription>
                  </div>
                </div>
                {isCurrentRole && <Badge variant="secondary">현재</Badge>}
              </CardHeader>
              <CardContent className="flex-1">
                <ul className="space-y-2 text-sm text-slate-600">
                  {option.highlights.map((highlight) => (
                    <li key={highlight} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 text-slate-400" />
                      <span>{highlight}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter className="flex items-center justify-between text-sm text-slate-500 transition-colors group-hover:text-slate-900">
                <span>바로가기</span>
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </CardFooter>
            </Card>
          </Link>
        )
      })}
    </div>
  )
}
