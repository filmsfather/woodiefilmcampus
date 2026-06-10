import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import EstimatedBadge from '@/components/dashboard/university-policy/EstimatedBadge'
import { Badge } from '@/components/ui/badge'
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
  title: '모집단위 상세 | 입시 자료 아카이브',
}

interface ProgramDetailPageProps {
  params: Promise<{ universityId: string; programId: string }>
}

export default async function ProgramDetailPage({ params }: ProgramDetailPageProps) {
  const { universityId, programId } = await params
  await requireAuthForDashboard(['teacher', 'manager'])

  const university = fetchUniversity(universityId)
  const program = fetchProgram(programId)
  if (!university || !program) notFound()
  if (program.universityId !== universityId) notFound()

  const formula = fetchActiveFormulaByProgram(program.key)
  const cut = fetchActiveCutByProgram(program.key)

  return (
    <section className="space-y-6">
      <DashboardBackLink
        fallbackHref={`/dashboard/teacher/admission-materials/universities/${universityId}`}
        label="모집단위 목록으로 돌아가기"
      />

      <header className="space-y-1">
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
        {program.details?.coreTrack ? (
          <p className="text-sm text-slate-700">
            <span className="font-medium">수시 핵심 전형:</span> {program.details.coreTrack}
          </p>
        ) : null}
      </header>

      {program.details ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {program.details.recruitSummary ? (
            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base font-semibold text-slate-900">모집 정원</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-line text-sm text-slate-700">
                  {program.details.recruitSummary}
                </p>
              </CardContent>
            </Card>
          ) : null}

          {program.details.schedule && program.details.schedule.length > 0 ? (
            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base font-semibold text-slate-900">모집 일정</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-sm text-slate-700">
                  {program.details.schedule.map((item) => (
                    <div key={item.label} className="contents">
                      <dt className="text-slate-500">{item.label}</dt>
                      <dd className="font-medium">{item.value}</dd>
                    </div>
                  ))}
                </dl>
              </CardContent>
            </Card>
          ) : null}

          {program.details.evaluationMethod ? (
            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base font-semibold text-slate-900">전형 방법</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-line text-sm text-slate-700">
                  {program.details.evaluationMethod}
                </p>
              </CardContent>
            </Card>
          ) : null}

          {program.details.practicalTest ? (
            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base font-semibold text-slate-900">실기 내용</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-line text-sm text-slate-700">
                  {program.details.practicalTest}
                </p>
              </CardContent>
            </Card>
          ) : null}

          {program.details.gradeCalculation ? (
            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base font-semibold text-slate-900">
                  내신 산출 방법
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-line text-sm text-slate-700">
                  {program.details.gradeCalculation}
                </p>
              </CardContent>
            </Card>
          ) : null}

          {program.details.gradeFormula ? (
            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base font-semibold text-slate-900">산출 수식</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-slate-50 p-3 text-xs text-slate-700">
                  {program.details.gradeFormula}
                </pre>
              </CardContent>
            </Card>
          ) : null}

          {program.details.other ? (
            <Card className="border-slate-200 shadow-sm lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base font-semibold text-slate-900">기타</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-line text-sm text-slate-700">
                  {program.details.other}
                </p>
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : null}

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
              <p className="text-sm text-slate-500">활성 산식이 없습니다.</p>
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
                {cut.sourceUrl ? (
                  <p className="text-xs text-slate-400">
                    출처:{' '}
                    <a
                      href={cut.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="underline hover:text-slate-600"
                    >
                      {cut.sourceUrl}
                    </a>
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
                {cut.notes ? (
                  <p className="whitespace-pre-line border-t border-slate-100 pt-2 text-xs text-slate-500">
                    {cut.notes}
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-slate-500">활성 컷이 없습니다.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  )
}
