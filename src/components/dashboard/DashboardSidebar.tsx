'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { UserRole } from '@/lib/supabase'
import { SignOutButton } from '@/components/dashboard/SignOutButton'
import { getNavigationSections, ROLE_LABELS } from '@/components/dashboard/dashboard-navigation'

interface DashboardSidebarProps {
  role: UserRole
  profileName?: string | null
  email?: string | null
  onNavigate?: () => void
  className?: string
}

export function DashboardSidebar({
  role,
  profileName,
  email,
  onNavigate,
  className,
}: DashboardSidebarProps) {
  const pathname = usePathname()
  const sections = getNavigationSections(role)
  const displayName = profileName ?? email ?? '계정'
  const roleLabel = ROLE_LABELS[role]

  const handleNavigate = () => {
    if (onNavigate) {
      onNavigate()
    }
  }

  return (
    <div className={cn('flex h-full flex-col bg-white', className)}>
      <div className="border-b px-4 py-5">
        <div className="space-y-1">
          <p className="text-sm font-medium text-slate-900">{displayName}</p>
          <Badge variant="secondary">{roleLabel}</Badge>
        </div>
      </div>
      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
        {sections.map((section) => (
          <div key={section.id} className="space-y-2">
            <p className="rounded-md bg-[var(--sidebar-accent)] px-2 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--sidebar-accent-foreground)]">
              {section.title}
            </p>
            <div className="space-y-1">
              {section.items.map((item) => {
                const isActive =
                  pathname === item.href || pathname.startsWith(`${item.href}/`)

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={handleNavigate}
                    className={cn(
                      'block rounded-md px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 hover:text-slate-900',
                      isActive && 'bg-slate-100 text-slate-900'
                    )}
                  >
                    {item.label}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="border-t px-4 py-4">
        <SignOutButton className="w-full justify-center" />
      </div>
    </div>
  )
}
