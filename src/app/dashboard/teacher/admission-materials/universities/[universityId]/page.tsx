import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import DashboardBackLink from '@/components/dashboard/DashboardBackLink'
import ProgramList from '@/components/dashboard/university-policy/ProgramList'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { requireAuthForDashboard } from '@/lib/auth'
import {
  fetchProgramsByUniversity,
  fetchUniversity,
  fetchActiveCutByProgram,
  fetchActiveFormulaByProgram,
} from '@/lib/university-policy/data'

export const metadata: Metadata = {
  title: '모집단위 목록 | 입시 자료 아카이브',
}

const TEACHER_UNIVERSITY_BASE = '/dashboard/teacher/admission-materials/universities'

interface UniversityDetailPageProps {
  params: Promise<{ universityId: string }>
}

export default async function UniversityDetailPage({ params }: UniversityDetailPageProps) {
  const { universityId } = await params
  await requireAuthForDashboard(['teacher', 'manager'])

  const university = fetchUniversity(universityId)
  if (!university) notFound()

  const programs = fetchProgramsByUniversity(universityId)
  const rows = programs.map((program) => ({
    program,
    formula: fetchActiveFormulaByProgram(program.key),
    cut: fetchActiveCutByProgram(program.key),
  }))

  return (
    <section className="space-y-6">
      <DashboardBackLink
        fallbackHref="/dashboard/teacher/admission-materials"
        label="대학 목록으로 돌아가기"
      />

      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-slate-900">{university.name}</h1>
        <p className="text-sm text-slate-500">
          {university.shortName ? `${university.shortName} · ` : ''}
          {university.region ?? ''}
        </p>
        {university.notes ? (
          <p className="text-xs text-slate-500">{university.notes}</p>
        ) : null}
      </header>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-slate-900">
            모집단위 ({programs.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ProgramList
            universityId={universityId}
            rows={rows}
            basePath={TEACHER_UNIVERSITY_BASE}
          />
        </CardContent>
      </Card>
    </section>
  )
}
