'use client'

import { useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'

interface WorkbookFiltersProps {
  subjects: readonly string[]
  activeSubjects: string[]
  searchQuery: string
}

export default function WorkbookFilters({
  subjects,
  activeSubjects,
  searchQuery,
}: WorkbookFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [subjectState, setSubjectState] = useState(new Set(activeSubjects))
  const [query, setQuery] = useState(searchQuery)

  const hasFilters = subjectState.size > 0 || query.trim().length > 0

  const applyFilters = (nextSubjects: Set<string>, nextQuery: string) => {
    const params = new URLSearchParams(searchParams.toString())

    params.delete('subject')
    params.delete('q')

    nextSubjects.forEach((value) => params.append('subject', value))

    if (nextQuery.trim()) {
      params.set('q', nextQuery.trim())
    }

    router.push(`/dashboard/workbooks${params.toString() ? `?${params.toString()}` : ''}`)
  }

  const clearFilters = () => {
    setSubjectState(new Set())
    setQuery('')
    applyFilters(new Set(), '')
  }

  const selectedSubjectBadges = useMemo(
    () => Array.from(subjectState).map((subject) => (
      <Badge key={subject} variant="secondary" className="text-xs">
        {subject}
      </Badge>
    )),
    [subjectState]
  )

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium text-slate-800">필터</p>
          <div className="flex flex-wrap gap-2 text-xs text-slate-500">
            {selectedSubjectBadges}
            {query && <Badge variant="outline">검색: {query}</Badge>}
            {!hasFilters && <span>현재 적용된 필터가 없습니다.</span>}
          </div>
        </div>
        {hasFilters && (
          <button
            type="button"
            className="text-xs font-medium text-slate-500 underline-offset-4 hover:text-slate-700 hover:underline"
            onClick={clearFilters}
          >
            필터 초기화
          </button>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase text-slate-500">과목</p>
        <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
          {subjects.map((subject) => (
            <label key={subject} className="flex items-center gap-2 text-sm text-slate-600">
              <Checkbox
                checked={subjectState.has(subject)}
                onChange={() => {
                  const next = new Set(subjectState)
                  if (next.has(subject)) {
                    next.delete(subject)
                  } else {
                    next.add(subject)
                  }
                  setSubjectState(next)
                  applyFilters(next, query)
                }}
              />
              {subject}
            </label>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex-1">
          <Input
            placeholder="제목, 태그, 주차를 검색..."
            value={query}
            onChange={(event) => {
              const nextQuery = event.target.value
              setQuery(nextQuery)
              applyFilters(subjectState, nextQuery)
            }}
          />
        </div>
      </div>
    </div>
  )
}
