import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { requireAuthForDashboard } from '@/lib/auth'
import {
  fetchStudentWorkflowStatuses,
  type StudentWorkflowRow,
} from '@/lib/university-report/workflow'
import WorkflowTable from '@/app/dashboard/principal/university-reports/workflow/WorkflowTable'

const FILTERS = [
  { key: 'all', label: '전체' },
  { key: 's1', label: '성적표 미제출' },
  { key: 's2', label: '분석 미완료' },
  { key: 's3', label: '컨설팅 미제출' },
  { key: 's4', label: '추천 미완료' },
  { key: 's5', label: '새 의견 있음' },
  { key: 's6', label: '미확정' },
] as const

type FilterKey = (typeof FILTERS)[number]['key']

// 각 단계 필터는 "직전 단계까지는 완료했지만 해당 단계는 아직 미완료"인 학생만 보여준다.
// (예: 분석 미완료 = 성적표 제출은 했지만 분석은 안 된 학생)
function matchesFilter(row: StudentWorkflowRow, filter: FilterKey): boolean {
  switch (filter) {
    case 's1':
      return !row.stage1Submitted
    case 's2':
      return row.stage1Submitted && !row.stage2Analyzed
    case 's3':
      return row.stage2Analyzed && !row.stage3ConsultSubmitted
    case 's4':
      return row.stage3ConsultSubmitted && !row.stage4Recommended
    case 's5':
      return row.stage5NewOpinion
    case 's6':
      return row.stage4Recommended && !row.stage6Confirmed
    case 'all':
    default:
      return true
  }
}

function buildQuery(filter: FilterKey): string {
  if (filter === 'all') return '?'
  const params = new URLSearchParams()
  params.set('filter', filter)
  return `?${params.toString()}`
}

interface WorkflowPageProps {
  searchParams: Promise<{ filter?: string }>
}

export default async function UniversityReportWorkflowPage({ searchParams }: WorkflowPageProps) {
  await requireAuthForDashboard('principal')

  const { filter: filterParam } = await searchParams
  const activeFilter: FilterKey = FILTERS.some((f) => f.key === filterParam)
    ? (filterParam as FilterKey)
    : 'all'

  const allRows = await fetchStudentWorkflowStatuses()
  const rows = allRows.filter((row) => matchesFilter(row, activeFilter))

  const summary = allRows.reduce(
    (acc, row) => {
      acc.total += 1
      if (row.stage2Analyzed) acc.analyzed += 1
      if (row.stage3ConsultSubmitted) acc.consult += 1
      if (row.stage4Recommended) acc.recommended += 1
      if (row.stage6Confirmed) acc.confirmed += 1
      if (row.stage5NewOpinion) acc.newOpinion += 1
      return acc
    },
    { total: 0, analyzed: 0, consult: 0, recommended: 0, confirmed: 0, newOpinion: 0 }
  )

  const emptyMessage =
    activeFilter === 'all'
      ? '승인된 학생이 아직 없습니다.'
      : '해당 조건에 맞는 학생이 없습니다.'

  const smsEnvStatus = [
    { label: 'SOLAPI_API_KEY', ok: Boolean(process.env.SOLAPI_API_KEY) },
    { label: 'SOLAPI_API_SECRET', ok: Boolean(process.env.SOLAPI_API_SECRET) },
    { label: 'SOLAPI_SENDER_NUMBER', ok: Boolean(process.env.SOLAPI_SENDER_NUMBER) },
    { label: 'NEXT_PUBLIC_SITE_URL', ok: Boolean(process.env.NEXT_PUBLIC_SITE_URL) },
  ] as const

  const isSmsReady = smsEnvStatus.every((item) => item.ok)

  return (
    <section className="space-y-6">
      <DashboardBackLink fallbackHref="/dashboard/principal" label="원장 대시보드로 돌아가기" />

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-slate-900">지원가능대학 레포트 단계별 관리</h1>
          <p className="text-sm text-slate-600">
            학생별 진행 단계를 한눈에 확인하고 단계별로 필터링할 수 있습니다. 학생을 선택해 일괄로
            분석·발행할 수도 있습니다.
          </p>
        </div>
        <Link
          href="/dashboard/principal/university-reports"
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          레포트 관리(목록)
          <ChevronRight className="size-4" />
        </Link>
      </header>

      <Card className={isSmsReady ? 'border-emerald-200' : 'border-amber-300'}>
        <CardHeader>
          <CardTitle className="text-lg text-slate-900">학생·학부모 문자 발송 환경</CardTitle>
          <CardDescription>
            분석 실행·발행 시 컨설팅 리포트 공유 링크 문자 발송에 필요한 환경 변수의 설정 상태입니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex flex-wrap gap-2">
            {smsEnvStatus.map((item) => (
              <span
                key={item.label}
                className={`rounded-full px-3 py-1 text-xs font-medium ${item.ok ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}
              >
                {item.label}: {item.ok ? 'OK' : '설정 필요'}
              </span>
            ))}
          </div>
          <p className="text-xs text-slate-500">
            {isSmsReady
              ? '모든 값이 정상적으로 감지되었습니다. 분석 실행·발행 시 학생·학부모에게 공유 링크 문자가 발송됩니다.'
              : '하나 이상의 값이 비어 있습니다. 환경 변수를 다시 설정한 뒤 재배포해야 문자 발송이 동작합니다.'}
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <SummaryStat label="총 학생" value={summary.total} />
        <SummaryStat label="분석 완료" value={summary.analyzed} tone="emerald" />
        <SummaryStat label="컨설팅 제출" value={summary.consult} tone="emerald" />
        <SummaryStat label="원장 추천" value={summary.recommended} tone="emerald" />
        <SummaryStat label="대학 확정" value={summary.confirmed} tone="emerald" />
        <SummaryStat label="새 의견" value={summary.newOpinion} tone="amber" />
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const isActive = f.key === activeFilter
          return (
            <Link
              key={f.key}
              href={buildQuery(f.key)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                isActive
                  ? 'border-sky-500 bg-sky-50 text-sky-700'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {f.label}
            </Link>
          )
        })}
      </div>

      <WorkflowTable rows={rows} emptyMessage={emptyMessage} />
    </section>
  )
}

function SummaryStat({
  label,
  value,
  tone = 'slate',
}: {
  label: string
  value: number
  tone?: 'slate' | 'emerald' | 'amber'
}) {
  const toneClass =
    tone === 'emerald'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : tone === 'amber'
        ? 'border-amber-200 bg-amber-50 text-amber-700'
        : 'border-slate-200 bg-white text-slate-700'

  return (
    <div className={`rounded-lg border px-4 py-3 ${toneClass}`}>
      <p className="text-xs font-medium">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  )
}
