import { redirect } from 'next/navigation'

import { requireAuthForDashboard, resolveDashboardPath } from '@/lib/auth'

export default async function DashboardIndexPage() {
  const { profile } = await requireAuthForDashboard()

  if (!profile) {
    redirect('/login')
  }

  redirect(resolveDashboardPath(profile.role))
}
