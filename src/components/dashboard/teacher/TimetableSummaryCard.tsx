import Link from 'next/link'
import { CalendarClock } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { TimetableData } from '@/lib/dashboard-data'

interface TimetableSummaryCardProps {
    data: TimetableData
}

export function TimetableSummaryCard({ data }: TimetableSummaryCardProps) {
    const { timetableName, schedule } = data

    if (!timetableName) {
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
                        <p className="text-sm text-slate-400">등록된 시간표가 없습니다.</p>
                    </CardContent>
                </Card>
            </Link>
        )
    }

    return (
        <Link href="/dashboard/teacher/timetable" className="block transition hover:-translate-y-1">
            <Card className="h-full border-slate-200 shadow-sm hover:shadow-md bg-slate-50/50">
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <CalendarClock className="h-5 w-5 text-slate-500" />
                            <CardTitle className="text-lg text-slate-900">수업 시간표</CardTitle>
                        </div>
                        <span className="text-xs font-medium text-slate-500 bg-white px-2 py-1 rounded-full border border-slate-200">
                            {timetableName}
                        </span>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="space-y-2">
                        {schedule.length > 0 ? (
                            schedule.slice(0, 5).map((item, index) => (
                                <div key={index} className="flex items-center text-sm">
                                    <span className="font-medium text-slate-900 truncate">
                                        {item.className}
                                    </span>
                                    <span className="mx-1 text-slate-300">|</span>
                                    <span className="text-slate-500 shrink-0">{item.periodName}</span>
                                </div>
                            ))
                        ) : (
                            <p className="text-sm text-slate-400">배정된 수업이 없습니다.</p>
                        )}
                        {schedule.length > 5 && (
                            <p className="text-xs text-slate-500 text-center pt-1">
                                외 {schedule.length - 5}개 교시 더보기
                            </p>
                        )}
                    </div>
                </CardContent>
            </Card>
        </Link>
    )
}
