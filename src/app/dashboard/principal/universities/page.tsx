import type { Metadata } from 'next'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import UniversityList from '@/components/dashboard/university-policy/UniversityList'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { requireAuthForDashboard } from '@/lib/auth'
import {
  fetchAllProgramsWithPolicy,
  fetchUniversities,
} from '@/lib/university-policy/data'

export const metadata: Metadata = {
  title: '산식·컷 카탈로그 | 지원가능대학 분석',
  description: '대학·모집단위·반영 산식·입시 컷 프리셋을 열람합니다 (읽기 전용).',
}

export default async function UniversitiesIndexPage() {
  await requireAuthForDashboard('principal')

  const universities = fetchUniversities()
  const allPrograms = fetchAllProgramsWithPolicy()
  const programCounts = allPrograms.reduce<Record<string, number>>((acc, row) => {
    acc[row.program.universityId] = (acc[row.program.universityId] ?? 0) + 1
    return acc
  }, {})

  return (
    <section className="space-y-6">
      <DashboardBackLink fallbackHref="/dashboard/principal" label="원장 대시보드로 돌아가기" />

      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-slate-900">산식·컷 카탈로그 (읽기 전용)</h1>
        <p className="text-sm text-slate-600">
          대학·모집단위·반영 산식·입시 결과 컷은 모두{' '}
          <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">src/lib/university-policy/presets/</code>{' '}
          코드 프리셋에서 관리됩니다. 이 페이지에서는 등록 현황만 확인하고, 모집단위별로 산식 계산이 정확한지
          학생 데이터로 검증할 수 있습니다.
        </p>
      </header>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-slate-900">
            등록된 대학 ({universities.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <UniversityList universities={universities} programCounts={programCounts} />
        </CardContent>
      </Card>
    </section>
  )
}
