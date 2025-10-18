import type { LearningJournalAnnualSchedule } from '@/types/learning-journal'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import {
  formatAnnualScheduleDateRange,
  formatAnnualScheduleTuitionLabel,
} from '@/lib/learning-journal-annual-schedule'

interface AnnualScheduleTableProps {
  schedules: LearningJournalAnnualSchedule[]
  showTuition?: boolean
  className?: string
  emptyMessage?: string
}

export function AnnualScheduleTable({
  schedules,
  showTuition = false,
  className,
  emptyMessage = '등록된 연간 일정이 없습니다.',
}: AnnualScheduleTableProps) {
  const hasSchedules = schedules.length > 0

  return (
    <div className={cn('space-y-3', className)}>
      {hasSchedules ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>기간명</TableHead>
              <TableHead>기간(날짜)</TableHead>
              <TableHead>비고</TableHead>
              {showTuition ? <TableHead>수업료</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {schedules.map((schedule) => (
              <TableRow key={schedule.id}>
                <TableCell className="text-slate-900">{schedule.periodLabel}</TableCell>
                <TableCell className="text-slate-600">
                  {formatAnnualScheduleDateRange(schedule.startDate, schedule.endDate)}
                </TableCell>
                <TableCell className="max-w-sm whitespace-pre-line text-slate-500">
                  {schedule.memo ? schedule.memo : '-'}
                </TableCell>
                {showTuition ? (
                  <TableCell className="text-slate-600">
                    {formatAnnualScheduleTuitionLabel(schedule.tuitionDueDate, schedule.tuitionAmount)}
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <p className="text-sm text-slate-500">{emptyMessage}</p>
      )}
    </div>
  )
}
