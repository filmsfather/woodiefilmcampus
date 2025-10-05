import Link from 'next/link'
import { AlarmClock, AlertTriangle, ArrowRight, CalendarClock, Printer } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'

export interface ClassOverviewItem {
  id: string
  name: string
  incompleteStudents: number
  overdueAssignments: number
  pendingPrintRequests: number
  upcomingAssignments: number
  nextDueAtLabel: string | null
}

export interface ClassOverviewSummary {
  totalIncompleteStudents: number
  totalOverdueAssignments: number
  totalPendingPrintRequests: number
  totalUpcomingAssignments: number
}

export function ClassOverviewGrid({
  summary,
  items,
}: {
  summary: ClassOverviewSummary
  items: ClassOverviewItem[]
}) {
  const hasAttention =
    summary.totalOverdueAssignments > 0 || summary.totalPendingPrintRequests > 0 || summary.totalIncompleteStudents > 0

  return (
    <section className="space-y-6">
      <header className="space-y-3">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">반 개요</h1>
            <p className="text-sm text-slate-600">담당 반 현황을 확인하고 우선순위가 높은 반부터 점검하세요.</p>
          </div>
          {hasAttention && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              <span className="inline-flex items-center gap-1 font-medium">
                <AlertTriangle className="h-3 w-3" /> 오늘 해야 할 일
              </span>
              <div className="mt-1 flex flex-wrap gap-3">
                <span>미평가 {summary.totalIncompleteStudents}명</span>
                <span>지연 과제 {summary.totalOverdueAssignments}건</span>
                <span>인쇄 대기 {summary.totalPendingPrintRequests}건</span>
                {summary.totalUpcomingAssignments > 0 && <span>마감 임박 {summary.totalUpcomingAssignments}건</span>}
              </div>
            </div>
          )}
        </div>
      </header>

      {items.length === 0 ? (
        <Card className="border-dashed border-slate-200">
          <CardContent className="py-16 text-center text-sm text-slate-500">
            담당 반이 없습니다. 관리자에게 권한을 요청하세요.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => {
            const hasOverdue = item.overdueAssignments > 0
            const hasPrintPending = item.pendingPrintRequests > 0
            const hasIncompleteStudents = item.incompleteStudents > 0
            const hasUpcoming = item.upcomingAssignments > 0

            return (
              <Card key={item.id} className="flex flex-col border-slate-200">
                <CardHeader className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-lg text-slate-900">{item.name}</CardTitle>
                      <p className="text-xs text-slate-500">
                        미평가 {item.incompleteStudents}명 · 지연 {item.overdueAssignments}건 · 인쇄 대기 {item.pendingPrintRequests}건
                      </p>
                    </div>
                    <Badge variant={hasOverdue || hasPrintPending || hasIncompleteStudents ? 'destructive' : 'secondary'}>
                      {hasOverdue || hasPrintPending || hasIncompleteStudents ? '점검 필요' : '양호'}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs text-slate-600">
                    {hasOverdue && (
                      <Badge variant="destructive" className="inline-flex items-center gap-1">
                        <AlarmClock className="h-3 w-3" /> 지연 {item.overdueAssignments}
                      </Badge>
                    )}
                    {hasIncompleteStudents && (
                      <Badge variant="outline" className="inline-flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" /> 미평가 {item.incompleteStudents}
                      </Badge>
                    )}
                    {hasPrintPending && (
                      <Badge variant="secondary" className="inline-flex items-center gap-1">
                        <Printer className="h-3 w-3" /> 인쇄 {item.pendingPrintRequests}
                      </Badge>
                    )}
                    {hasUpcoming && (
                      <Badge variant="outline" className="inline-flex items-center gap-1">
                        <CalendarClock className="h-3 w-3" /> 임박 {item.upcomingAssignments}
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="text-sm text-slate-600">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-500">다음 마감</span>
                      <span>{item.nextDueAtLabel ?? '마감 일정 없음'}</span>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="mt-auto flex flex-wrap gap-2">
                  <Button asChild size="sm" className="flex-1">
                    <Link href={`/dashboard/teacher/review/${item.id}`}>
                      과제 관리 <ArrowRight className="ml-1 h-4 w-4" />
                    </Link>
                  </Button>
                  <Button asChild size="sm" variant="outline" className="flex-1">
                    <Link href={`/dashboard/teacher/review/${item.id}#print-requests`}>인쇄 현황</Link>
                  </Button>
                </CardFooter>
              </Card>
            )
          })}
        </div>
      )}
    </section>
  )
}
