import type { ReactNode } from 'react'

import { requireAuthForDashboard } from '@/lib/auth'
import { isOnlineStudent } from '@/lib/online-class'
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

  const onlineStudent = profile.role === 'student' ? await isOnlineStudent(profile.id) : false

  return (
    <DashboardShell profile={profile} isOnlineStudent={onlineStudent}>
      {children}
    </DashboardShell>
  )
}
