import Link from "next/link"

import type { ValueAnalysisFilters as FiltersData } from "@/lib/value-analysis"
import { Button } from "@/components/ui/button"

interface ValueAnalysisFiltersProps {
  basePath: string
  filters: FiltersData
  currentClassId: string | null
  currentGenreId: string | null
  currentStudentName: string | null
  currentTitle: string | null
  featuredOnly: boolean
}

export function ValueAnalysisFilters({
  basePath,
  filters,
  currentClassId,
  currentGenreId,
  currentStudentName,
  currentTitle,
  featuredOnly,
}: ValueAnalysisFiltersProps) {
  const hasActiveFilters = Boolean(
    currentClassId ||
      currentGenreId ||
      currentStudentName ||
      currentTitle ||
      featuredOnly
  )

  return (
    <form
      method="get"
      action={basePath}
      className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-2 text-sm text-slate-600">
          <span className="font-medium text-slate-800">반</span>
          <select
            name="class"
            defaultValue={currentClassId ?? ""}
            className="w-full rounded-md border border-slate-300 bg-white p-2 text-sm"
          >
            <option value="">전체</option>
            {filters.classes.map((cls) => (
              <option key={cls.id} value={cls.id}>
                {cls.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-2 text-sm text-slate-600">
          <span className="font-medium text-slate-800">장르</span>
          <select
            name="genre"
            defaultValue={currentGenreId ?? ""}
            className="w-full rounded-md border border-slate-300 bg-white p-2 text-sm"
          >
            <option value="">전체</option>
            {filters.genres.map((genre) => (
              <option key={genre.id} value={genre.id}>
                {genre.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-2 text-sm text-slate-600">
          <span className="font-medium text-slate-800">이름</span>
          <input
            type="text"
            name="student"
            defaultValue={currentStudentName ?? ""}
            placeholder="학생 이름 검색"
            className="w-full rounded-md border border-slate-300 bg-white p-2 text-sm"
          />
        </label>

        <label className="flex flex-col gap-2 text-sm text-slate-600">
          <span className="font-medium text-slate-800">제목</span>
          <input
            type="text"
            name="title"
            defaultValue={currentTitle ?? ""}
            placeholder="제목 검색"
            className="w-full rounded-md border border-slate-300 bg-white p-2 text-sm"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            name="featured"
            value="1"
            defaultChecked={featuredOnly}
          />
          <span className="font-medium text-slate-800">추천만 보기</span>
        </label>

        <div className="ml-auto flex items-center gap-2">
          <Button type="submit" size="sm">
            필터 적용
          </Button>
          {hasActiveFilters ? (
            <Button asChild type="button" variant="ghost" size="sm">
              <Link href={basePath}>필터 초기화</Link>
            </Button>
          ) : null}
        </div>
      </div>
    </form>
  )
}
