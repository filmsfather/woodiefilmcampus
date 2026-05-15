import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import EstimatedBadge from '@/components/dashboard/university-policy/EstimatedBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { requireAuthForDashboard } from '@/lib/auth'
import {
  fetchActiveCutByProgram,
  fetchActiveFormulaByProgram,
  fetchProgram,
  fetchUniversity,
  metricLabel,
} from '@/lib/university-policy/data'
import { CUT_SOURCE_LABELS } from '@/lib/university-policy/types'

export const metadata: Metadata = {
  title: '모집단위 상세 | 산식·컷 카탈로그',
}

interface ProgramDetailPageProps {
  params: Promise<{ universityId: string; programId: string }>
}

export default async function ProgramDetailPage({ params }: ProgramDetailPageProps) {
  const { universityId, programId } = await params
  await requireAuthForDashboard('principal')

  const university = fetchUniversity(universityId)
  const program = fetchProgram(programId)
  if (!university || !program) notFound()
  if (program.universityId !== universityId) notFound()

  const formula = fetchActiveFormulaByProgram(program.key)
  const cut = fetchActiveCutByProgram(program.key)

  return (
    <section className="space-y-6">
      <DashboardBackLink
        fallbackHref={`/dashboard/principal/universities/${universityId}`}
        label="모집단위 목록으로 돌아가기"
      />

      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs text-slate-500">{university.name}</p>
          <h1 className="text-2xl font-semibold text-slate-900">
            {program.year}학년도 · {program.admissionTrack}
          </h1>
          <p className="text-base text-slate-700">{program.name}</p>
          <p className="text-xs text-slate-500">
            {program.recruitCount != null ? `모집 ${program.recruitCount}명 · ` : ''}
            {program.totalScore != null ? `학생부 ${program.totalScore}점 · ` : ''}
            <code className="rounded bg-slate-100 px-1 py-0.5 text-[10px]">{program.key}</code>
          </p>
        </div>
        <Button asChild size="sm" disabled={!formula}>
          <Link
            href={`/dashboard/principal/universities/${universityId}/programs/${programId}/verify`}
          >
            산식 검증
          </Link>
        </Button>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-slate-900">반영 산식</CardTitle>
          </CardHeader>
          <CardContent>
            {formula ? (
              <div className="space-y-2 text-sm text-slate-700">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={formula.isDraft ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-700'}>
                    v{formula.version}
                    {formula.isDraft ? ' (검증 필요)' : ''}
                  </Badge>
                  {formula.templateKey ? (
                    <Badge variant="outline">{formula.templateKey}</Badge>
                  ) : null}
                </div>
                <p>
                  반영교과: {formula.spec.reflectedSubjects.join(', ')} ·{' '}
                  과목구분: {formula.spec.reflectedCourseTypes.join(', ')}
                </p>
                <p>
                  가중치: 공통/일반선택 {formula.spec.weights.common} · 진로선택{' '}
                  {formula.spec.weights.career} · 학생부 총점 {formula.spec.totalScore}
                </p>
                <p className="text-xs text-slate-500">
                  산출 지표: {formula.spec.outputs.map(metricLabel).join(', ')}
                </p>
                {formula.sourceNote ? (
                  <p className="text-xs text-slate-400">출처 메모: {formula.sourceNote}</p>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-slate-500">
                활성 산식이 없습니다.{' '}
                <code className="rounded bg-slate-100 px-1 text-xs">presets/formulas.ts</code>의{' '}
                <code className="rounded bg-slate-100 px-1 text-xs">FORMULA_PRESETS[&quot;{program.key}&quot;]</code>{' '}
                항목을 추가해주세요.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-slate-900">입시 결과 컷</CardTitle>
          </CardHeader>
          <CardContent>
            {cut ? (
              <div className="space-y-2 text-sm text-slate-700">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="bg-emerald-100 text-emerald-700">v{cut.version}</Badge>
                  <Badge variant="outline">{CUT_SOURCE_LABELS[cut.sourceType]}</Badge>
                  <Badge variant="outline">{cut.sourceYear}학년도</Badge>
                  {cut.points.some((p) => p.isEstimated || p.confidence === 'low') ? (
                    <EstimatedBadge>일부 추정</EstimatedBadge>
                  ) : null}
                </div>
                <p className="text-xs text-slate-500">
                  컷 점 {cut.points.length}개 등록됨 (
                  {Array.from(new Set(cut.points.map((p) => p.metric))).map(metricLabel).join(', ')}
                  )
                </p>
                {cut.competitionRate != null ? (
                  <p className="text-xs text-slate-500">
                    경쟁률 {cut.competitionRate}
                    {cut.fillRate != null ? ` · 충원율 ${cut.fillRate}%` : ''}
                  </p>
                ) : null}
                <ul className="space-y-1 text-xs text-slate-600">
                  {cut.points.map((p, idx) => (
                    <li key={`${p.metric}-${p.label}-${idx}`} className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{metricLabel(p.metric)}</Badge>
                      <span className="text-slate-500">{p.label}</span>
                      <span className="font-medium text-slate-800">{p.value}</span>
                      {p.isEstimated ? <EstimatedBadge>추정</EstimatedBadge> : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-sm text-slate-500">
                활성 컷이 없습니다.{' '}
                <code className="rounded bg-slate-100 px-1 text-xs">presets/cuts.ts</code>의{' '}
                <code className="rounded bg-slate-100 px-1 text-xs">CUT_PRESETS[&quot;{program.key}&quot;]</code>{' '}
                항목을 추가해주세요.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  )
}
