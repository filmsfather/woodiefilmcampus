'use client'

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Check, ChevronsUpDown } from 'lucide-react'
import type { UserRole } from '@/lib/supabase'

interface PrincipalRoleMenuProps {
  currentRole: UserRole
}

const ROLE_OPTIONS: Array<{
  role: UserRole
  label: string
  description: string
}> = [
  {
    role: 'principal',
    label: '원장 대시보드',
    description: '전체 캠퍼스 현황을 총괄합니다.',
  },
  {
    role: 'manager',
    label: '실장 대시보드',
    description: '가입 승인과 반 편성을 관리합니다.',
  },
  {
    role: 'teacher',
    label: '선생님 대시보드',
    description: '수업 운영과 학생 학습을 살펴봅니다.',
  },
  {
    role: 'student',
    label: '학생 대시보드',
    description: '학습 일정과 과제 현황을 확인합니다.',
  },
]

export function PrincipalRoleMenu({ currentRole }: PrincipalRoleMenuProps) {
  const router = useRouter()

  const activeLabel = useMemo(() => {
    const active = ROLE_OPTIONS.find((option) => option.role === currentRole)
    return active?.label ?? '역할 대시보드'
  }, [currentRole])

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="inline-flex items-center gap-2">
          {activeLabel}
          <ChevronsUpDown className="h-4 w-4 text-slate-500" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>대시보드 전환</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {ROLE_OPTIONS.map((option) => (
          <DropdownMenuItem
            key={option.role}
            onSelect={() => router.push(`/dashboard/${option.role}`)}
            className="flex flex-col items-start gap-1 py-2"
          >
            <span className="flex w-full items-center justify-between text-sm font-medium text-slate-900">
              {option.label}
              {option.role === currentRole && <Check className="h-4 w-4 text-emerald-500" />}
            </span>
            <span className="text-xs text-slate-500">{option.description}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
