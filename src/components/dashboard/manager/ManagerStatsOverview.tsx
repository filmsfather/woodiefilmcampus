'use client'

import { UserPlus, Users } from 'lucide-react'

import { StatsCard } from '@/components/dashboard/StatsCard'

interface ManagerStatsOverviewProps {
  pendingCount: number
  approvedCount: number
}

export function ManagerStatsOverview({ pendingCount, approvedCount }: ManagerStatsOverviewProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <StatsCard
        title="가입 대기 인원"
        value={pendingCount}
        description="승인 처리되지 않은 가입 요청"
        icon={UserPlus}
      />
      <StatsCard
        title="승인된 구성원"
        value={approvedCount}
        description="학원 구성원으로 승인된 계정"
        icon={Users}
      />
    </div>
  )
}
