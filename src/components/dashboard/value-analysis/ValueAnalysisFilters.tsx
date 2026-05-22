"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { Check, ChevronDown, X } from "lucide-react"

import type { ValueAnalysisFilters as FiltersData } from "@/lib/value-analysis"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"

interface ValueAnalysisFiltersProps {
  basePath: string
  filters: FiltersData
  currentClassIds: string[]
  currentGenreId: string | null
  currentStudentName: string | null
  currentTitle: string | null
  featuredOnly: boolean
}

export function ValueAnalysisFilters({
  basePath,
  filters,
  currentClassIds,
  currentGenreId,
  currentStudentName,
  currentTitle,
  featuredOnly,
}: ValueAnalysisFiltersProps) {
  const [selectedClassIds, setSelectedClassIds] =
    useState<string[]>(currentClassIds)
  const [open, setOpen] = useState(false)

  const classMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const cls of filters.classes) {
      map.set(cls.id, cls.name)
    }
    return map
  }, [filters.classes])

  const hasActiveFilters = Boolean(
    selectedClassIds.length > 0 ||
      currentGenreId ||
      currentStudentName ||
      currentTitle ||
      featuredOnly
  )

  const toggleClass = (id: string) => {
    setSelectedClassIds((prev) =>
      prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]
    )
  }

  const selectAllClasses = () => {
    setSelectedClassIds(filters.classes.map((cls) => cls.id))
  }

  const clearClasses = () => {
    setSelectedClassIds([])
  }

  const triggerLabel =
    selectedClassIds.length === 0
      ? "전체"
      : selectedClassIds.length <= 2
        ? selectedClassIds
            .map((id) => classMap.get(id) ?? id)
            .join(", ")
        : `${classMap.get(selectedClassIds[0]) ?? selectedClassIds[0]} 외 ${selectedClassIds.length - 1}개`

  return (
    <form
      method="get"
      action={basePath}
      className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-2 text-sm text-slate-600">
          <span className="font-medium text-slate-800">반</span>
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-md border border-slate-300 bg-white p-2 text-left text-sm",
                  "hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary/40"
                )}
                aria-haspopup="listbox"
                aria-expanded={open}
              >
                <span
                  className={cn(
                    "truncate",
                    selectedClassIds.length === 0 && "text-slate-500"
                  )}
                >
                  {triggerLabel}
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              className="w-72 max-w-[min(20rem,calc(100vw-2rem))] p-0"
            >
              <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2 text-xs text-slate-500">
                <span>
                  {selectedClassIds.length > 0
                    ? `${selectedClassIds.length}개 선택`
                    : "전체"}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={selectAllClasses}
                    className="rounded px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
                  >
                    전체 선택
                  </button>
                  <button
                    type="button"
                    onClick={clearClasses}
                    className="rounded px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
                  >
                    초기화
                  </button>
                </div>
              </div>
              <ul
                role="listbox"
                aria-multiselectable="true"
                className="max-h-72 overflow-y-auto py-1"
              >
                {filters.classes.length === 0 ? (
                  <li className="px-3 py-2 text-sm text-slate-500">
                    등록된 반이 없습니다.
                  </li>
                ) : (
                  filters.classes.map((cls) => {
                    const selected = selectedClassIds.includes(cls.id)
                    return (
                      <li key={cls.id}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={selected}
                          onClick={() => toggleClass(cls.id)}
                          className={cn(
                            "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm",
                            selected
                              ? "bg-primary/10 text-slate-900"
                              : "text-slate-700 hover:bg-slate-100"
                          )}
                        >
                          <span className="truncate">{cls.name}</span>
                          {selected ? (
                            <Check className="h-4 w-4 text-primary" />
                          ) : null}
                        </button>
                      </li>
                    )
                  })
                )}
              </ul>
            </PopoverContent>
          </Popover>

          {selectedClassIds.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {selectedClassIds.map((id) => (
                <span
                  key={id}
                  className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700"
                >
                  {classMap.get(id) ?? id}
                  <button
                    type="button"
                    onClick={() => toggleClass(id)}
                    className="rounded-full p-0.5 text-slate-500 hover:bg-slate-200"
                    aria-label={`${classMap.get(id) ?? id} 선택 해제`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          ) : null}

          {selectedClassIds.map((id) => (
            <input key={id} type="hidden" name="class" value={id} />
          ))}
        </div>

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
