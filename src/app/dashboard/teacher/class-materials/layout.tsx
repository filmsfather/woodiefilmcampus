import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'

import { requireAuthForDashboard, resolveDashboardPath } from '@/lib/auth'
import { isClassMaterialAllowedRole } from '@/lib/class-materials'

export default async function ClassMaterialsLayout({ children }: { children: ReactNode }) {
  const { profile } = await requireAuthForDashboard()

  if (!profile?.role) {
    redirect('/login')
  }

  if (!isClassMaterialAllowedRole(profile.role)) {
    redirect(resolveDashboardPath(profile.role))
  }

  return children
}
