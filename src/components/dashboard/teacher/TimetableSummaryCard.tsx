import Link from 'next/link'
import { CalendarClock } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getAuthContext } from '@/lib/auth'
import { createClient as createServerSupabase } from '@/lib/supabase/server'

type TimetableInfo = {
    id: string
    name: string
    created_at: string
}

type TeacherColumn = {
    id: string
    timetable_id: string
    timetables: TimetableInfo | null // Single object because of foreign key relationship, but Supabase types can be tricky
}

export async function TimetableSummaryCard() {
    const { profile } = await getAuthContext()

    if (!profile) {
        return null
    }

    const supabase = await createServerSupabase()

    // 1. Find the latest timetable for this teacher
    const { data: teacherColumnsData } = await supabase
        .from('timetable_teachers')
        .select('id, timetable_id, timetables(id, name, created_at)')
        .eq('teacher_id', profile.id)

    if (!teacherColumnsData || teacherColumnsData.length === 0) {
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

    // Sort by created_at desc to get the latest
    const sortedColumns = (teacherColumnsData as unknown as TeacherColumn[]).sort((a, b) => {
        const dateA = a.timetables?.created_at ? new Date(a.timetables.created_at).getTime() : 0
        const dateB = b.timetables?.created_at ? new Date(b.timetables.created_at).getTime() : 0
        return dateB - dateA
    })

    const latestColumn = sortedColumns[0]
    const timetableId = latestColumn.timetable_id
    const teacherColumnId = latestColumn.id
    const timetableName = latestColumn.timetables?.name ?? '시간표'

    // 2. Fetch assignments and periods
    const [assignmentsResult, periodsResult] = await Promise.all([
        supabase
            .from('timetable_assignments')
            .select('period_id, class_id, classes(name)')
            .eq('teacher_column_id', teacherColumnId),
        supabase
            .from('timetable_periods')
            .select('id, name, position')
            .eq('timetable_id', timetableId)
            .order('position', { ascending: true }),
    ])

    const assignments = assignmentsResult.data ?? []
    const periods = periodsResult.data ?? []

    // 3. Map assignments to periods
    const schedule = periods.map((period) => {
        const periodAssignments = assignments.filter((a) => a.period_id === period.id)

        if (periodAssignments.length === 0) {
            return {
                periodName: period.name,
                className: null,
            }
        }

        const classNames = periodAssignments
            // @ts-ignore
            .map((a) => a.classes?.name)
            .filter((name): name is string => !!name)
            .sort((a, b) => a.localeCompare(b, 'ko'))
            .join(', ')

        return {
            periodName: period.name,
            className: classNames,
        }
    }).filter(item => item.className !== null) // Only show periods with classes

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
