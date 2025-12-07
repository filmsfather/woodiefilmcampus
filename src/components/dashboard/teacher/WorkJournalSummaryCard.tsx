import Link from 'next/link'
import { Clock } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getAuthContext } from '@/lib/auth'
import { createClient as createServerSupabase } from '@/lib/supabase/server'
import { resolveMonthRange } from '@/lib/work-logs'
import DateUtil from '@/lib/date-util'

export async function WorkJournalSummaryCard() {
    const { profile } = await getAuthContext()

    if (!profile) {
        return null
    }

    DateUtil.initServerClock()
    const monthRange = resolveMonthRange(null) // Defaults to current month
    const supabase = createServerSupabase()

    const { data: entries } = await supabase
        .from('work_log_entries')
        .select('work_hours')
        .eq('teacher_id', profile.id)
        .gte('work_date', monthRange.startDate)
        .lt('work_date', monthRange.endExclusiveDate)

    const totalHours = (entries ?? []).reduce((sum, entry) => sum + (entry.work_hours ?? 0), 0)

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
                            {monthRange.label}
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
