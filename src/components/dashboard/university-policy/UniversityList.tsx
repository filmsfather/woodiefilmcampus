import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

import type { UniversityPreset } from '@/lib/university-policy/presets'

interface UniversityListProps {
  universities: UniversityPreset[]
  programCounts?: Record<string, number>
}

export default function UniversityList({
  universities,
  programCounts,
}: UniversityListProps) {
  if (universities.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
        등록된 대학이 없습니다. <code>src/lib/university-policy/presets/universities.ts</code>에 추가해주세요.
      </div>
    )
  }

  return (
    <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
      {universities.map((u) => {
        const count = programCounts?.[u.id] ?? 0
        return (
          <li key={u.id}>
            <Link
              href={`/dashboard/principal/universities/${u.id}`}
              className="flex items-center justify-between gap-3 px-4 py-3 transition hover:bg-slate-50 sm:px-6"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900">
                  {u.name}
                  {u.shortName ? <span className="ml-2 text-xs text-slate-400">({u.shortName})</span> : null}
                </p>
                <p className="text-xs text-slate-500">
                  {u.region ?? ''}
                  {u.region ? ' · ' : ''}모집단위 {count}개
                </p>
              </div>
              <ChevronRight className="size-4 text-slate-400" />
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
