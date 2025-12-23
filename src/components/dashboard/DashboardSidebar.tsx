'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { LinkIcon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { UserRole } from '@/lib/supabase'
import { createClient } from '@/lib/supabase/client'
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
  const supabase = createClient()
  const sections = getNavigationSections(role)
  const displayName = profileName ?? email ?? '계정'
  const roleLabel = ROLE_LABELS[role]

  const [hasLinkedSocial, setHasLinkedSocial] = useState<boolean | null>(null)
  const [isLinking, setIsLinking] = useState(false)

  useEffect(() => {
    async function checkLinkedAccounts() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user?.identities) {
        // email(비밀번호) 외에 다른 provider가 있는지 확인
        const socialProviders = user.identities.filter(
          (identity) => identity.provider !== 'email'
        )
        setHasLinkedSocial(socialProviders.length > 0)
      }
    }
    checkLinkedAccounts()
  }, [supabase])

  const handleLinkAccount = async (provider: 'google' | 'kakao') => {
    setIsLinking(true)
    try {
      const redirectTo =
        typeof window !== 'undefined' ? window.location.origin : ''
      
      await supabase.auth.linkIdentity({
        provider,
        options: {
          redirectTo: `${redirectTo}/auth/callback?next=/dashboard&action=link`,
        },
      })
    } catch (error) {
      console.error('계정 연결 실패:', error)
      setIsLinking(false)
    }
  }

  const handleNavigate = () => {
    if (onNavigate) {
      onNavigate()
    }
  }

  return (
    <div className={cn('flex h-full flex-col bg-white', className)}>
      <div className="border-b px-4 py-5">
        <div className="space-y-2">
          <div className="space-y-1">
            <p className="text-sm font-medium text-slate-900">{displayName}</p>
            <Badge variant="secondary">{roleLabel}</Badge>
          </div>

          {/* 소셜 계정 연결 안내 */}
          {hasLinkedSocial === false && (
            <div className="pt-2 space-y-2">
              <p className="text-xs text-slate-500">
                <LinkIcon className="inline-block w-3 h-3 mr-1" />
                소셜 계정을 연결하면 더 편하게 로그인할 수 있어요
              </p>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 h-7 text-xs bg-[#FEE500] hover:bg-[#FDD800] text-[#191919] border-0"
                  onClick={() => handleLinkAccount('kakao')}
                  disabled={isLinking}
                >
                  카카오
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 h-7 text-xs"
                  onClick={() => handleLinkAccount('google')}
                  disabled={isLinking}
                >
                  Google
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
        {sections.map((section) => (
          <div key={section.id} className="space-y-2">
            <p className="rounded-md bg-[var(--secondary)] px-2 py-1 text-xs font-semibold uppercase tracking-wide text-[var(--secondary-foreground)]">
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
