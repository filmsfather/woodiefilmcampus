import type { ReactNode } from 'react'

import { requireAuthForDashboard } from '@/lib/auth'
import { DashboardShell } from '@/components/dashboard/DashboardShell'

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode
}) {
  const { profile } = await requireAuthForDashboard()

  if (!profile) {
    return null
  }

  return <DashboardShell profile={profile}>{children}</DashboardShell>
}
