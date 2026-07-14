import Link from 'next/link'
import { CalendarClock } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { TimetableData } from '@/lib/dashboard-data'
import { DAY_OF_WEEK_LABELS, formatTimeLabel } from '@/types/timetable'

interface TimetableSummaryCardProps {
    data: TimetableData
}

export function TimetableSummaryCard({ data }: TimetableSummaryCardProps) {
    const { schedule } = data

    return (
        <Link href="/dashboard/teacher/timetable" className="block transition hover:-translate-y-1">
            <Card className="h-full border-slate-200 shadow-sm hover:shadow-md bg-slate-50/50">
                <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                        <CalendarClock className="h-5 w-5 text-slate-500" />
                        <CardTitle className="text-lg text-slate-900">수업 시간표</CardTitle>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="space-y-2">
                        {schedule.length > 0 ? (
                            schedule.slice(0, 5).map((item, index) => (
                                <div key={index} className="flex items-center text-sm">
                                    <span className="text-slate-500 shrink-0">
                                        {DAY_OF_WEEK_LABELS[item.dayOfWeek]} {item.period}교시 {formatTimeLabel(item.startTime)}
                                    </span>
                                    <span className="mx-1 text-slate-300">|</span>
                                    <span className="font-medium text-slate-900 truncate">
                                        {item.className}
                                    </span>
                                </div>
                            ))
                        ) : (
                            <p className="text-sm text-slate-400">배정된 수업이 없습니다.</p>
                        )}
                        {schedule.length > 5 && (
                            <p className="text-xs text-slate-500 text-center pt-1">
                                외 {schedule.length - 5}개 수업 더보기
                            </p>
                        )}
                    </div>
                </CardContent>
            </Card>
        </Link>
    )
}
