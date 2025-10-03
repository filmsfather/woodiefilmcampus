'use client'

import type { FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface ClassesToolbarProps {
  searchValue: string
  onSearchChange: (value: string) => void
  onSearchSubmit: () => void
  onResetSearch: () => void
  onCreate: () => void
}

export function ClassesToolbar({
  searchValue,
  onSearchChange,
  onSearchSubmit,
  onResetSearch,
  onCreate,
}: ClassesToolbarProps) {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onSearchSubmit()
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-3 sm:flex-row sm:items-center"
      >
        <div className="flex flex-1 items-center gap-2">
          <Input
            name="search"
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="반 이름, 담당 교사, 학생 이름으로 검색"
            className="flex-1"
            autoComplete="off"
          />
          <Button type="submit" variant="secondary">
            검색
          </Button>
          {searchValue && (
            <Button type="button" variant="ghost" onClick={onResetSearch}>
              초기화
            </Button>
          )}
        </div>
        <Button type="button" onClick={onCreate} className="w-full sm:w-auto">
          새 반 만들기
        </Button>
      </form>
      <p className="text-sm text-slate-500">
        담임을 포함한 담당 교사와 학생 배정을 한 곳에서 관리할 수 있습니다.
      </p>
    </div>
  )
}
