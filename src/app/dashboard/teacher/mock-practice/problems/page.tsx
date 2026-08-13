import type { Metadata } from 'next'
import Link from 'next/link'
import { Plus } from 'lucide-react'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { PracticeProblemActions } from '@/components/dashboard/practice/PracticeProblemActions'
import { PracticeProblemPreviewDialog } from '@/components/dashboard/practice/PracticeProblemPreviewDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { requireAuthForDashboard } from '@/lib/auth'
import { fetchPracticeProblemSummaries, fetchPracticeUniversityOptions } from '@/lib/practice/problems'
import { PRACTICE_TYPE_LABELS, type PracticeType } from '@/types/practice'

export const metadata: Metadata = {
  title: '모의실기 문제 은행 | Woodie Film Campus',
  description: '대학별 모의실기 연습문제를 관리하세요.',
}

const BASE_PATH = '/dashboard/teacher/mock-practice/problems'

export default async function PracticeProblemsPage({
  searchParams,
}: {
  searchParams: Promise<{ university?: string; type?: string }>
}) {
  await requireAuthForDashboard(['teacher', 'manager'])

  const params = await searchParams
  const universityFilter = params.university ?? null
  const typeFilter =
    params.type === 'writing' || params.type === 'interview' ? (params.type as PracticeType) : null

  const [problems, universities] = await Promise.all([
    fetchPracticeProblemSummaries({
      universityId: universityFilter,
      practiceType: typeFilter,
      includeInactive: true,
    }),
    fetchPracticeUniversityOptions(),
  ])

  const grouped = new Map<string, typeof problems>()
  for (const problem of problems) {
    const key = `${problem.universityName}|${problem.practiceType}`
    const list = grouped.get(key) ?? []
    list.push(problem)
    grouped.set(key, list)
  }

  const buildHref = (next: { university?: string | null; type?: string | null }) => {
    const search = new URLSearchParams()
    const university = next.university === undefined ? universityFilter : next.university
    const type = next.type === undefined ? typeFilter : next.type
    if (university) search.set('university', university)
    if (type) search.set('type', type)
    const query = search.toString()
    return query ? `${BASE_PATH}?${query}` : BASE_PATH
  }

  return (
    <section className="space-y-6">
      <div className="space-y-3">
        <DashboardBackLink fallbackHref="/dashboard/teacher/mock-practice" label="모의실기로 돌아가기" />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold text-slate-900">모의실기 문제 은행</h1>
            <p className="text-sm text-slate-600">
              대학별로 연습문제를 쌓아두면 1:1 피드백 예약 시 학생마다 아직 안 푼 문제가 순서대로 자동 배정됩니다.
            </p>
          </div>
          <Button asChild>
            <Link href={`${BASE_PATH}/new`}>
              <Plus className="mr-1 h-4 w-4" /> 문제 추가
            </Link>
          </Button>
        </div>
      </div>

      <Card className="border-slate-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm text-slate-900">필터</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-slate-500">유형</span>
            <Button asChild size="sm" variant={typeFilter === null ? 'default' : 'outline'}>
              <Link href={buildHref({ type: null })}>전체</Link>
            </Button>
            <Button asChild size="sm" variant={typeFilter === 'writing' ? 'default' : 'outline'}>
              <Link href={buildHref({ type: 'writing' })}>작법형</Link>
            </Button>
            <Button asChild size="sm" variant={typeFilter === 'interview' ? 'default' : 'outline'}>
              <Link href={buildHref({ type: 'interview' })}>면접형</Link>
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-slate-500">대학</span>
            <Button asChild size="sm" variant={universityFilter === null ? 'default' : 'outline'}>
              <Link href={buildHref({ university: null })}>전체</Link>
            </Button>
            {universities.map((university) => (
              <Button
                key={university.id}
                asChild
                size="sm"
                variant={universityFilter === university.id ? 'default' : 'outline'}
              >
                <Link href={buildHref({ university: university.id })}>
                  {university.name}
                  <span className="ml-1 text-xs opacity-70">
                    {university.writingProblemCount + university.interviewProblemCount}
                  </span>
                </Link>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {problems.length === 0 ? (
        <Card className="border-dashed border-slate-300">
          <CardContent className="py-12 text-center text-sm text-slate-500">
            등록된 문제가 없습니다. 우측 상단의 &ldquo;문제 추가&rdquo;로 첫 문제를 만들어보세요.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {Array.from(grouped.entries()).map(([key, list]) => {
            const [universityName, practiceType] = key.split('|')
            return (
              <Card key={key} className="border-slate-200">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base text-slate-900">
                    {universityName}
                    <Badge variant={practiceType === 'writing' ? 'secondary' : 'outline'}>
                      {PRACTICE_TYPE_LABELS[practiceType as PracticeType]}
                    </Badge>
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    문제 {list.length}개 · 활성 {list.filter((problem) => problem.isActive).length}개
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {list.map((problem) => (
                    <div
                      key={problem.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 bg-white p-3"
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-mono text-slate-400">#{problem.orderIndex}</span>
                          <span className="font-medium text-slate-900">{problem.title}</span>
                          {!problem.isActive && (
                            <Badge variant="outline" className="text-amber-600">
                              비활성
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-slate-500">
                          제한시간 {problem.timeLimitMinutes}분 · 문항 {problem.itemCount}개 · 채점 항목{' '}
                          {problem.rubricCount}개 · 배정 {problem.usageCount}회
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <PracticeProblemPreviewDialog problemId={problem.id} />
                        <Button asChild variant="outline" size="sm">
                          <Link href={`${BASE_PATH}/${problem.id}/edit`}>수정</Link>
                        </Button>
                        <PracticeProblemActions
                          problemId={problem.id}
                          isActive={problem.isActive}
                          usageCount={problem.usageCount}
                        />
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </section>
  )
}
