'use client'

import { useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

import { ChevronDown, X } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

interface Author {
  id: string
  name: string
}

interface WorkbookFiltersProps {
  subjects: readonly string[]
  activeSubjects: string[]
  authors: Author[]
  activeAuthors: string[]
  searchQuery: string
}

export default function WorkbookFilters({
  subjects,
  activeSubjects,
  authors,
  activeAuthors,
  searchQuery,
}: WorkbookFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [subjectState, setSubjectState] = useState(new Set(activeSubjects))
  const [authorState, setAuthorState] = useState(new Set(activeAuthors))
  const [query, setQuery] = useState(searchQuery)

  const hasFilters = subjectState.size > 0 || authorState.size > 0 || query.trim().length > 0

  const applyFilters = (nextSubjects: Set<string>, nextAuthors: Set<string>, nextQuery: string) => {
    const params = new URLSearchParams(searchParams.toString())

    params.delete('subject')
    params.delete('author')
    params.delete('q')

    nextSubjects.forEach((value) => params.append('subject', value))
    nextAuthors.forEach((value) => params.append('author', value))

    if (nextQuery.trim()) {
      params.set('q', nextQuery.trim())
    }

    router.push(`/dashboard/workbooks${params.toString() ? `?${params.toString()}` : ''}`)
  }

  const clearFilters = () => {
    setSubjectState(new Set())
    setAuthorState(new Set())
    setQuery('')
    applyFilters(new Set(), new Set(), '')
  }

  const authorNameMap = useMemo(
    () => new Map(authors.map((a) => [a.id, a.name])),
    [authors]
  )

  const selectedSubjectBadges = useMemo(
    () => Array.from(subjectState).map((subject) => (
      <Badge key={subject} variant="secondary" className="text-xs">
        {subject}
      </Badge>
    )),
    [subjectState]
  )

  const selectedAuthorBadges = useMemo(
    () => Array.from(authorState).map((id) => (
      <Badge key={id} variant="secondary" className="text-xs">
        {authorNameMap.get(id) ?? id}
      </Badge>
    )),
    [authorState, authorNameMap]
  )

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium text-slate-800">필터</p>
          <div className="flex flex-wrap gap-2 text-xs text-slate-500">
            {selectedSubjectBadges}
            {selectedAuthorBadges}
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
                  applyFilters(next, authorState, query)
                }}
              />
              {subject}
            </label>
          ))}
        </div>
      </div>

      {authors.length > 0 && (
        <div className="flex items-center gap-3">
          <p className="shrink-0 text-xs font-semibold uppercase text-slate-500">작성자</p>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5 font-normal">
                {authorState.size > 0
                  ? `${authorState.size}명 선택됨`
                  : "전체 작성자"}
                <ChevronDown className="size-3.5 text-slate-400" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-56 p-2">
              <div className="max-h-60 space-y-1 overflow-y-auto">
                {authors.map((author) => (
                  <label
                    key={author.id}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-100"
                  >
                    <Checkbox
                      checked={authorState.has(author.id)}
                      onChange={() => {
                        const next = new Set(authorState)
                        if (next.has(author.id)) {
                          next.delete(author.id)
                        } else {
                          next.add(author.id)
                        }
                        setAuthorState(next)
                        applyFilters(subjectState, next, query)
                      }}
                    />
                    {author.name}
                  </label>
                ))}
              </div>
              {authorState.size > 0 && (
                <button
                  type="button"
                  className="mt-1 flex w-full items-center justify-center gap-1 rounded-md border-t border-slate-100 pt-2 text-xs text-slate-500 hover:text-slate-700"
                  onClick={() => {
                    setAuthorState(new Set())
                    applyFilters(subjectState, new Set(), query)
                  }}
                >
                  <X className="size-3" />
                  선택 초기화
                </button>
              )}
            </PopoverContent>
          </Popover>
          {authorState.size > 0 && (
            <div className="flex flex-wrap gap-1">
              {Array.from(authorState).map((id) => (
                <Badge
                  key={id}
                  variant="secondary"
                  className="cursor-pointer gap-1 text-xs"
                  onClick={() => {
                    const next = new Set(authorState)
                    next.delete(id)
                    setAuthorState(next)
                    applyFilters(subjectState, next, query)
                  }}
                >
                  {authorNameMap.get(id) ?? id}
                  <X className="size-3" />
                </Badge>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex-1">
          <Input
            placeholder="제목, 태그, 주차를 검색..."
            value={query}
            onChange={(event) => {
              const nextQuery = event.target.value
              setQuery(nextQuery)
              applyFilters(subjectState, authorState, nextQuery)
            }}
          />
        </div>
      </div>
    </div>
  )
}
