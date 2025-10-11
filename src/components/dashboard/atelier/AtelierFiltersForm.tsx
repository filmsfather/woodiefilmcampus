import Link from 'next/link'

import type { AtelierFilters } from '@/lib/atelier-posts'
import { Button } from '@/components/ui/button'

const WEEK_NONE_VALUE = '__none__'
const CLASS_NONE_VALUE = '__none__'

interface AtelierFiltersFormProps {
  basePath: string
  filters: AtelierFilters
  currentWeekLabel: string | null
  currentClassId: string | null
  featuredOnly: boolean
}

function mapWeekValue(value: string | null): string {
  if (value === null) {
    return ''
  }
  if (value === '') {
    return WEEK_NONE_VALUE
  }
  return value
}

function mapClassValue(value: string | null): string {
  if (value === null) {
    return ''
  }
  if (value === '') {
    return CLASS_NONE_VALUE
  }
  return value
}

export function AtelierFiltersForm({
  basePath,
  filters,
  currentWeekLabel,
  currentClassId,
  featuredOnly,
}: AtelierFiltersFormProps) {
  const hasActiveFilters = Boolean(
    (currentWeekLabel && currentWeekLabel.length > 0) ||
      currentWeekLabel === '' ||
      (currentClassId && currentClassId.length > 0) ||
      currentClassId === '' ||
      featuredOnly
  )

  return (
    <form
      method="get"
      action={basePath}
      className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div className="grid gap-4 md:grid-cols-4">
        <label className="flex flex-col gap-2 text-sm text-slate-600">
          <span className="font-medium text-slate-800">주차</span>
          <select
            name="week"
            defaultValue={mapWeekValue(currentWeekLabel)}
            className="w-full rounded-md border border-slate-300 bg-white p-2 text-sm"
          >
            <option value="">전체</option>
            {filters.weekLabels.map((label) => (
              <option key={label} value={label}>
                {label}
              </option>
            ))}
            {filters.hasWeeklessWeekLabel ? (
              <option value={WEEK_NONE_VALUE}>주차 미지정</option>
            ) : null}
          </select>
        </label>

        <label className="flex flex-col gap-2 text-sm text-slate-600">
          <span className="font-medium text-slate-800">반</span>
          <select
            name="class"
            defaultValue={mapClassValue(currentClassId)}
            className="w-full rounded-md border border-slate-300 bg-white p-2 text-sm"
          >
            <option value="">전체</option>
            {filters.classes.map((cls) => (
              <option key={cls.id} value={cls.id}>
                {cls.name}
              </option>
            ))}
            {filters.includesUnassignedClass ? (
              <option value={CLASS_NONE_VALUE}>미지정</option>
            ) : null}
          </select>
        </label>

        <label className="flex items-center gap-2 text-sm text-slate-600">
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
