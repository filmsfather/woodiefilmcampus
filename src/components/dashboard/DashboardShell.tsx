'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { Menu } from 'lucide-react'

import { DashboardSidebar } from '@/components/dashboard/DashboardSidebar'
import { ROLE_LABELS } from '@/components/dashboard/dashboard-navigation'
import type { UserProfile } from '@/lib/supabase'
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { SignOutButton } from '@/components/dashboard/SignOutButton'

interface DashboardShellProps {
  profile: UserProfile
  children: ReactNode
}

export function DashboardShell({ profile, children }: DashboardShellProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const roleLabel = ROLE_LABELS[profile.role]

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="flex min-h-screen">
        <aside className="hidden w-72 border-r border-slate-200 lg:block">
          <DashboardSidebar
            role={profile.role}
            profileName={profile.name}
            email={profile.email}
            className="h-full"
          />
        </aside>
        <div className="flex flex-1 flex-col">
          <header className="border-b border-slate-200 bg-white">
            <div className="mx-auto flex w-full max-w-full items-center justify-between px-4 py-4 sm:px-6 lg:max-w-5xl">
              <div className="flex items-center gap-3">
                <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
                  <SheetTrigger asChild>
                    <Button variant="ghost" size="icon" className="lg:hidden">
                      <Menu className="size-5" />
                      <span className="sr-only">메뉴 열기</span>
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="left" className="w-72 max-w-[80vw] p-0">
                    <SheetHeader className="sr-only">
                      <SheetTitle>메뉴</SheetTitle>
                      <SheetDescription>모바일 네비게이션 메뉴입니다.</SheetDescription>
                    </SheetHeader>
                    <DashboardSidebar
                      role={profile.role}
                      profileName={profile.name}
                      email={profile.email}
                      onNavigate={() => setMobileNavOpen(false)}
                    />
                  </SheetContent>
                </Sheet>
                <Link href="/" className="text-lg font-semibold text-slate-900">
                  Woodie Campus 2.0
                </Link>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant="secondary" className="hidden sm:inline-flex">
                  {roleLabel}
                </Badge>
                <SignOutButton size="sm" />
              </div>
            </div>
          </header>
          <main className="mx-auto flex w-full max-w-full flex-1 flex-col gap-6 px-4 py-8 sm:px-6 lg:max-w-5xl lg:py-10">
            {children}
          </main>
        </div>
      </div>
    </div>
  )
}
