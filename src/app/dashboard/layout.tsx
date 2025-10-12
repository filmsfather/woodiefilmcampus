import type { ReactNode } from 'react'
import Link from 'next/link'

import { PrincipalRoleMenu } from '@/components/dashboard/PrincipalRoleMenu'
import { SignOutButton } from '@/components/dashboard/SignOutButton'
import { Badge } from '@/components/ui/badge'
import { requireAuthForDashboard } from '@/lib/auth'

const roleLabels = {
  principal: '원장',
  manager: '실장',
  teacher: '선생님',
  student: '학생',
} as const

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode
}) {
  const { profile } = await requireAuthForDashboard()

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex w-full max-w-full items-center justify-between px-4 py-4 sm:px-6 lg:max-w-5xl">
          <div>
            <Link href="/" className="text-lg font-semibold text-slate-900">
              Woodie Campus 2.0
            </Link>
            {profile?.role && (
              <div className="mt-1 text-sm text-slate-500">
                <Badge variant="secondary">{roleLabels[profile.role]}</Badge>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            {profile?.role === 'principal' && (
              <PrincipalRoleMenu currentRole={profile.role} />
            )}
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-full flex-col gap-6 px-4 py-8 sm:px-6 lg:max-w-5xl lg:py-10">
        {children}
      </main>
    </div>
  )
}
