import Link from 'next/link'
import { Clock } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { WorkJournalData } from '@/lib/dashboard-data'

interface WorkJournalSummaryCardProps {
    data: WorkJournalData
}

export function WorkJournalSummaryCard({ data }: WorkJournalSummaryCardProps) {
    const { totalHours, monthLabel } = data

    return (
        <Link href="/dashboard/teacher/work-journal" className="block transition hover:-translate-y-1">
            <Card className="h-full border-slate-200 shadow-sm hover:shadow-md bg-slate-50/50">
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Clock className="h-5 w-5 text-slate-500" />
                            <CardTitle className="text-lg text-slate-900">근무일지</CardTitle>
                        </div>
                        <span className="text-xs font-medium text-slate-500 bg-white px-2 py-1 rounded-full border border-slate-200">
                            {monthLabel}
                        </span>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-col items-center justify-center py-2">
                        <p className="text-sm text-slate-500">이번 달 총 근무시간</p>
                        <p className="text-3xl font-bold text-slate-900 mt-1">
                            {totalHours}
                            <span className="text-base font-normal text-slate-500 ml-1">시간</span>
                        </p>
                    </div>
                </CardContent>
            </Card>
        </Link>
    )
}
