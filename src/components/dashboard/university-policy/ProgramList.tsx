import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import type { ProgramWithPolicy } from '@/lib/university-policy/presets'

interface ProgramListProps {
  universityId: string
  rows: ProgramWithPolicy[]
  basePath?: string
}

export default function ProgramList({
  universityId,
  rows,
  basePath = '/dashboard/principal/universities',
}: ProgramListProps) {
  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
        이 대학에 등록된 모집단위가 없습니다.{' '}
        <code>src/lib/university-policy/presets/programs.ts</code>에 추가해주세요.
      </div>
    )
  }

  return (
    <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
      {rows.map(({ program, formula, cut }) => (
        <li key={program.key}>
          <Link
            href={`${basePath}/${universityId}/programs/${program.key}`}
            className="flex items-center justify-between gap-3 px-4 py-3 transition hover:bg-slate-50 sm:px-6"
          >
            <div className="min-w-0 space-y-1">
              <p className="truncate text-sm font-medium text-slate-900">
                {program.year}학년도 · {program.admissionTrack}
              </p>
              <p className="truncate text-sm text-slate-700">{program.name}</p>
              <p className="text-xs text-slate-500">
                {program.recruitCount != null ? `모집 ${program.recruitCount}명 · ` : ''}
                {program.totalScore != null ? `학생부 ${program.totalScore}점` : '학생부 점수 미입력'}
              </p>
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                {formula ? (
                  <Badge className={formula.isDraft ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-700'}>
                    산식 v{formula.version}
                    {formula.isDraft ? ' (검증 필요)' : ''}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-slate-500">산식 미등록</Badge>
                )}
                {cut ? (
                  <Badge className="bg-sky-100 text-sky-700">컷 v{cut.version} · {cut.points.length}점</Badge>
                ) : (
                  <Badge variant="outline" className="text-slate-500">컷 미등록</Badge>
                )}
              </div>
            </div>
            <ChevronRight className="size-4 text-slate-400" />
          </Link>
        </li>
      ))}
    </ul>
  )
}
