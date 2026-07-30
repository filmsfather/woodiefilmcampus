import Link from 'next/link'

import type { WorksheetFilters } from '@/lib/worksheet-posts'
import { Button } from '@/components/ui/button'

const WEEK_NONE_VALUE = '__none__'
const CLASS_NONE_VALUE = '__none__'

interface WorksheetFiltersFormProps {
  basePath: string
  filters: WorksheetFilters
  currentWeekLabel: string | null
  currentClassId: string | null
  featuredOnly: boolean
  currentStudentName: string | null
}

function mapNullableValue(value: string | null, noneToken: string): string {
  if (value === null) {
    return ''
  }

  if (value === '') {
    return noneToken
  }

  return value
}

export function WorksheetFiltersForm({
  basePath,
  filters,
  currentWeekLabel,
  currentClassId,
  featuredOnly,
  currentStudentName,
}: WorksheetFiltersFormProps) {
  const hasActiveFilters = Boolean(
    currentWeekLabel !== null ||
      currentClassId !== null ||
      featuredOnly ||
      (currentStudentName && currentStudentName.length > 0)
  )

  return (
    <form
      method="get"
      action={basePath}
      className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-2 text-sm text-slate-600">
          <span className="font-medium text-slate-800">주차</span>
          <select
            name="week"
            defaultValue={mapNullableValue(currentWeekLabel, WEEK_NONE_VALUE)}
            className="w-full rounded-md border border-slate-300 bg-white p-2 text-sm"
          >
            <option value="">전체</option>
            {filters.weekLabels.map((label) => (
              <option key={label} value={label}>
                {label}
              </option>
            ))}
            {filters.hasWeeklessWeekLabel ? <option value={WEEK_NONE_VALUE}>주차 미지정</option> : null}
          </select>
        </label>

        <label className="flex flex-col gap-2 text-sm text-slate-600">
          <span className="font-medium text-slate-800">반</span>
          <select
            name="class"
            defaultValue={mapNullableValue(currentClassId, CLASS_NONE_VALUE)}
            className="w-full rounded-md border border-slate-300 bg-white p-2 text-sm"
          >
            <option value="">전체</option>
            {filters.classes.map((cls) => (
              <option key={cls.id} value={cls.id}>
                {cls.name}
              </option>
            ))}
            {filters.includesUnassignedClass ? <option value={CLASS_NONE_VALUE}>미지정</option> : null}
          </select>
        </label>

        <label className="flex flex-col gap-2 text-sm text-slate-600">
          <span className="font-medium text-slate-800">학생 이름</span>
          <input
            type="text"
            name="student"
            defaultValue={currentStudentName ?? ''}
            placeholder="이름 검색"
            className="w-full rounded-md border border-slate-300 bg-white p-2 text-sm"
          />
        </label>

        <label className="flex items-center gap-2 text-sm text-slate-600 md:mt-6">
          <input type="checkbox" name="featured" value="1" defaultChecked={featuredOnly} />
          <span className="font-medium text-slate-800">추천만 보기</span>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm">
          필터 적용
        </Button>
        {hasActiveFilters ? (
          <Button asChild type="button" variant="ghost" size="sm">
            <Link href={basePath}>필터 초기화</Link>
          </Button>
        ) : null}
      </div>
    </form>
  )
}

export const FILTER_VALUE = {
  WEEK_NONE: WEEK_NONE_VALUE,
  CLASS_NONE: CLASS_NONE_VALUE,
}
