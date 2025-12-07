import Link from 'next/link'
import { CalendarDays } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { createClient as createServerSupabase } from '@/lib/supabase/server'
import DateUtil from '@/lib/date-util'

export async function AnnualScheduleSummaryCard() {
    const supabase = createServerSupabase()

    DateUtil.initServerClock()
    const today = DateUtil.nowUTC().toISOString().split('T')[0]

    const { data: schedules } = await supabase
        .from('learning_journal_annual_schedules')
        .select('*')
        .lte('start_date', today)
        .gte('end_date', today)
        .order('start_date', { ascending: true })

    const activeSchedules = schedules || []

    const regularSchedule = activeSchedules.find(s => s.category === 'annual')
    const specialSchedule = activeSchedules.find(s => s.category === 'film_production')

    return (
        <Link href="/dashboard/learning-journal/annual-schedule" className="block transition hover:-translate-y-1">
            <Card className="border-slate-200 shadow-sm hover:shadow-md bg-slate-50/50">
                <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                        <CalendarDays className="h-5 w-5 text-slate-500" />
                        <CardTitle className="text-lg text-slate-900">오늘의 학사 일정</CardTitle>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-1">
                            <p className="text-xs font-medium text-slate-500">정규과정</p>
                            {regularSchedule ? (
                                <div>
                                    <p className="font-medium text-slate-900">{regularSchedule.period_label}</p>
                                    <p className="text-xs text-slate-500">
                                        {DateUtil.formatForDisplay(regularSchedule.start_date, { month: 'numeric', day: 'numeric' })} ~ {DateUtil.formatForDisplay(regularSchedule.end_date, { month: 'numeric', day: 'numeric' })}
                                    </p>
                                    {regularSchedule.memo && (
                                        <p className="mt-1 text-xs text-slate-600 line-clamp-1">{regularSchedule.memo}</p>
                                    )}
                                </div>
                            ) : (
                                <p className="text-sm text-slate-400">진행 중인 정규 일정이 없습니다.</p>
                            )}
                        </div>

                        <div className="space-y-1">
                            <p className="text-xs font-medium text-slate-500">특강과정</p>
                            {specialSchedule ? (
                                <div>
                                    <p className="font-medium text-slate-900">{specialSchedule.period_label}</p>
                                    <p className="text-xs text-slate-500">
                                        {DateUtil.formatForDisplay(specialSchedule.start_date, { month: 'numeric', day: 'numeric' })} ~ {DateUtil.formatForDisplay(specialSchedule.end_date, { month: 'numeric', day: 'numeric' })}
                                    </p>
                                    {specialSchedule.memo && (
                                        <p className="mt-1 text-xs text-slate-600 line-clamp-1">{specialSchedule.memo}</p>
                                    )}
                                </div>
                            ) : (
                                <p className="text-sm text-slate-400">진행 중인 특강 일정이 없습니다.</p>
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>
        </Link>
    )
}
