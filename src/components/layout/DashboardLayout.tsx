'use client'

import Link from 'next/link'
import { ReactNode } from 'react'
import { UserRole } from '@/types/user'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { LogOut, Settings, User } from 'lucide-react'

interface DashboardLayoutProps {
  children: ReactNode
  userRole: UserRole
  userName?: string
  userEmail?: string
  onLogout?: () => void
  className?: string
}

const roleNames = {
  principal: '원장',
  manager: '실장',
  teacher: '선생님',
  student: '학생'
} as const

const roleColors = {
  principal: 'bg-purple-100 text-purple-800',
  manager: 'bg-blue-100 text-blue-800',
  teacher: 'bg-green-100 text-green-800',
  student: 'bg-yellow-100 text-yellow-800'
} as const

export function DashboardLayout({
  children,
  userRole,
  userName,
  userEmail,
  onLogout,
  className
}: DashboardLayoutProps) {
  return (
    <div className={cn('min-h-screen bg-gray-50', className)}>
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <Link href="/dashboard" className="text-xl font-semibold text-gray-900 hover:text-gray-600">
                학습관리 플랫폼
              </Link>
              <Badge className={roleColors[userRole]}>
                {roleNames[userRole]}
              </Badge>
            </div>
            
            <div className="flex items-center space-x-4">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="relative h-8 w-8 rounded-full">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback>
                        {userName ? userName[0].toUpperCase() : <User className="h-4 w-4" />}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="end" forceMount>
                  <div className="flex items-center justify-start gap-2 p-2">
                    <div className="flex flex-col space-y-1 leading-none">
                      {userName && (
                        <p className="font-medium">{userName}</p>
                      )}
                      {userEmail && (
                        <p className="w-[200px] truncate text-sm text-muted-foreground">
                          {userEmail}
                        </p>
                      )}
                    </div>
                  </div>
                  <DropdownMenuItem>
                    <Settings className="mr-2 h-4 w-4" />
                    <span>설정</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={onLogout}>
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>로그아웃</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  )
}
