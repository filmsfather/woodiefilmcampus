'use client'

import { useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'

interface WorkbookFiltersProps {
  subjects: readonly string[]
  types: readonly string[]
  activeSubjects: string[]
  activeTypes: string[]
  searchQuery: string
}

export default function WorkbookFilters({
  subjects,
  types,
  activeSubjects,
  activeTypes,
  searchQuery,
}: WorkbookFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [subjectState, setSubjectState] = useState(new Set(activeSubjects))
  const [typeState, setTypeState] = useState(new Set(activeTypes))
  const [query, setQuery] = useState(searchQuery)

  const hasFilters = subjectState.size > 0 || typeState.size > 0 || query.trim().length > 0

  const handleToggle = (value: string, kind: 'subject' | 'type') => {
    setState((prev) => {
      const next = new Set(prev)
      if (next.has(value)) {
        next.delete(value)
      } else {
        next.add(value)
      }
      return next
    }, kind)
  }

  const setState = (updater: (prev: Set<string>) => Set<string>, kind: 'subject' | 'type') => {
    if (kind === 'subject') {
      setSubjectState((prev) => updater(prev))
    } else {
      setTypeState((prev) => updater(prev))
    }
  }

  const applyFilters = () => {
    const params = new URLSearchParams(searchParams.toString())

    params.delete('subject')
    params.delete('type')
    params.delete('q')

    subjectState.forEach((value) => params.append('subject', value))
    typeState.forEach((value) => params.append('type', value))

    if (query.trim()) {
      params.set('q', query.trim())
    }

    router.push(`/dashboard/workbooks?${params.toString()}`)
  }

  const clearFilters = () => {
    setSubjectState(new Set())
    setTypeState(new Set())
    setQuery('')

    const params = new URLSearchParams(searchParams.toString())
    params.delete('subject')
    params.delete('type')
    params.delete('q')

    router.push(`/dashboard/workbooks${params.toString() ? `?${params.toString()}` : ''}`)
  }

  const selectedSubjectBadges = useMemo(
    () => Array.from(subjectState).map((subject) => (
      <Badge key={subject} variant="secondary" className="text-xs">
        {subject}
      </Badge>
    )),
    [subjectState]
  )

  const selectedTypeBadges = useMemo(
    () => Array.from(typeState).map((type) => (
      <Badge key={type} variant="outline" className="text-xs">
        {type}
      </Badge>
    )),
    [typeState]
  )

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium text-slate-800">필터</p>
          <div className="flex flex-wrap gap-2 text-xs text-slate-500">
            {selectedSubjectBadges}
            {selectedTypeBadges}
            {query && <Badge variant="outline">검색: {query}</Badge>}
            {!hasFilters && <span>현재 적용된 필터가 없습니다.</span>}
          </div>
        </div>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            필터 초기화
          </Button>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase text-slate-500">과목</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {subjects.map((subject) => (
              <label key={subject} className="flex items-center gap-2 text-sm text-slate-600">
                <Checkbox
                  checked={subjectState.has(subject)}
                  onChange={() => handleToggle(subject, 'subject')}
                />
                {subject}
              </label>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase text-slate-500">유형</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {types.map((type) => (
              <label key={type} className="flex items-center gap-2 text-sm text-slate-600">
                <Checkbox checked={typeState.has(type)} onChange={() => handleToggle(type, 'type')} />
                {type.toUpperCase()}
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex-1">
          <Input
            placeholder="제목, 태그, 주차를 검색..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={clearFilters} disabled={!hasFilters}>
            초기화
          </Button>
          <Button onClick={applyFilters}>적용</Button>
        </div>
      </div>
    </div>
  )
}
