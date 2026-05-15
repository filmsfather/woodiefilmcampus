import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import CalculationTrace from '@/components/dashboard/university-policy/CalculationTrace'
import StudentSelector from '@/components/dashboard/university-policy/StudentSelector'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { requireAuthForDashboard } from '@/lib/auth'
import { evaluateMetricsWithTrace } from '@/lib/university-policy/calculator'
import {
  fetchActiveCutByProgram,
  fetchActiveFormulaByProgram,
  fetchProgram,
  fetchUniversity,
} from '@/lib/university-policy/data'
import { buildVerdicts } from '@/lib/university-policy/verdict'
import {
  fetchActiveSnapshot,
  fetchCoursesForSnapshot,
  fetchLatestSnapshot,
  fetchStudentSnapshotStatuses,
} from '@/lib/university-report/data'

export const metadata: Metadata = {
  title: '산식 검증 | 산식·컷 카탈로그',
}

interface VerifyPageProps {
  params: Promise<{ universityId: string; programId: string }>
  searchParams: Promise<{ studentId?: string }>
}

export default async function VerifyProgramPage({
  params,
  searchParams,
}: VerifyPageProps) {
  const { universityId, programId } = await params
  const { studentId: rawStudentId } = await searchParams
  await requireAuthForDashboard('principal')

  const university = fetchUniversity(universityId)
  const program = fetchProgram(programId)
  if (!university || !program || program.universityId !== universityId) notFound()

  const formula = fetchActiveFormulaByProgram(program.key)
  const cut = fetchActiveCutByProgram(program.key)

  const studentRows = await fetchStudentSnapshotStatuses()
  const eligibleStudents = studentRows.filter((r) => r.snapshotStatus === 'parsed')
  const options = eligibleStudents.map((r) => ({
    id: r.studentId,
    label: r.name ?? r.email,
    hint: r.className ?? undefined,
  }))

  const selectedStudentId = rawStudentId && options.some((o) => o.id === rawStudentId)
    ? rawStudentId
    : null

  let traceBlock: React.ReactNode = null
  if (selectedStudentId && formula) {
    const snapshot =
      (await fetchActiveSnapshot(selectedStudentId)) ??
      (await fetchLatestSnapshot(selectedStudentId))
    if (snapshot && snapshot.status === 'parsed') {
      const courses = await fetchCoursesForSnapshot(snapshot.id)
      const { trace, metrics } = evaluateMetricsWithTrace(courses, formula.spec)
      const verdicts = cut ? buildVerdicts(metrics, cut.points) : []
      const warnings = [
        ...metrics.warnings,
        ...(cut ? [] : ['이 모집단위는 활성 컷이 등록되어 있지 않아 판정을 산출하지 않았습니다.']),
      ]

      traceBlock = (
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-slate-900">
              산식 계산 trace
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <CalculationTrace
              trace={trace}
              cutPoints={cut?.points}
              warnings={warnings}
            />
            {verdicts.length > 0 ? (
              <div className="rounded-md border border-slate-200 bg-white p-3">
                <p className="mb-2 text-sm font-semibold text-slate-900">판정 미리보기</p>
                <ul className="space-y-1 text-xs text-slate-700">
                  {verdicts.map((v) => (
                    <li key={v.metric}>
                      <span className="font-medium">{v.metric}</span> ·{' '}
                      tier=<span className="font-semibold">{v.tier}</span>
                      {v.studentValue != null ? ` · 학생 ${v.studentValue.toFixed(2)}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardContent>
        </Card>
      )
    } else {
      traceBlock = (
        <Card className="border-amber-200 bg-amber-50 shadow-sm">
          <CardContent className="text-sm text-amber-800">
            선택한 학생의 분석 가능한 성적증명서가 없습니다.
          </CardContent>
        </Card>
      )
    }
  }

  return (
    <section className="space-y-6">
      <DashboardBackLink
        fallbackHref={`/dashboard/principal/universities/${universityId}/programs/${programId}`}
        label="모집단위로 돌아가기"
      />

      <header className="space-y-1">
        <p className="text-xs text-slate-500">{university.name} · 산식 검증</p>
        <h1 className="text-2xl font-semibold text-slate-900">
          {program.year}학년도 · {program.admissionTrack} · {program.name}
        </h1>
        <p className="text-xs text-slate-500">
          학생 1명을 골라 이 모집단위 산식이 학생 데이터에 어떻게 적용되는지 단계별로 확인합니다.
          (DB에 저장하지 않습니다.)
        </p>
      </header>

      {!formula ? (
        <Card className="border-amber-200 bg-amber-50 shadow-sm">
          <CardContent className="text-sm text-amber-800">
            이 모집단위에는 활성 산식이 없습니다. 먼저{' '}
            <code>presets/formulas.ts</code>에 항목을 추가해주세요.
          </CardContent>
        </Card>
      ) : null}

      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base font-semibold text-slate-900">학생 선택</CardTitle>
          <StudentSelector options={options} selectedId={selectedStudentId} />
        </CardHeader>
        <CardContent>
          {options.length === 0 ? (
            <p className="text-sm text-slate-500">
              분석 완료(성적증명서 업로드 + 파싱) 상태인 학생이 없습니다. 먼저 학생 페이지에서 업로드를 완료해주세요.
            </p>
          ) : !selectedStudentId ? (
            <p className="text-sm text-slate-500">
              위 선택 박스에서 학생을 골라주세요.
            </p>
          ) : (
            <p className="text-xs text-slate-500">
              총 {eligibleStudents.length}명 중 1명 선택됨.
            </p>
          )}
        </CardContent>
      </Card>

      {traceBlock}
    </section>
  )
}
