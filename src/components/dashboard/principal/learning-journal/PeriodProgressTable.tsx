import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { LearningJournalPeriodWithClass } from '@/types/learning-journal'
import type { LearningJournalPeriodStats } from '@/lib/learning-journals'

interface PeriodProgressTableProps {
  periods: LearningJournalPeriodWithClass[]
  stats: Map<string, LearningJournalPeriodStats>
}

function formatLabel(period: LearningJournalPeriodWithClass) {
  return period.label?.trim() ? period.label : `${period.startDate} 시작`
}

export function PeriodProgressTable({ periods, stats }: PeriodProgressTableProps) {
  if (periods.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
        생성된 학습일지 주기가 아직 없습니다.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>반</TableHead>
            <TableHead>주기</TableHead>
            <TableHead className="text-right">학생 수</TableHead>
            <TableHead className="text-right">공개 완료</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {periods.map((period) => {
            const stat = stats.get(period.id) ?? {
              periodId: period.id,
              totalEntries: period.studentCount,
              publishedCount: 0,
            }
            return (
              <TableRow key={period.id}>
                <TableCell className="whitespace-nowrap font-medium text-slate-900">
                  {period.className}
                </TableCell>
                <TableCell>{formatLabel(period)}</TableCell>
                <TableCell className="text-right">{period.studentCount}</TableCell>
                <TableCell className="text-right">
                  {stat.publishedCount} / {stat.totalEntries}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
