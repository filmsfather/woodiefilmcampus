import Link from 'next/link'
import { FileText } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ClassAssignmentExpandable } from '@/components/dashboard/teacher/ClassAssignmentList'

export interface ClassAssignmentListItem {
  id: string
  title: string
  subject: string | null
  type: string | null
  dueAt: string | null
  dueAtLabel: string | null
  publishedAtLabel: string | null
}

export interface ClassOverviewItem {
  id: string
  name: string
  incompleteStudents: number
  overdueAssignments: number
  pendingPrintRequests: number
  upcomingAssignments: number
  latestAssignment: ClassAssignmentListItem | null
  recentAssignments: ClassAssignmentListItem[]
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
  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">과제 검사</h1>
        <p className="text-sm text-slate-600">담당 반 현황을 확인하고 우선순위가 높은 반부터 점검하세요.</p>
      </header>

      {items.length === 0 ? (
        <Card className="border-dashed border-slate-200">
          <CardContent className="py-16 text-center text-sm text-slate-500">
            담당 반이 없습니다. 관리자에게 권한을 요청하세요.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
              <Card key={item.id} className="flex flex-col border-slate-200">
                <CardHeader>
                  <CardTitle className="text-lg text-slate-900">{item.name}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-0 px-0 text-sm text-slate-600">
                  {item.latestAssignment ? (
                    <Link
                      href={`/dashboard/teacher/review/${item.id}?assignment=${item.latestAssignment.id}`}
                      className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-slate-50 sm:px-6"
                    >
                      <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-700">
                          {item.latestAssignment.title}
                        </p>
                        {item.latestAssignment.subject && (
                          <p className="truncate text-xs text-slate-500">
                            {item.latestAssignment.subject}
                          </p>
                        )}
                      </div>
                      <div className="shrink-0 text-right text-xs text-slate-500">
                        <p>출제 {item.latestAssignment.publishedAtLabel ?? '-'}</p>
                        <p>마감 {item.latestAssignment.dueAtLabel ?? '없음'}</p>
                      </div>
                    </Link>
                  ) : (
                    <div className="px-4 py-2.5 text-xs text-slate-400 sm:px-6">
                      등록된 과제가 없습니다.
                    </div>
                  )}

                  <ClassAssignmentExpandable
                    classId={item.id}
                    recentAssignments={item.recentAssignments}
                  />
                </CardContent>
              </Card>
          ))}
        </div>
      )}
    </section>
  )
}
