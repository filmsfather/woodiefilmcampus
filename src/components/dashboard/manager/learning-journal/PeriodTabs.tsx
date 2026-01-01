'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PeriodRowForm } from './PeriodRowForm'
import type { LearningJournalPeriodWithClass } from '@/types/learning-journal'

interface PeriodTabsProps {
  periods: LearningJournalPeriodWithClass[]
}

export function PeriodTabs({ periods }: PeriodTabsProps) {
  // 진행 중: draft, in_progress
  const inProgressPeriods = periods.filter(
    (p) => p.status === 'draft' || p.status === 'in_progress'
  )
  // 완료: completed
  const completedPeriods = periods.filter((p) => p.status === 'completed')

  return (
    <Tabs defaultValue="in_progress" className="w-full">
      <TabsList className="mb-4">
        <TabsTrigger value="in_progress">
          진행 중 ({inProgressPeriods.length})
        </TabsTrigger>
        <TabsTrigger value="completed">
          완료 ({completedPeriods.length})
        </TabsTrigger>
      </TabsList>

      <TabsContent value="in_progress" className="space-y-4">
        {inProgressPeriods.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
            진행 중인 학습일지 주기가 없습니다.
          </div>
        ) : (
          inProgressPeriods.map((period) => (
            <PeriodRowForm key={period.id} period={period} />
          ))
        )}
      </TabsContent>

      <TabsContent value="completed" className="space-y-4">
        {completedPeriods.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
            완료된 학습일지 주기가 없습니다.
          </div>
        ) : (
          completedPeriods.map((period) => (
            <PeriodRowForm key={period.id} period={period} />
          ))
        )}
      </TabsContent>
    </Tabs>
  )
}

