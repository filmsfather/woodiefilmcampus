import type { ReactNode } from 'react'
import Link from 'next/link'

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
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div>
            <Link href="/" className="text-lg font-semibold text-slate-900">
              Woodie Film Campus
            </Link>
            {profile?.role && (
              <div className="mt-1 text-sm text-slate-500">
                <Badge variant="secondary">{roleLabels[profile.role]}</Badge>
              </div>
            )}
          </div>
          <SignOutButton />
        </div>
      </header>
      <main className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-10">
        {children}
      </main>
    </div>
  )
}
