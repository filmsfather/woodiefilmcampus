import Link from 'next/link'

import { requireAuthForDashboard } from '@/lib/auth'
import { createClient as createServerSupabase } from '@/lib/supabase/server'
import DateUtil from '@/lib/date-util'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

const WORKBOOK_TYPE_LABELS: Record<string, string> = {
  srs: 'SRS 반복',
  pdf: 'PDF 제출',
  writing: '서술형',
  film: '영화 감상',
  lecture: '인터넷 강의',
}

export default async function TeacherDashboardPage() {
  const { profile } = await requireAuthForDashboard('teacher')
  const supabase = createServerSupabase()

  const [{ data: recentWorkbooks }, { data: allWorkbookTypes }, { count: workbookCount }] = await Promise.all([
    supabase
      .from('workbooks')
      .select('id, title, subject, type, week_label, tags, updated_at, created_at, workbook_items(count)')
      .eq('teacher_id', profile?.id ?? '')
      .order('updated_at', { ascending: false })
      .limit(5),
    supabase.from('workbooks').select('type').eq('teacher_id', profile?.id ?? ''),
    supabase.from('workbooks').select('*', { count: 'exact', head: true }).eq('teacher_id', profile?.id ?? ''),
  ])

  const typeStats = (allWorkbookTypes ?? []).reduce<Record<string, number>>((acc, row) => {
    const type = row.type ?? '기타'
    acc[type] = (acc[type] ?? 0) + 1
    return acc
  }, {})

  const latestWorkbooks = recentWorkbooks ?? []
  const formattedNow = DateUtil.nowUTC()

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">선생님 대시보드</h1>
          <p className="text-sm text-slate-600">
            {profile?.name ?? profile?.email} 님, 워크북과 과제 준비 현황을 한눈에 확인하세요.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/dashboard/workbooks/new">문제집 만들기</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard/workbooks">문제집 목록</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard/assignments/new">과제 출제</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="text-sm text-slate-500">총 문제집</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold text-slate-900">{workbookCount ?? 0}개</p>
            <p className="text-xs text-slate-500">
              마지막 업데이트: {DateUtil.formatForDisplay(formattedNow.toISOString(), { hour: '2-digit', minute: '2-digit' })}
            </p>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="text-sm text-slate-500">유형별 분포</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm text-slate-600">
            {Object.entries(typeStats).length === 0 ? (
              <p className="text-slate-400">아직 생성한 문제집이 없습니다.</p>
            ) : (
              Object.entries(typeStats).map(([type, count]) => (
                <div key={type} className="flex items-center justify-between">
                  <span>{WORKBOOK_TYPE_LABELS[type] ?? type}</span>
                  <span className="font-semibold text-slate-900">{count}개</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="text-sm text-slate-500">빠른 안내</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-slate-600">
            <p>새로 만든 워크북은 “내 문제집” 메뉴에서 즉시 확인할 수 있습니다.</p>
            <p>SRS 유형은 반복 학습을 위해 streak 3회 달성 시 완료 처리됩니다.</p>
            <p>PDF·이미지 첨부는 저장 후 상세 화면에서 다운로드 링크로 노출됩니다.</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle>최근 작성한 문제집</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {latestWorkbooks.length === 0 ? (
            <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
              아직 생성한 문제집이 없습니다. 새로운 문제집을 만들어보세요.
            </div>
          ) : (
            latestWorkbooks.map((workbook) => {
              const itemCount = workbook.workbook_items?.[0]?.count ?? 0
              const readableType = WORKBOOK_TYPE_LABELS[workbook.type] ?? workbook.type
              return (
                <div
                  key={workbook.id}
                  className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm md:flex-row md:items-center md:justify-between"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-base font-semibold text-slate-900">{workbook.title}</p>
                      <Badge variant="secondary">{readableType}</Badge>
                      <Badge variant="outline">{workbook.subject}</Badge>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                      <span>문항 {itemCount}개</span>
                      {workbook.week_label && <span>{workbook.week_label}</span>}
                      {(workbook.tags ?? []).map((tag) => (
                        <span key={tag}>#{tag}</span>
                      ))}
                    </div>
                    <p className="text-xs text-slate-400">
                      수정일: {DateUtil.formatForDisplay(workbook.updated_at, { year: 'numeric', month: 'short', day: 'numeric' })}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/dashboard/workbooks/${workbook.id}`}>상세 보기</Link>
                    </Button>
                    <Button asChild size="sm">
                      <Link href={`/dashboard/assignments/new?workbookId=${workbook.id}`}>출제하기</Link>
                    </Button>
                  </div>
                </div>
              )
            })
          )}
        </CardContent>
      </Card>
    </section>
  )
}
